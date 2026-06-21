import { OHLC, fetchMarketData } from "../data_engine.js";
import {
  analyzeStructure,
  detectFVG,
  validateEntry,
  calculateATR,
} from "../smc_strategy.js";
import { systemState, getCurrentKillzone } from "../engine.js";

function calculateDynamicATRMultiplier(
  atr: number,
  structure: any,
  fvgType: any,
): number {
  let multiplier = 1.5; // Base case for scalping

  // Increase SL space if market is ranging/neutral to avoid being chopped out
  if (structure && structure.trend === "NEUTRAL") {
    multiplier += 0.3;
  }

  // Slightly widen SL if not trading within an FVG confirmation
  if (!fvgType) {
    multiplier += 0.2;
  }

  // Cap risk
  if (multiplier > 2.5) multiplier = 2.5;

  return multiplier;
}

export async function runSMCV1(symbol: string, m5Candles: OHLC[]) {
  const strategyKey = `smc_scalping_v1_${symbol}`;

  if (!systemState.strategies) systemState.strategies = {};
  if (!systemState.strategies[strategyKey]) {
    systemState.strategies[strategyKey] = {
      name: "SMC Scalping V1",
      strategyId: strategyKey,
      enabled: true,
      status: "OFF",
      setupState: {},
      debugAudit: {},
    };
  }

  const state = systemState.strategies[strategyKey];
  if (!state.enabled) return null;

  try {
    state.status = "SCANNING";

    const killzone = getCurrentKillzone();
    state.setupState = {
      step1_Killzone: killzone,
      step2_HTFBias: "AWAITING",
      step3_StructureM5: "AWAITING",
      step4_LiquiditySweep: "AWAITING",
      step5_RetestZone: "AWAITING",
      entryValidity: false,
    };

    if (
      killzone === "OUTSIDE_KILLZONE" &&
      !systemState.autotrade?.ignoreKillzoneForTesting
    ) {
      state.debugAudit.lastReasonRejected = "OUTSIDE_KILLZONE";
      state.setupState.step1_Killzone = "REJECTED (OUTSIDE_KILLZONE)";
      return null;
    }

    let htfBiasObj = { trend: "NEUTRAL", source: "M5" };
    try {
      const h4Can = await fetchMarketData(symbol, "H4", 60);
      const h1Can = await fetchMarketData(symbol, "H1", 60);
      const h4Str = analyzeStructure(h4Can);
      const h1Str = analyzeStructure(h1Can);

      if (h4Str.trend !== "NEUTRAL" && h4Str.trend === h1Str.trend) {
        htfBiasObj = { trend: h4Str.trend, source: "H4+H1" };
      } else if (h1Str.trend !== "NEUTRAL") {
        htfBiasObj = { trend: h1Str.trend, source: "H1" };
      }
    } catch (e: any) {
      state.debugAudit.lastReasonRejected = `HTF Data Error: ${e.message}`;
      // Continue with neutral to let it fail later if we truly need it
    }

    const structure = analyzeStructure(m5Candles);
    const currentFvg = detectFVG(m5Candles);

    if (htfBiasObj.trend === "NEUTRAL") {
      state.setupState.step2_HTFBias = "REJECTED (NEUTRAL)";
      state.debugAudit.lastReasonRejected = "NO_HTF_BIAS";
      return null;
    } else {
      state.setupState.step2_HTFBias = `${htfBiasObj.trend} (${htfBiasObj.source})`;
    }

    if (structure.trend === "NEUTRAL") {
       state.setupState.step3_StructureM5 = "REJECTED (NEUTRAL)";
       state.debugAudit.lastReasonRejected = "NO_CLEAR_TREND";
       return null;
    }

    state.setupState.step3_StructureM5 = structure.trend;

    if (!structure.lastSweep || structure.lastSweep.type === "NONE") {
       state.setupState.step4_LiquiditySweep = "REJECTED (NONE)";
       state.debugAudit.lastReasonRejected = "NO_SWEEP";
       return null;
    }

    state.setupState.step4_LiquiditySweep = structure.lastSweep.type;

    if (!currentFvg) {
       state.setupState.step5_RetestZone = "REJECTED (NONE)";
       state.debugAudit.lastReasonRejected = "NO_FVG";
       return null;
    }

    state.setupState.step5_RetestZone = currentFvg.type;

    const standardResult = validateEntry(m5Candles, structure, currentFvg);

    // Override or enhance standard result bias check with HTF if M5 is weak
    if (standardResult.checklist) {
      if (
        standardResult.checklist.bias === "NEUTRAL" &&
        htfBiasObj.trend !== "NEUTRAL"
      ) {
        standardResult.checklist.bias = htfBiasObj.trend;
      }
    }

    state.setupState.entryValidity = standardResult.signalType !== null;
    if (state.setupState.entryValidity) {
      state.status = "SIGNAL_READY";
    }

    state.debugAudit.lastReasonRejected =
      standardResult.signalType === null ? "Waiting for SMC Condition" : "";

    if (standardResult.signalType) {
      const entryPrice = m5Candles[m5Candles.length - 1].close;
      const atr = calculateATR(m5Candles, 14);

      let conf = 50;
      if (standardResult.signalType.structureState?.trend !== "NEUTRAL")
        conf += 15;
      if (standardResult.signalType.fvg) conf += 15;

      const atrMult = calculateDynamicATRMultiplier(
        atr,
        structure,
        currentFvg?.type,
      );
      const slOffset = atr * atrMult;

      const tp1RR = 2.0;
      const tp2RR = 3.5;
      const tp3RR = 5.0;

      const sl =
        standardResult.signalType.type === "BUY"
          ? entryPrice - slOffset
          : entryPrice + slOffset;
      const tp1 =
        standardResult.signalType.type === "BUY"
          ? entryPrice + slOffset * tp1RR
          : entryPrice - slOffset * tp1RR;
      const tp2 =
        standardResult.signalType.type === "BUY"
          ? entryPrice + slOffset * tp2RR
          : entryPrice - slOffset * tp2RR;
      const tp3 =
        standardResult.signalType.type === "BUY"
          ? entryPrice + slOffset * tp3RR
          : entryPrice - slOffset * tp3RR;

      return {
        strategy: state.name,
        signal: standardResult.signalType.type,
        entryPrice,
        stopLoss: sl,
        tp1,
        tp2,
        tp3,
        confidence: conf,
        atr,
        atrMultiplier: atrMult,
        htfBias:
          htfBiasObj.trend !== "NEUTRAL" ? htfBiasObj.trend : structure.trend,
      };
    }

    return null;
  } catch (err: any) {
    state.status = "ERROR";
    state.debugAudit.lastReasonRejected = err.message;
    return null;
  } finally {
    if (state.status === "SCANNING") {
      state.status = "MONITORING";
    }
  }
}
