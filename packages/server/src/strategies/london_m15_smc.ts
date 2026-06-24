import { OHLC, fetchMarketData } from "../services/data_engine.js";
import { detectFVG, analyzeStructure, calculateATR } from "./smc_strategy.js";
import { systemState, getCurrentKillzone } from "../services/engine.js";

// Helper to determine Asia Session High/Low (roughly UTC 00:00 to 06:00)
function getAsiaSessionRange(m15Candles: OHLC[]) {
  let asiaHigh = -Infinity;
  let asiaLow = Infinity;
  let foundAsiaData = false;

  for (const c of m15Candles) {
    const d = new Date(c.timestamp);
    const utcHour = d.getUTCHours();

    // Accumulate highs/lows for candles forming in the Asia window (0 to 6 UTC)
    // Adjust this if you want a strictly tighter window like 0 to 4 UTC
    if (utcHour >= 0 && utcHour < 7) {
      foundAsiaData = true;
      if (c.high > asiaHigh) asiaHigh = c.high;
      if (c.low < asiaLow) asiaLow = c.low;
    }
  }

  if (!foundAsiaData) return null;
  return { asiaHigh, asiaLow };
}

function detectAsiaSweepAndChoch(
  m15Candles: OHLC[],
  asiaHigh: number,
  asiaLow: number,
  h1Bias: string,
) {
  if (m15Candles.length < 5) return null;

  // We look at the last few candles to see if a sweep just happened
  // A sweep is when price wicks past the Asia range but closes back inside, or momentum shifts immediately after
  const recentCandles = m15Candles.slice(-10); // Look at last 10 M15 candles

  let sweepType: "BULLISH_SWEEP" | "BEARISH_SWEEP" | "NONE" = "NONE";
  let chochValid = false;

  const structure = analyzeStructure(m15Candles);

  // Bullish Scenario: Sweep Asia Low, H1 is Bullish
  if (h1Bias === "BULLISH") {
    let swept = false;
    for (const rc of recentCandles) {
      // Price dipped below Asia low at some point
      if (rc.low <= asiaLow && rc.close > asiaLow) {
        swept = true;
        break;
      }
    }
    if (swept) {
      sweepType = "BULLISH_SWEEP";
      if (structure.lastSweep?.type === "BULLISH_SWEEP" || structure.trend === "BULLISH") {
        chochValid = true;
      }
    }
  }

  // Bearish Scenario: Sweep Asia High, H1 is Bearish
  if (h1Bias === "BEARISH") {
    let swept = false;
    for (const rc of recentCandles) {
      // Price spiked above Asia high at some point
      if (rc.high >= asiaHigh && rc.close < asiaHigh) {
        swept = true;
        break;
      }
    }
    if (swept) {
      sweepType = "BEARISH_SWEEP";
      if (structure.lastSweep?.type === "BEARISH_SWEEP" || structure.trend === "BEARISH") {
        chochValid = true;
      }
    }
  }

  return {
    sweepType,
    chochValid,
    structure,
  };
}

