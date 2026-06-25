
import { systemState, addSystemError } from "../state/state_manager.js";
import { TwelveData } from './providers/twelvedata.js';

const td = new TwelveData(process.env.TWELVEDATA_API_KEY);

// ... (rest of the file remains the same)

export async function getMarketData(symbol: string, interval: string, lookback: number) {
    try {
        console.log(`[DATA_ENGINE] Fetching ${interval} data for ${symbol} (lookback: ${lookback})`);
        const data = await td.getQuotes(symbol, interval, lookback);
        
        // The original code expected a 'quotes' property, let's ensure the structure is correct.
        // Assuming the td.getQuotes returns the array directly or an object with a 'values' property.
        // If td.getQuotes returns { values: [...] }, we adapt.
        // If it returns [...] directly, we can just use that.
        // Based on the error, it seems the return value is not what's expected.
        // Let's assume the library returns an object with a `values` property for now.
        const quotes = (data as any).values || data; 

        if (!quotes || !Array.isArray(quotes)) {
            throw new Error('Invalid data structure from data provider');
        }

        systemState.data.marketData[symbol] = {
            lastUpdate: new Date().toISOString(),
            candles: quotes.map((q: any) => ({ // Add type for safety
                timestamp: q.datetime,
                open: parseFloat(q.open),
                high: parseFloat(q.high),
                low: parseFloat(q.low),
                close: parseFloat(q.close),
                volume: parseInt(q.volume, 10),
            })),
        };

        console.log(`[DATA_ENGINE] Successfully fetched ${quotes.length} candles for ${symbol}`);
        return systemState.data.marketData[symbol].candles;
    } catch (error: any) {
        console.error(`[DATA_ENGINE] Error fetching market data for ${symbol}:`, error);
        addSystemError("MARKET_DATA_FETCH_FAILED", { 
            error: error.message, 
            symbol, 
            interval 
        });
        return []; // Return empty array on failure
    }
}
