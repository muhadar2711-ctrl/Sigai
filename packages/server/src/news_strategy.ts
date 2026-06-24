import { OHLC } from "./data_engine.js";
import { calculateATR, calculateFibonacci, detectFVG } from "./smc_strategy.js";

interface NewsChecklist {
  volatilitySpike: boolean;
  fvg: string | null;
  liquiditySweep: boolean;
}

export function validateNewsEntry(
  candles: OHLC[],
  atrMultiplierThreshold: number = 2.0,
) {
  // During news, we look for extreme volatility.
  // We identify a "Judas Swing" (liquidity sweep in one direction) followed by an FVG in the other direction.

  const currentPrice = candles[candles.length - 1].close;

  // Calculate average ATR from the past (excluding the last 2 candles which might be the news spike)
  const baseCandles = candles.slice(0, candles.length - 2);
  const baseATR = calculateATR(baseCandles, 14);

  // Measure recent volatility (last 3 candles)
  const recentCandles = candles.slice(-3);
  let maxRange = 0;
  for (const c of recentCandles) {
    const range = c.high - c.low;
    if (range > maxRange) maxRange = range;
  }

  const volatilitySpike = maxRange > baseATR * atrMultiplierThreshold;

  const fvg = detectFVG(candles);

  const checklist: NewsChecklist = {
    volatilitySpike,
    fvg: fvg ? fvg.type : null,
    liquiditySweep: false, // Detect if the spike swept a recent low/high
  };

  // Find recent high/low before the spike
  let prevHigh = -Infinity;
  let prevLow = Infinity;
  for (const c of baseCandles.slice(-20)) {
    if (c.high > prevHigh) prevHigh = c.high;
    if (c.low < prevLow) prevLow = c.low;
  }

  // Detect sweep: did the recent candles pierce the prevHigh/prevLow?
  let sweptHigh = false;
  let sweptLow = false;
  for (const c of recentCandles) {
    if (c.high > prevHigh) sweptHigh = true;
    if (c.low < prevLow) sweptLow = true;
  }

  if (sweptHigh || sweptLow) {
    checklist.liquiditySweep = true;
  }

  let signalType: "BUY" | "SELL" | null = null;
  const entryPrice = currentPrice;

  // Logic:
  // If we swept a HIGH, and now have a BEARISH FVG, and huge volatility -> SELL
  if (checklist.volatilitySpike && sweptHigh && checklist.fvg === "BEARISH") {
    signalType = "SELL";
  }
  // If we swept a LOW, and now have a BULLISH FVG, and huge volatility -> BUY
  else if (
    checklist.volatilitySpike &&
    sweptLow &&
    checklist.fvg === "BULLISH"
  ) {
    signalType = "BUY";
  }

  return {
    signalType: signalType
      ? { type: signalType, price: entryPrice, fvg }
      : null,
    checklist,
    baseATR,
  };
}
