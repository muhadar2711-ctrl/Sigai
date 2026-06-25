import { OHLC } from "./strategies/types.js";

// SMA
export function calculateSMA(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const sma = new Array(data.length).fill(0);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  sma[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    sum = sum - data[i - period] + data[i];
    sma[i] = sum / period;
  }
  return sma;
}

// EMA
export function calculateEMA(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const ema = new Array(data.length).fill(0);
  ema[0] = data[0];
  for (let i = 1; i < data.length; i++) {
    ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

// RSI
export function calculateRSI(data: number[], period: number): number[] {
  const rsi = new Array(data.length).fill(0);
  if (data.length < period) return rsi;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  }

  return rsi;
}

// ATR
export function calculateATR(candles: OHLC[], period: number): number[] {
  const tr = new Array(candles.length).fill(0);
  const atr = new Array(candles.length).fill(0);

  tr[0] = candles[0].high - candles[0].low;
  let sumTR = tr[0];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    tr[i] = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );

    if (i < period) {
      sumTR += tr[i];
    } else if (i === period) {
      atr[i] = sumTR / period;
    } else {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }
  }

  return atr;
}
