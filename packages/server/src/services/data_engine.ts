
import { systemState, addSystemError } from "../state/state_manager.js";
import { TwelveData } from "./providers/twelvedata.js";
import yahooFinance from "yahoo-finance2";

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  time: number;
  volume?: number;
}

const dataCache: { [key: string]: OHLC[] } = {};

function updateLivePrice(symbol: string, price: number) {
  systemState.prices[symbol] = price;
}

export async function initializeDataFeed() {
  console.log("[DATA_ENGINE] Initializing data feeds...");
}

export async function fetchMarketData(
  symbol: string,
  timeframe: string,
  lookback: number
): Promise<OHLC[]> {
  const cacheKey = `${symbol}_${timeframe}`;
  if (dataCache[cacheKey]) {
    return dataCache[cacheKey];
  }

  try {
    const twelveDataResult = await TwelveData.getMarketData(symbol, timeframe, lookback);
    if (twelveDataResult.length > 0) {
      dataCache[cacheKey] = twelveDataResult;
      updateLivePrice(symbol, twelveDataResult[twelveDataResult.length - 1].close);
      return twelveDataResult;
    }
  } catch (error: any) {
    addSystemError("TwelveData Direct Failed for " + symbol, { error: error.message });
  }

  try {
    const yahooSymbol = getYahooTicker(symbol);
    const result = await yahooFinance.chart(yahooSymbol);
    if (result.quotes) {
        const mappedData: OHLC[] = result.quotes.map((q: any) => ({
            open: q.open!,
            high: q.high!,
            low: q.low!,
            close: q.close!,
            time: new Date(q.date).getTime() / 1000,
            volume: q.volume,
        }));
        dataCache[cacheKey] = mappedData;
        updateLivePrice(symbol, mappedData[mappedData.length - 1].close);
        return mappedData;
    }
    return [];
  } catch (error: any) {
    addSystemError(`Yahoo Finance fallback failed for ${symbol}`, { error: error.message });
    return [];
  }
}

function getYahooTicker(symbol: string): string {
  switch (symbol.toUpperCase()) {
    case "XAU/USD": return "GC=F";
    case "EUR/USD": return "EURUSD=X";
    default: return symbol;
  }
}
