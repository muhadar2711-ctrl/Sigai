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

/**
 * Pertajam deteksi Liquidity Sweep (Anticipating market_structure.md & liquidity.md)
 * Wajib konfirmasi WICK melampaui Swing, tapi BODY CLOSE kembali ke dalam range.
 */
export function detectLiquiditySweep(
  candles: OHLC[],
  swings: { type: "HIGH" | "LOW"; value: number; index: number }[],
) {
  if (candles.length < 5 || swings.length === 0) return null;
  const current = candles[candles.length - 1];

  // Audit 10 swing terakhir
  for (let i = swings.length - 1; i >= Math.max(0, swings.length - 10); i--) {
    const swing = swings[i];
    
    // BEARISH SWEEP: High melampaui Swing High, tapi Close di bawah Swing High (Rejection)
    if (swing.type === "HIGH") {
      if (current.high > swing.value && current.close < swing.value) {
        return {
          type: "BEARISH_SWEEP",
          evidence: {
            swingPrice: swing.value,
            wickHigh: current.high,
            bodyClose: current.close,
            sweepDistancePips: (current.high - swing.value) * 10
          },
          candleIndex: candles.length - 1,
        };
      }
    } 
    // BULLISH SWEEP: Low melampaui Swing Low, tapi Close di atas Swing Low (Rejection)
    else if (swing.type === "LOW") {
      if (current.low < swing.value && current.close > swing.value) {
        return {
          type: "BULLISH_SWEEP",
          evidence: {
            swingPrice: swing.value,
            wickLow: current.low,
            bodyClose: current.close,
            sweepDistancePips: (swing.value - current.low) * 10
          },
          candleIndex: candles.length - 1,
        };
      }
    }
  }
  return null;
}

/**
 * Perbaikan analyzeStructure: Membedakan Swing Structure (Major) vs Internal Structure (Minor)
 */
export function analyzeStructure(candles: OHLC[]) {
  const allSwings = <{ type: "HIGH" | "LOW"; value: number; index: number }[]>[];
  for (let i = 2; i < candles.length - 2; i++) {
    const swing = detectSwing(candles, i);
    if (swing) allSwings.push(swing);
  }

  // Filter Swing Structure (Major) berdasarkan signifikansi pergerakan (Contoh: minimal 5 pips)
  const swingStructure = allSwings.filter((s, idx, arr) => {
    if (idx === 0) return true;
    const prev = arr[idx - 1];
    return Math.abs(s.value - prev.value) * 10 > 5;
  });

  const highs = swingStructure.filter((s) => s.type === "HIGH");
  const lows = swingStructure.filter((s) => s.type === "LOW");

  let lastSwingHigh = highs[highs.length - 1];
  let prevSwingHigh = highs[highs.length - 2];
  let lastSwingLow = lows[lows.length - 1];
  let prevSwingLow = lows[lows.length - 2];

  let trend: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let scoreBull = 0;
  let scoreBear = 0;

  // Analisa Swing Structure (Major)
  if (lastSwingHigh && prevSwingHigh && lastSwingLow && prevSwingLow) {
    if (lastSwingHigh.value > prevSwingHigh.value && lastSwingLow.value > prevSwingLow.value) scoreBull += 3;
    else if (lastSwingHigh.value < prevSwingHigh.value && lastSwingLow.value < prevSwingLow.value) scoreBear += 3;
  }

  // Analisa Internal Structure (Trend jangka pendek)
  const latestClose = candles[candles.length - 1]?.close || 0;
  if (candles.length > 20) {
    const sum20 = candles.slice(-20).reduce((a, b) => a + b.close, 0);
    const sma20 = sum20 / 20;
    if (latestClose > sma20) scoreBull += 1;
    else scoreBear += 1;
  }

  if (scoreBull >= 3) trend = "BULLISH";
  else if (scoreBear >= 3) trend = "BEARISH";

  const lastSweep = detectLiquiditySweep(candles, swingStructure);

  return {
    trend,
    lastSwingHigh,
    lastSwingLow,
    swingStructureCount: swingStructure.length,
    score: { bull: scoreBull, bear: scoreBear },
    lastSweep,
  };
}

/**
 * Perbaikan detectFVG: Validasi ukuran relatif terhadap ATR (Mencegah Noise)
 */
export function detectFVG(candles: OHLC[]) {
  if (candles.length < 4) return null;
  const atr = calculateATR(candles, 14);
  const minFvgSize = atr * 0.15; // FVG wajib minimal 15% dari ATR

  const lookback = Math.min(candles.length - 1, 20);

  for (let i = candles.length - 1; i >= candles.length - lookback; i--) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1]; // Expansion candle
    const c3 = candles[i];

    if (!c1 || !c2 || !c3) continue;

    // Bullish FVG
    const bullGap = c3.low - c1.high;
    if (bullGap > minFvgSize) {
      let mitigated = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= c1.high) mitigated = true;
      }
      if (!mitigated) {
        return {
          type: "BULLISH",
          high: c3.low,
          low: c1.high,
          mid: (c3.low + c1.high) / 2,
          sizePips: bullGap * 10
        };
      }
    }

    // Bearish FVG
    const bearGap = c1.low - c3.high;
    if (bearGap > minFvgSize) {
      let mitigated = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high >= c1.low) mitigated = true;
      }
      if (!mitigated) {
        return {
          type: "BEARISH",
          high: c1.low,
          low: c3.high,
          mid: (c1.low + c3.high) / 2,
          sizePips: bearGap * 10
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

/**
 * Perbaikan validateEntry: Strict Premium/Discount Zone
 * Jangan BUY di Premium (Mahal), Jangan SELL di Discount (Murah).
 */
export function validateEntry(candles: OHLC[], structureState: any, fvg: any) {
  const currentPrice = candles[candles.length - 1].close;
  
  const evidence = {
    bias: structureState.trend,
    lastSweep: structureState.lastSweep ? structureState.lastSweep.type : null,
    fvg: fvg ? fvg.type : null,
    zone: "NEUTRAL",
    fib50: 0
  };

  if (!structureState.lastSwingHigh || !structureState.lastSwingLow) {
    return { signalType: null, checklist: evidence };
  }

  const fib = calculateFibonacci(structureState.lastSwingLow.value, structureState.lastSwingHigh.value);
  evidence.fib50 = fib.fib50;

  // Penentuan Zone
  if (currentPrice < fib.fib50) evidence.zone = "DISCOUNT";
  else if (currentPrice > fib.fib50) evidence.zone = "PREMIUM";

  let signalType: "BUY" | "SELL" | null = null;

  // RULE: BUY hanya di DISCOUNT
  if (
    evidence.bias === "BULLISH" && 
    evidence.fvg === "BULLISH" && 
    evidence.lastSweep === "BULLISH_SWEEP" &&
    evidence.zone === "DISCOUNT"
  ) {
    signalType = "BUY";
  }

  // RULE: SELL hanya di PREMIUM
  if (
    evidence.bias === "BEARISH" && 
    evidence.fvg === "BEARISH" && 
    evidence.lastSweep === "BEARISH_SWEEP" &&
    evidence.zone === "PREMIUM"
  ) {
    signalType = "SELL";
  }

  return {
    signalType: signalType ? { 
      type: signalType, 
      price: currentPrice, 
      fvg, 
      evidence,
      riskLevel: "CONSERVATIVE" 
    } : null,
    checklist: evidence,
  };
}
