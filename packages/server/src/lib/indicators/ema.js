import { OHLC } from './data_engine.js';

export function calculateEMA(data: OHLC[], period: number): number[] {
  const ema: number[] = [];
  const k = 2 / (period + 1);
  ema.push(data[0].close);
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i].close * k + ema[i - 1] * (1 - k));
  }
  return ema;
}
