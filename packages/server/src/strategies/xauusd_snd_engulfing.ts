import { OHLC, fetchMarketData } from "../../services/data_engine.js";
import { calculateSMA, calculateATR } from "../../indicators.js";
import { analyzeStructure, detectFVG } from "../smc_strategy.js";
import { systemState, getCurrentKillzone } from "../../services/engine.js";

// Helper to find areas of interest on H1
function findSnDAreas(candles: OHLC[], trend: "UPTREND" | "DOWNTREND") {
  // simplified: we look for recent FVGs and structural breaks that align with trend
  // In real implementation we'd look for Order Blocks and RBR/DBD.
  // Order Block is the last opposite candle before a strong move that breaks structure and leaves FVG.
  const areas = [];
  const structure = analyzeStructure(candles);
  const fvg = detectFVG(candles);

  if (fvg) {
    if (trend === "UPTREND" && fvg.type === "BULLISH") {
      const obCandle = candles[candles.length - 4]; // rough approximation of OB
      if (obCandle && obCandle.close < obCandle.open) {
        areas.push({
          type: "DEMAND",
          top: Math.max(obCandle.open, obCandle.high),
          bottom: Math.min(obCandle.close, obCandle.low),
          active: true,
        });
      }
    } else if (trend === "DOWNTREND" && fvg.type === "BEARISH") {
      const obCandle = candles[candles.length - 4];
      if (obCandle && obCandle.close > obCandle.open) {
        areas.push({
          type: "SUPPLY",
          top: Math.max(obCandle.close, obCandle.high),
          bottom: Math.min(obCandle.open, obCandle.low),
          active: true,
        });
      }
    }
  }

  return areas;
}

// Helper for Engulfing detection
function detectEngulfing(candles: OHLC[]): {
  type: "BULLISH" | "BEARISH";
  prevBodyTop: number;
  prevBodyBottom: number;
  swingLow: number;
  swingHigh: number;
} | null {
  if (candles.length < 3) return null;
  const curr = candles[candles.length - 1]; // or closed candle if checking live? Assuming these are closed.
  const prev = candles[candles.length - 2];

  const prevIsRed = prev.close < prev.open;
  const currIsGreen = curr.close > curr.open;

  // Bullish Engulfing: Prev red, current green, current body engulfs prev body
  const isBullishEngulfing =
    prevIsRed &&
    currIsGreen &&
    curr.close > prev.open &&
    curr.open <= prev.close;

  // Bearish Engulfing: Prev green, current red, current body engulfs prev body
  const prevIsGreen = prev.close > prev.open;
  const currIsRed = curr.close < curr.open;
  const isBearishEngulfing =
    prevIsGreen &&
    currIsRed &&
    curr.close < prev.open &&
    curr.open >= prev.close;

  if (isBullishEngulfing) {
    // Strict check: current close > previous high (to avoid weak engulfing as user requested)
    if (curr.close > prev.high) {
      const swingLow = Math.min(prev.low, curr.low);
      return {
        type: "BULLISH",
        prevBodyTop: prev.open,
        prevBodyBottom: prev.close,
        swingLow,
        swingHigh: Math.max(prev.high, curr.high),
      };
    }
  }

  if (isBearishEngulfing) {
    if (curr.close < prev.low) {
      const swingHigh = Math.max(prev.high, curr.high);
      return {
        type: "BEARISH",
        prevBodyTop: prev.close,
        prevBodyBottom: prev.open,
        swingLow: Math.min(prev.low, curr.low),
        swingHigh,
      };
    }
  }

  return null;
}

