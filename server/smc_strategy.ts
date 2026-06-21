import { OHLC } from "./data_engine.js";

// Returns High if Swing High, Low if Swing Low, else null
export function detectSwing(
  candles: OHLC[],
  index: number,
): { type: "HIGH" | "LOW"; value: number; index: number } | null {
  if (index < 2 || index > candles.length - 3) return null;

  const current = candles[index];
  const p1 = candles[index - 1];
  const p2 = candles[index - 2];
  const n1 = candles[index + 1];
  const n2 = candles[index + 2];

  if (
    current.high > p1.high &&
    current.high > p2.high &&
    current.high > n1.high &&
    current.high > n2.high
  ) {
    return { type: "HIGH", value: current.high, index };
  }

  if (
    current.low < p1.low &&
    current.low < p2.low &&
    current.low < n1.low &&
    current.low < n2.low
  ) {
    return { type: "LOW", value: current.low, index };
  }

  return null;
}

export function detectLiquiditySweep(
  candles: OHLC[],
  swings: { type: "HIGH" | "LOW"; value: number; index: number }[],
) {
  if (candles.length < 5 || swings.length === 0) return null;
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  // Look at recent candles to see if they swept a major swing point
  for (let i = swings.length - 1; i >= Math.max(0, swings.length - 10); i--) {
    const swing = swings[i];
    if (swing.type === "HIGH") {
      // Bearish Sweep: price went above swing high, but closed below it
      if (
        (current.high > swing.value && current.close < swing.value) ||
        (prev.high > swing.value && prev.close < swing.value)
      ) {
        return {
          type: "BEARISH_SWEEP",
          price: swing.value,
          candleIndex:
            current.high > swing.value
              ? candles.length - 1
              : candles.length - 2,
        };
      }
    } else {
      // Bullish Sweep: price went below swing low, but closed above it
      if (
        (current.low < swing.value && current.close > swing.value) ||
        (prev.low < swing.value && prev.close > swing.value)
      ) {
        return {
          type: "BULLISH_SWEEP",
          price: swing.value,
          candleIndex:
            current.low < swing.value ? candles.length - 1 : candles.length - 2,
        };
      }
    }
  }
  return null;
}

export function analyzeStructure(candles: OHLC[]) {
  const swings = <{ type: "HIGH" | "LOW"; value: number; index: number }[]>[];
  for (let i = 2; i < candles.length - 2; i++) {
    const swing = detectSwing(candles, i);
    if (swing) swings.push(swing);
  }

  let trend: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let lastBOS: "BULLISH" | "BEARISH" | null = null;
  let lastCHOCH: "BULLISH" | "BEARISH" | null = null;

  const highs = swings.filter((s) => s.type === "HIGH");
  const lows = swings.filter((s) => s.type === "LOW");

  let lastSwingHigh = highs[highs.length - 1];
  let prevSwingHigh = highs[highs.length - 2];
  let lastSwingLow = lows[lows.length - 1];
  let prevSwingLow = lows[lows.length - 2];

  let scoreBull = 0;
  let scoreBear = 0;

  // Evaluate basic trend from previous swings
  if (lastSwingHigh && prevSwingHigh && lastSwingLow && prevSwingLow) {
    if (
      lastSwingHigh.value > prevSwingHigh.value &&
      lastSwingLow.value > prevSwingLow.value
    ) {
      scoreBull += 2;
    } else if (
      lastSwingHigh.value < prevSwingHigh.value &&
      lastSwingLow.value < prevSwingLow.value
    ) {
      scoreBear += 2;
    } else if (lastSwingHigh.value > prevSwingHigh.value) {
      scoreBull += 1; // Relaxed
    } else if (lastSwingLow.value < prevSwingLow.value) {
      scoreBear += 1; // Relaxed
    }
  }

  const latestClose = candles[candles.length - 1]?.close || 0;

  // Simple EMA estimate
  if (candles.length > 50) {
    const sum50 = candles.slice(-50).reduce((a, b) => a + b.close, 0);
    const ema50 = sum50 / 50;
    if (latestClose > ema50) scoreBull += 1;
    else scoreBear += 1;
  }

  // Simple RSI Estimate (14 period)
  if (candles.length > 15) {
    let gains = 0,
      losses = 0;
    for (let i = candles.length - 14; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    if (rsi < 35)
      scoreBull += 1; // Oversold -> likelihood to bounce up
    else if (rsi > 65)
      scoreBear += 1; // Overbought -> likelihood to bounce down
    else if (rsi > 50) scoreBull += 0.5;
    else if (rsi < 50) scoreBear += 0.5;
  }

  // Structure Event Detection
  if (lastSwingHigh && prevSwingHigh) {
    if (lastSwingHigh.value > prevSwingHigh.value) {
      lastBOS = "BULLISH";
      scoreBull += 1;
    }
  }
  if (lastSwingLow && prevSwingLow) {
    if (lastSwingLow.value < prevSwingLow.value) {
      lastBOS = "BEARISH";
      scoreBear += 1;
    }
  }

  if (
    scoreBear > scoreBull &&
    lastSwingHigh &&
    prevSwingHigh &&
    lastSwingHigh.value > prevSwingHigh.value
  ) {
    lastCHOCH = "BULLISH";
    scoreBull += 2;
  }
  if (
    scoreBull > scoreBear &&
    lastSwingLow &&
    prevSwingLow &&
    lastSwingLow.value < prevSwingLow.value
  ) {
    lastCHOCH = "BEARISH";
    scoreBear += 2;
  }

  if (scoreBull >= 3) trend = "BULLISH";
  else if (scoreBear >= 3) trend = "BEARISH";
  else if (scoreBull > scoreBear)
    trend = "BULLISH"; // Give a bias rather than NEUTRAL if tie broken
  else if (scoreBear > scoreBull) trend = "BEARISH";
  else trend = "NEUTRAL";

  const lastSweep = detectLiquiditySweep(candles, swings);

  return {
    trend,
    lastBOS,
    lastCHOCH,
    lastSwingHigh,
    lastSwingLow,
    swings,
    score: { bull: scoreBull, bear: scoreBear },
    lastSweep,
  };
}

export function detectFVG(candles: OHLC[]) {
  // Looks for the most recent unmitigated FVG in the last 20 candles
  if (candles.length < 4) return null;

  const lookback = Math.min(candles.length - 1, 25);

  for (let i = candles.length - 2; i >= candles.length - lookback; i--) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1]; // Expansion candle
    const c3 = candles[i];

    if (!c1 || !c2 || !c3) continue;

    // Bullish FVG
    if (c1.high < c3.low) {
      let isMitigated = false;
      // Check if price filled the gap after c3
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= c1.high) isMitigated = true;
      }
      if (!isMitigated) {
        return {
          type: "BULLISH",
          high: c3.low,
          low: c1.high,
          mid: (c3.low + c1.high) / 2,
        };
      }
    }

    // Bearish FVG
    if (c1.low > c3.high) {
      let isMitigated = false;
      // Check if price filled the gap after c3
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high >= c1.low) isMitigated = true;
      }
      if (!isMitigated) {
        return {
          type: "BEARISH",
          high: c1.low,
          low: c3.high,
          mid: (c1.low + c3.high) / 2,
        };
      }
    }
  }

  return null;
}

