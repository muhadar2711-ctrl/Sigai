
import { systemState } from "../state/state_manager.js";
import { addSystemError } from "./engine.js";
import { TwelveData } from "./providers/twelvedata.js";
import yahooFinance from "yahoo-finance2";

// Removed incorrect import of 'updateLivePrice', which is now part of this module.

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  time: number;
  volume?: number;
}

const dataCache: { [key: string]: OHLC[] } = {};
const CACHE_DURATION = 60 * 1000; // 1 minute

// This function now lives in data_engine.ts to prevent circular dependencies
function updateLivePrice(symbol: string, price: number) {
  systemState.prices[symbol] = price;
}

export async function initializeDataFeed() {
  console.log("[DATA_ENGINE] Initializing data feeds...");
  // Future WebSocket/real-time integrations will start here
}

export async function fetchMarketData(
  symbol: string,
  timeframe: string,
  lookback: number
): Promise<OHLC[]> {
  const cacheKey = `${symbol}_${timeframe}`;
  if (dataCache[cacheKey]) {
    // console.log(`[DATA_ENGINE] Returning cached data for ${cacheKey}`);
    return dataCache[cacheKey];
  }

  try {
    // First, try to get data from TwelveData
    const twelveDataResult = await TwelveData.getMarketData(symbol, timeframe, lookback);
    if (twelveDataResult.length > 0) {
      dataCache[cacheKey] = twelveDataResult;
      updateLivePrice(symbol, twelveDataResult[twelveDataResult.length - 1].close);
      return twelveDataResult;
    }
  } catch (error: any) {
    addSystemError("TwelveData Direct Failed for " + symbol, { error: error.message });
  }

  // Fallback to Yahoo Finance
  try {
    const yahooSymbol = getYahooTicker(symbol);
    const queryOptions = { period1: '2023-01-01', interval: "1d" }; // Adjust as needed
    const result = await yahooFinance.chart(yahooSymbol, queryOptions);
    
    if (result.quotes) {
        const mappedData: OHLC[] = result.quotes.map((q: any) => ({
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            time: q.date.getTime() / 1000,
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
