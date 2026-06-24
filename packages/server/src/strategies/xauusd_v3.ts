import { OHLC, fetchMarketData } from "../../services/data_engine.js";
import { calculateEMA, calculateRSI, calculateATR } from "../../indicators.js";
import { detectFVG, analyzeStructure } from "../smc_strategy.js";
import { systemState, getCurrentKillzone } from "../../services/engine.js";

export async function runXauUsdSMCV3(symbol: string = "XAU/USD") {
  const strategyKey = `smc_v3_${symbol}`;
  if (!systemState.strategies) systemState.strategies = {};
  if (!systemState.strategies[strategyKey]) {
    systemState.strategies[strategyKey] = {
      name: `SMC Scalping V3`,
      strategyId: strategyKey,
      enabled: true,
      status: "OFF",
      marketFilter: {},
      setupState: {},
      tradeManagement: {},
      performance: {
        dailyTrades: 0,
        wins: 0,
        losses: 0,
        winrate: 0,
        dailyPnl: 0,
      },
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
      step3_LiquiditySweep: "AWAITING",
      step4_StructureShift: "AWAITING",
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

    // Fetch H4, H1 and M5 data
    const h4Candles = await fetchMarketData(symbol, "H4", 205);
    const h1Candles = await fetchMarketData(symbol, "H1", 205);
    const m5Candles = await fetchMarketData(symbol, "M5", 205);

    if (
      h4Candles.length < 200 ||
      h1Candles.length < 200 ||
      m5Candles.length < 200
    ) {
      state.debugAudit.lastReasonRejected = "INSUFFICIENT_DATA";
      return null;
    }

    // Indicators on H4 & H1
    const h4Structure = analyzeStructure(h4Candles);
    const h1Structure = analyzeStructure(h1Candles);

    const h1Closes = h1Candles.map((c: any) => c.close);
    const h1Ema50 = calculateEMA(h1Closes, 50);
    const currH1Ema50 = h1Ema50[h1Ema50.length - 1];
    const currH1Price = h1Closes[h1Closes.length - 1];

    // HTF Bias evaluation (H4 & H1 alignment)
    let htfBias: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";

    if (
      (h4Structure.trend === "BULLISH" && h1Structure.trend === "BULLISH") ||
      (h1Structure.trend === "BULLISH" && currH1Price > currH1Ema50)
    ) {
      htfBias = "BULLISH";
    } else if (
      (h4Structure.trend === "BEARISH" && h1Structure.trend === "BEARISH") ||
      (h1Structure.trend === "BEARISH" && currH1Price < currH1Ema50)
    ) {
      htfBias = "BEARISH";
    }

    state.setupState.step2_HTFBias = htfBias;

    const m5Closes = m5Candles.map((c: any) => c.close);
    const m5Ema20 = calculateEMA(m5Closes, 20);
    const m5Ema50 = calculateEMA(m5Closes, 50);
    const m5Rsi = calculateRSI(m5Closes, 14);
    const m5Atr = calculateATR(m5Candles, 14);

    const currM5Ema20 = m5Ema20[m5Ema20.length - 1];
    const currM5Ema50 = m5Ema50[m5Ema50.length - 1];
    const currM5Rsi = m5Rsi[m5Rsi.length - 1];
    const currM5Atr = m5Atr[m5Atr.length - 1];

    state.marketFilter.volatilityState = currM5Atr > 1.5 ? "HIGH" : "LOW";

    if (htfBias === "NEUTRAL") {
      state.debugAudit.lastReasonRejected = "NO_HTF_BIAS";
      state.setupState.step2_HTFBias = "REJECTED (NEUTRAL)";
      return null;
    }

    // Step 3: Liquidity Sweep
    const m5Structure = analyzeStructure(m5Candles);
    const sweepType = m5Structure.lastSweep
      ? m5Structure.lastSweep.type
      : "NONE";
    state.setupState.step3_LiquiditySweep = sweepType;

    const rsiValid = currM5Rsi >= 20 && currM5Rsi <= 80;
    if (!rsiValid || sweepType === "NONE") {
      state.debugAudit.lastReasonRejected =
        sweepType === "NONE" ? "NO_LIQUIDITY_SWEEP" : "RSI_NOT_IN_ZONE";
      state.setupState.step3_LiquiditySweep = sweepType === "NONE" ? "REJECTED (NONE)" : "REJECTED (RSI OUTSIDE)";
      return null;
    }

    if (
      (htfBias === "BULLISH" && sweepType !== "BULLISH_SWEEP") ||
      (htfBias === "BEARISH" && sweepType !== "BEARISH_SWEEP")
    ) {
      state.debugAudit.lastReasonRejected = "SWEEP_DIRECTION_MISMATCH";
      state.setupState.step3_LiquiditySweep = "REJECTED (MISMATCH)";
      return null;
    }

    // Step 4: Structure Shift
    let structureShiftType: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';

    if (m5Structure.lastSweep?.type === 'BULLISH_SWEEP') {
        structureShiftType = 'BULLISH';
    } else if (m5Structure.lastSweep?.type === 'BEARISH_SWEEP') {
        structureShiftType = 'BEARISH';
    } else if (m5Structure.bos_validation === 'VALID') {
        if (m5Structure.trend === 'BULLISH') {
            structureShiftType = 'BULLISH';
        } else if (m5Structure.trend === 'BEARISH') {
            structureShiftType = 'BEARISH';
        }
    }

    state.setupState.step4_StructureShift = structureShiftType;

    if (structureShiftType === "NONE") {
      state.debugAudit.lastReasonRejected = "NO_CHOCH_BOS";
      state.setupState.step4_StructureShift = "REJECTED (NONE)";
      return null;
    }

    if (
      (htfBias === "BULLISH" && structureShiftType !== "BULLISH") ||
      (htfBias === "BEARISH" && structureShiftType !== "BEARISH")
    ) {
      state.debugAudit.lastReasonRejected = "STRUCTURE_DIRECTION_MISMATCH";
      state.setupState.step4_StructureShift = "REJECTED (MISMATCH)";
      return null;
    }

    // Step 5: Retest Zone (FVG)
    const fvg = detectFVG(m5Candles);
    const fvgType = fvg ? fvg.type : "NONE";
    state.setupState.step5_RetestZone = fvgType;

    if (
      fvgType === "NONE" ||
      (htfBias === "BULLISH" && fvgType !== "BULLISH") ||
      (htfBias === "BEARISH" && fvgType !== "BEARISH")
    ) {
      state.debugAudit.lastReasonRejected = "NO_RETEST_ZONE";
      state.setupState.step5_RetestZone = "REJECTED (NONE/MISMATCH)";
      return null;
    }

    // Entry Validity
    let signal: "BUY" | "SELL" | null = null;
    if (htfBias === "BULLISH") signal = "BUY";
    if (htfBias === "BEARISH") signal = "SELL";

    state.setupState.entryValidity = !!signal;
    state.debugAudit.lastExecutionTime = new Date().toISOString();

    if (signal) {
      state.status = "SIGNAL_READY";
      const currentPrice = m5Closes[m5Closes.length - 1];
      state.debugAudit.lastSignal = signal;

      const atrBuffer = currM5Atr * 1.5;
      const stopLoss =
        signal === "BUY" ? currentPrice - atrBuffer : currentPrice + atrBuffer;
      const diff = Math.abs(currentPrice - stopLoss);

      const tp1RR = 1.7;
      const tp2RR = 2.5;
      const tp3RR = 4.0;

      state.tradeManagement = {
        entryPrice: currentPrice,
        stopLoss: stopLoss,
        tp1:
          signal === "BUY"
            ? currentPrice + diff * tp1RR
            : currentPrice - diff * tp1RR,
        tp2:
          signal === "BUY"
            ? currentPrice + diff * tp2RR
            : currentPrice - diff * tp2RR,
        tp3:
          signal === "BUY"
            ? currentPrice + diff * tp3RR
            : currentPrice - diff * tp3RR,
        riskPct: 0.5,
        rrRatio: tp1RR,
        breakevenState: false,
      };

      return {
        strategy: "XAUUSD SMC Scalping V3",
        signal,
        entryPrice: currentPrice,
        stopLoss,
        tp1: state.tradeManagement.tp1,
        tp2: state.tradeManagement.tp2,
        tp3: state.tradeManagement.tp3,
      };
    }

    return null;
  } catch (err: any) {
    state.status = "ERROR";
    state.debugAudit.lastReasonRejected = `ERROR: ${err.message}`;
    return null;
  } finally {
    if (state.status === "SCANNING") {
      state.status = "MONITORING";
    }
  }
}