export async function runXauUsdSnDEngulfing(
  symbolFetch: string = "GC=F",
  symbolDisp: string = "XAUUSD",
) {
  const strategyKey = `snd_engulfing_${symbolFetch}`;

  if (!systemState.strategies) systemState.strategies = {};
  if (!systemState.strategies[strategyKey]) {
    systemState.strategies[strategyKey] = {
      name: "SnD Engulfing Setup",
      strategyId: strategyKey,
      enabled: true,
      status: "OFF",
      setupState: {
        step1_Killzone: "AWAITING",
        step2_TrendH1: "AWAITING",
        step3_SndArea: "AWAITING",
        step4_ZoneTest: "AWAITING",
        step5_Engulfing: "AWAITING",
        entryValidity: false,
      },
      debugAudit: {},
    };
  }

  const state = systemState.strategies[strategyKey];
  if (!state.enabled) return null;

  try {
    const killzone = getCurrentKillzone();
    state.status = "SCANNING";
    state.setupState = {
      step1_Killzone: killzone,
      step2_TrendH1: "AWAITING",
      step3_SndArea: "AWAITING",
      step4_ZoneTest: "AWAITING",
      step5_Engulfing: "AWAITING",
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

    const h1Candles = await fetchMarketData(symbolFetch, "H1", 250);
    const m5Candles = await fetchMarketData(symbolFetch, "M5", 100);

    if (h1Candles.length < 200 || m5Candles.length < 50) {
      state.debugAudit.lastReasonRejected = "INSUFFICIENT_DATA";
      return null;
    }

    const closesH1 = h1Candles.map((c: any) => c.close);
    const ma50 = calculateSMA(closesH1, 50);
    const ma200 = calculateSMA(closesH1, 200);

    const currMa50 = ma50[ma50.length - 1] || 0;
    const currMa200 = ma200[ma200.length - 1] || 0;

    let trend: "UPTREND" | "DOWNTREND" | "SIDEWAYS" = "SIDEWAYS";
    if (currMa50 > currMa200) trend = "UPTREND";
    else if (currMa50 < currMa200) trend = "DOWNTREND";

    state.setupState.step2_TrendH1 = trend;

    if (trend === "SIDEWAYS") {
      state.debugAudit.lastReasonRejected = "NO_CLEAR_TREND";
      state.setupState.step2_TrendH1 = "REJECTED (SIDEWAYS)";
      return null;
    }

    const areas = findSnDAreas(h1Candles, trend);
    if (areas.length === 0) {
      state.setupState.step3_SndArea = "REJECTED (NONE)";
      state.debugAudit.lastReasonRejected = "NO_VALID_SND_AREA";
      return null;
    }

    state.setupState.step3_SndArea = `${areas.length} Area(s) Detected`;

    const currentPrice = m5Candles[m5Candles.length - 1].close;
    const activeArea = areas.find(
      (a) => currentPrice <= a.top && currentPrice >= a.bottom,
    );

    if (!activeArea) {
      state.setupState.step4_ZoneTest = "REJECTED (OUTSIDE)";
      state.debugAudit.lastReasonRejected = "PRICE_NOT_IN_SND_ZONE";
      return null;
    }

    state.setupState.step4_ZoneTest = "INSIDE_ZONE";

    const engulfing = detectEngulfing(m5Candles);
    if (!engulfing) {
      state.setupState.step5_Engulfing = "REJECTED (NONE)";
      state.debugAudit.lastReasonRejected = "WAITING_FOR_ENGULFING";
      return null;
    }

    if (trend === "UPTREND" && engulfing.type !== "BULLISH") {
      state.setupState.step5_Engulfing = "REJECTED (WAITING_BULLISH)";
      state.debugAudit.lastReasonRejected = "WAITING_BULLISH_ENGULFING";
      return null;
    }

    if (trend === "DOWNTREND" && engulfing.type !== "BEARISH") {
      state.setupState.step5_Engulfing = "REJECTED (WAITING_BEARISH)";
      state.debugAudit.lastReasonRejected = "WAITING_BEARISH_ENGULFING";
      return null;
    }

    state.setupState.step5_Engulfing = engulfing.type;
    state.setupState.entryValidity = true;
    state.status = "SIGNAL_READY";

    const atrArray = calculateATR(m5Candles, 14);
    const atr = atrArray[atrArray.length - 1] || 0;
    const spread = 0.5; // Estimated spread for XAUUSD

    let signalType: "BUY" | "SELL" | null = null;
    let entryPrice = 0;
    let stopLoss = 0;

    if (trend === "UPTREND") {
      signalType = "BUY";
      // Buy limit at red candle body (open or close) + spread. Red candle open is highest part of body.
      entryPrice = engulfing.prevBodyTop + spread;
      stopLoss = engulfing.swingLow - 0.5 * atr;
    } else {
      signalType = "SELL";
      // Sell limit at green candle body (open or close) + spread. Green candle close is highest part of body.
      entryPrice = engulfing.prevBodyTop + spread;
      stopLoss = engulfing.swingHigh + 0.5 * atr + spread;
    }

    const risk = Math.abs(entryPrice - stopLoss);

    // Target Minimum RR 1:2
    const tp1 =
      signalType === "BUY" ? entryPrice + risk * 2 : entryPrice - risk * 2;
    const tp2 =
      signalType === "BUY" ? entryPrice + risk * 3 : entryPrice - risk * 3;
    const tp3 =
      signalType === "BUY" ? entryPrice + risk * 5 : entryPrice - risk * 5;

    return {
      strategy: state.name,
      signal: signalType,
      entryPrice,
      stopLoss,
      tp1,
      tp2,
      tp3,
      confidence: 85,
      atr: atr,
      atrMultiplier: 0.5,
      htfBias: trend,
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
