import { OHLC } from "../services/data_engine.js";

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
 * REQUIREMENT: Penolakan (wick) minimal 1.5x dari ukuran body candle sebelumnya.
 */
export function detectLiquiditySweep(
  candles: OHLC[],
  swings: { type: "HIGH" | "LOW"; value: number; index: number }[],
) {
  if (candles.length < 5 || swings.length === 0) return null;
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prevBody = Math.abs(prev.open - prev.close);

  // Audit 10 swing terakhir
  for (let i = swings.length - 1; i >= Math.max(0, swings.length - 10); i--) {
    const swing = swings[i];
    
    // BEARISH SWEEP: High melampaui Swing High, tapi Close di bawah Swing High
    if (swing.type === "HIGH") {
      const upperWick = current.high - Math.max(current.open, current.close);
      if (current.high > swing.value && current.close < swing.value && upperWick >= prevBody * 1.5) {
        return {
          type: "BEARISH_SWEEP",
          evidence_found: {
            swingPrice: swing.value,
            wickHigh: current.high,
            bodyClose: current.close,
            upperWickSize: upperWick,
            requiredWick: prevBody * 1.5,
            sweepDistancePips: (current.high - swing.value) * 10
          },
          candleIndex: candles.length - 1,
        };
      }
    } 
    // BULLISH SWEEP: Low melampaui Swing Low, tapi Close di atas Swing Low
    else if (swing.type === "LOW") {
      const lowerWick = Math.min(current.open, current.close) - current.low;
      if (current.low < swing.value && current.close > swing.value && lowerWick >= prevBody * 1.5) {
        return {
          type: "BULLISH_SWEEP",
          evidence_found: {
            swingPrice: swing.value,
            wickLow: current.low,
            bodyClose: current.close,
            lowerWickSize: lowerWick,
            requiredWick: prevBody * 1.5,
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
 * REQUIREMENT: Validasi volume pada Break of Structure (BOS).
 */
export function analyzeStructure(candles: OHLC[]) {
  const allSwings = <{ type: "HIGH" | "LOW"; value: number; index: number }[]>[];
  for (let i = 2; i < candles.length - 2; i++) {
    const swing = detectSwing(candles, i);
    if (swing) allSwings.push(swing);
  }

  // Filter Swing Structure (Major) berdasarkan signifikansi pergerakan
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
  let bosFound = false;
  let bosEvidence: any = null;

  // Analisa Swing Structure (Major) dengan Validasi Volume (BOS)
  if (lastSwingHigh && prevSwingHigh && lastSwingLow && prevSwingLow) {
    const current = candles[candles.length - 1];
    const avgVolume = candles.slice(-20).reduce((a, b) => a + b.volume, 0) / 20;

    // BULLISH BOS
    if (lastSwingHigh.value > prevSwingHigh.value && lastSwingLow.value > prevSwingLow.value) {
      if (current.volume > avgVolume * 1.2) {
        scoreBull += 3;
        bosFound = true;
        bosEvidence = { type: "BULLISH_BOS", vol: current.volume, avg: avgVolume };
      }
    }
    // BEARISH BOS
    else if (lastSwingHigh.value < prevSwingHigh.value && lastSwingLow.value < prevSwingLow.value) {
      if (current.volume > avgVolume * 1.2) {
        scoreBear += 3;
        bosFound = true;
        bosEvidence = { type: "BEARISH_BOS", vol: current.volume, avg: avgVolume };
      }
    }
  }

  // Analisa Internal Structure
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
    bos_validation: bosFound ? "VALID" : "NOT_FOUND/WEAK",
    evidence_found: {
      trend,
      bos: bosEvidence,
      sweep: lastSweep ? lastSweep.evidence_found : null
    }
  };
}

/**
 * Perbaikan detectFVG: Validasi ukuran relatif terhadap ATR (Mencegah Noise)
 * REQUIREMENT: FVG yang sudah terisi > 50% tidak lagi dianggap valid.
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
      let maxFill = 0;
      let mitigated = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].low <= c1.high) mitigated = true;
        // Hitung pengisian fvg
        if (candles[j].low < c3.low) {
           const fill = (c3.low - candles[j].low) / bullGap;
           if (fill > maxFill) maxFill = fill;
        }
      }
      if (!mitigated && maxFill < 0.5) {
        return {
          type: "BULLISH",
          high: c3.low,
          low: c1.high,
          mid: (c3.low + c1.high) / 2,
          sizePips: bullGap * 10,
          fillPct: maxFill * 100,
          evidence_found: { gap: bullGap, fill: maxFill, atr_ref: atr }
        };
      }
    }

    // Bearish FVG
    const bearGap = c1.low - c3.high;
    if (bearGap > minFvgSize) {
      let maxFill = 0;
      let mitigated = false;
      for (let j = i + 1; j < candles.length; j++) {
        if (candles[j].high >= c1.low) mitigated = true;
        // Hitung pengisian fvg
        if (candles[j].high > c3.high) {
           const fill = (candles[j].high - c3.high) / bearGap;
           if (fill > maxFill) maxFill = fill;
        }
      }
      if (!mitigated && maxFill < 0.5) {
        return {
          type: "BEARISH",
          high: c1.low,
          low: c3.high,
          mid: (c1.low + c3.high) / 2,
          sizePips: bearGap * 10,
          fillPct: maxFill * 100,
          evidence_found: { gap: bearGap, fill: maxFill, atr_ref: atr }
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
 */
export function validateEntry(candles: OHLC[], structureState: any, fvg: any) {
  const currentPrice = candles[candles.length - 1].close;
  
  const checklist = {
    bias: structureState.trend,
    lastSweep: structureState.lastSweep ? structureState.lastSweep.type : null,
    fvg: fvg ? fvg.type : null,
    zone: "NEUTRAL",
    fib50: 0
  };

  if (!structureState.lastSwingHigh || !structureState.lastSwingLow) {
    return { signalType: null, checklist, evidence_found: { error: "LACK_OF_SWING_DATA" } };
  }

  const fib = calculateFibonacci(structureState.lastSwingLow.value, structureState.lastSwingHigh.value);
  checklist.fib50 = fib.fib50;

  // Penentuan Zone
  if (currentPrice < fib.fib50) checklist.zone = "DISCOUNT";
  else if (currentPrice > fib.fib50) checklist.zone = "PREMIUM";

  let signalType: "BUY" | "SELL" | null = null;

  // RULE: BUY hanya di DISCOUNT
  if (
    checklist.bias === "BULLISH" && 
    checklist.fvg === "BULLISH" && 
    checklist.lastSweep === "BULLISH_SWEEP" &&
    checklist.zone === "DISCOUNT"
  ) {
    signalType = "BUY";
  }

  // RULE: SELL hanya di PREMIUM
  if (
    checklist.bias === "BEARISH" && 
    checklist.fvg === "BEARISH" && 
    checklist.lastSweep === "BEARISH_SWEEP" &&
    checklist.zone === "PREMIUM"
  ) {
    signalType = "SELL";
  }

  return {
    signalType: signalType ? { 
      type: signalType, 
      price: currentPrice, 
      fvg, 
      evidence: checklist,
      riskLevel: "CONSERVATIVE" 
    } : null,
    checklist,
    evidence_found: {
      price: currentPrice,
      fib50: fib.fib50,
      zone: checklist.zone,
      structure: structureState.evidence_found,
      fvg: fvg ? fvg.evidence_found : null
    }
  };
}