export function calculateATR(candles: OHLC[], period: number = 14) {
  if (candles.length < period + 1) return 0;

  let atr = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );
    atr += tr;
  }
  return atr / period;
}

export function calculateFibonacci(swingLow: number, swingHigh: number) {
  const diff = swingHigh - swingLow;
  return {
    fib0: swingHigh,
    fib100: swingLow,
    fib50: swingHigh - diff * 0.5,
    fib618: swingHigh - diff * 0.618,
  };
}

export function validateEntry(candles: OHLC[], structureState: any, fvg: any) {
  const currentPrice = candles[candles.length - 1].close;

  const checklist = {
    bias: structureState.trend !== "NEUTRAL" ? structureState.trend : null,
    fvg: fvg ? fvg.type : null,
    midpoint: false,
    discountZone: false,
    liquiditySweep: structureState.lastSweep
      ? structureState.lastSweep.type
      : null,
    choch: structureState.lastCHOCH || structureState.lastBOS,
  };

  if (!fvg || !structureState.lastSwingHigh || !structureState.lastSwingLow)
    return { signalType: null, checklist };

  const fib = calculateFibonacci(
    structureState.lastSwingLow.value,
    structureState.lastSwingHigh.value,
  );

  let signalType: "BUY" | "SELL" | null = null;
  let entryPrice = currentPrice;

  const fibDiff =
    structureState.lastSwingHigh.value - structureState.lastSwingLow.value;
  const fib50Bull = structureState.lastSwingLow.value + fibDiff * 0.5;
  const fib50Bear = structureState.lastSwingHigh.value - fibDiff * 0.5;

  if (fvg.type === "BULLISH" && currentPrice <= fvg.high + fibDiff * 0.05)
    checklist.midpoint = true;
  if (fvg.type === "BEARISH" && currentPrice >= fvg.low - fibDiff * 0.05)
    checklist.midpoint = true;

  if (
    structureState.trend === "BULLISH" &&
    currentPrice <= fib50Bull + fibDiff * 0.1
  )
    checklist.discountZone = true;
  if (
    structureState.trend === "BEARISH" &&
    currentPrice >= fib50Bear - fibDiff * 0.1
  )
    checklist.discountZone = true;

  // For scalping, if we have Bias + FVG + Inside FVG/Discount + Liquidity Sweep it is a valid setup.
  if (
    checklist.bias === "BULLISH" &&
    checklist.fvg === "BULLISH" &&
    checklist.liquiditySweep === "BULLISH_SWEEP" &&
    (checklist.midpoint || checklist.discountZone)
  ) {
    signalType = "BUY";
  }

  if (
    checklist.bias === "BEARISH" &&
    checklist.fvg === "BEARISH" &&
    checklist.liquiditySweep === "BEARISH_SWEEP" &&
    (checklist.midpoint || checklist.discountZone)
  ) {
    signalType = "SELL";
  }

  return {
    signalType: signalType
      ? { type: signalType, price: entryPrice, fvg, structureState, fib }
      : null,
    checklist,
  };
}