export async function runLondonM15SMC(symbol: string) {
  // Only applies to EUR/USD or XAU/USD natively via prompt
  const isValidSymbol =
    symbol.includes("EURUSD") ||
    symbol === "EUR=X" ||
    symbol.includes("XAU") ||
    symbol.includes("GC=F");
  if (!isValidSymbol) return null;

  const strategyKey = `london_m15_smc_${symbol}`;

  if (!systemState.strategies) systemState.strategies = {};
  if (!systemState.strategies[strategyKey]) {
    systemState.strategies[strategyKey] = {
      name: "London M15 SMC",
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
      step3_AsiaRange: "AWAITING",
      step4_LiquiditySweep: "AWAITING",
      step5_StructureShift: "AWAITING",
      step6_RetestZone: "AWAITING",
      entryValidity: false,
    };

    if (
      killzone !== "LONDON KILLZONE" &&
      !systemState.autotrade?.ignoreKillzoneForTesting
    ) {
      state.debugAudit.lastReasonRejected = "OUTSIDE_LONDON_SESSION";
      state.setupState.step1_Killzone = "REJECTED (OUTSIDE_LONDON)";
      return null;
    }

    const h1Candles = await fetchMarketData(symbol, "H1", 100);
    const m15Candles = await fetchMarketData(symbol, "M15", 150);

    if (h1Candles.length < 50 || m15Candles.length < 50) {
      state.debugAudit.lastReasonRejected = "INSUFFICIENT_DATA";
      return null;
    }

    // H1 Top-Down Trend
    const h1Structure = analyzeStructure(h1Candles);
    const h1Bias = h1Structure.trend;
    state.setupState.step2_HTFBias = h1Bias;

    if (h1Bias === "NEUTRAL") {
      state.debugAudit.lastReasonRejected = "NO_HTF_BIAS";
      state.setupState.step2_HTFBias = "REJECTED (NEUTRAL)";
      return null;
    }

    // Identify Asia Liquidity Target Locations
    const asiaRange = getAsiaSessionRange(m15Candles);
    if (!asiaRange) {
      state.debugAudit.lastReasonRejected = "NO_ASIA_RANGE_DATA";
      state.setupState.step3_AsiaRange = "REJECTED (NO_DATA)";
      return null;
    }

    state.setupState.step3_AsiaRange = `H:${asiaRange.asiaHigh.toFixed(2)} L:${asiaRange.asiaLow.toFixed(2)}`;

    // Sweeps & CHoCH
    const sweepInfo = detectAsiaSweepAndChoch(
      m15Candles,
      asiaRange.asiaHigh,
      asiaRange.asiaLow,
      h1Bias,
    );
    if (!sweepInfo) {
      state.debugAudit.lastReasonRejected = "NO_SWEEP_DATA";
      state.setupState.step4_LiquiditySweep = "REJECTED (NO_DATA)";
      return null;
    }

    state.setupState.step4_LiquiditySweep = sweepInfo.sweepType;
    state.setupState.step5_StructureShift = sweepInfo.chochValid ? "YES" : "NO";

    if (sweepInfo.sweepType === "NONE") {
      state.debugAudit.lastReasonRejected = "NO_ASIA_SWEEP";
      state.setupState.step4_LiquiditySweep = "REJECTED (NONE)";
      return null;
    }

    if (!sweepInfo.chochValid) {
      state.debugAudit.lastReasonRejected = "WAITING_FOR_M15_CHOCH";
      state.setupState.step5_StructureShift = "REJECTED (WAITING_CHOCH)";
      return null;
    }

    // FVG Check (Order Block Substitute logic for SMC entry)
    const currentFvg = detectFVG(m15Candles);
    state.setupState.step6_RetestZone = currentFvg ? currentFvg.type : "NONE";

    const fvgValid =
      (sweepInfo.sweepType === "BULLISH_SWEEP" &&
        currentFvg?.type === "BULLISH") ||
      (sweepInfo.sweepType === "BEARISH_SWEEP" &&
        currentFvg?.type === "BEARISH");

    if (!fvgValid) {
      state.debugAudit.lastReasonRejected = "NO_FVG_OB_PULLBACK";
      state.setupState.step6_RetestZone = "REJECTED (NO_PULLBACK)";
      return null;
    }

    state.setupState.entryValidity = true;
    state.status = "SIGNAL_READY";

    const m15Atr = calculateATR(m15Candles, 14);
    const currM15Atr = m15Atr;

    const currentPrice = m15Candles[m15Candles.length - 1].close;

    let signal: "BUY" | "SELL" | null = null;

    if (sweepInfo.sweepType === "BULLISH_SWEEP") {
      signal = "BUY";
    } else if (sweepInfo.sweepType === "BEARISH_SWEEP") {
      signal = "SELL";
    }

    if (!signal) {
      return null;
    }

    // RR logic for M15 Scalp.
    const atrMult = 2; // a bit wider SL for M15
    const slDist = currM15Atr * atrMult;

    const sl = signal === "BUY" ? currentPrice - slDist : currentPrice + slDist;
    const tp1 =
      signal === "BUY" ? currentPrice + slDist * 2 : currentPrice - slDist * 2; // 1:2 strict minimum
    const tp2 =
      signal === "BUY" ? currentPrice + slDist * 3 : currentPrice - slDist * 3;
    const tp3 =
      signal === "BUY" ? currentPrice + slDist * 5 : currentPrice - slDist * 5;

    return {
      strategy: "London M15 SMC",
      signal,
      entryPrice: currentPrice,
      stopLoss: sl,
      tp1,
      tp2,
      tp3,
      atr: currM15Atr,
    };
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
