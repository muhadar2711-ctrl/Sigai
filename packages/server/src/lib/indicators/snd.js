import { OHLC } from './data_engine.js';

export function isEngulfing(data: OHLC[]): boolean {
  if (data.length < 2) {
    return false;
  }
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  if (last.close > last.open && prev.close < prev.open) {
    return last.close > prev.open && last.open < prev.close;
  }
  if (last.close < last.open && prev.close > prev.open) {
    return last.open > prev.close && last.close < prev.open;
  }
  return false;
}
