
import { systemState, addSystemError } from "../state/state_manager.js";
import { fetchTimeSeriesData } from './providers/market_provider.js';

// The OHLC interface remains the same
export interface OHLC {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// --- Main Data Fetching Logic ---
export async function getMarketData(symbol: string, interval: string, lookback: number): Promise<OHLC[]> {
    try {
        console.log(`[DATA_ENGINE] Requesting data for ${symbol} (${interval}, ${lookback})`);
        
        // Call the new robust provider function
        const rawCandles = await fetchTimeSeriesData(symbol, interval, lookback);

        if (!rawCandles || rawCandles.length === 0) {
            console.warn(`[DATA_ENGINE] No candles returned from provider for ${symbol}.`);
            return [];
        }

        // Map the normalized provider data to our internal OHLC format
        const ohlcCandles: OHLC[] = rawCandles.map((q: any) => ({
            timestamp: q.datetime, // Assuming standard 'datetime' field
            open: parseFloat(q.open),
            high: parseFloat(q.high),
            low: parseFloat(q.low),
            close: parseFloat(q.close),
            volume: q.volume ? parseInt(q.volume, 10) : 0,
        }));

        systemState.data.marketData[symbol] = {
            lastUpdate: new Date().toISOString(),
            candles: ohlcCandles,
        };

        console.log(`[DATA_ENGINE] Successfully processed ${ohlcCandles.length} candles for ${symbol}`);
        return ohlcCandles;

    } catch (error: any) {
        // Errors are now logged in detail by the provider, so we just log the high-level failure here.
        console.error(`[DATA_ENGINE] Failed to get market data for ${symbol}. Error: ${error.message}`);
        
        // The error is already added to systemState by the provider, but we can add another one for context.
        addSystemError("DATA_ENGINE_FAILURE", { 
            error: error.message, 
            symbol, 
            interval 
        });

        // Return an empty array to ensure the system doesn't crash.
        // The strategy engine needs to handle this gracefully.
        return []; 
    }
}
