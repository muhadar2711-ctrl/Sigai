
import { addSystemError } from '../../state/state_manager.js';

// --- Environment Variable Check ---
const API_KEY = process.env.TWELVEDATA_API_KEY;
const PROVIDER_NAME = 'TwelveData';

console.log('[ENV_CHECK] MARKET_API_KEY: ' + (API_KEY ? 'FOUND' : 'MISSING'));

if (!API_KEY) {
    // This will stop the server on startup if the key is missing.
    throw new Error("FATAL: TWELVEDATA_API_KEY environment variable is not set.");
}

const BASE_URL = 'https://api.twelvedata.com';

// --- Normalizer Layer ---
function normalizeMarketData(responseBody: any, symbol: string): any[] {
    let candles = [];

    // Case 1: { values: [...] } -> Standard TwelveData response
    if (responseBody && Array.isArray(responseBody.values)) {
        candles = responseBody.values;
    }
    // Case 2: { data: [...] } -> Common alternative
    else if (responseBody && Array.isArray(responseBody.data)) {
        candles = responseBody.data;
    }
    // Case 3: { candles: [...] } -> Another common alternative
    else if (responseBody && Array.isArray(responseBody.candles)) {
        candles = responseBody.candles;
    }
    // Case 4: The response IS the array: [...]
    else if (Array.isArray(responseBody)) {
        candles = responseBody;
    }

    if (candles.length > 0) {
        // Reverse is often needed as many APIs return newest first
        return candles.reverse(); 
    }

    // If we are here, the structure is unknown or empty
    throw new Error(`Invalid or empty data structure from ${PROVIDER_NAME} for ${symbol}.`);
}


export async function fetchTimeSeriesData(symbol: string, interval: string, lookback: number) {
    // --- Step 5: Symbol Validation ---
    // TwelveData is flexible, but let's standardize to uppercase with no special chars for the URL
    const apiSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const url = `${BASE_URL}/time_series?symbol=${apiSymbol}&interval=${interval}&outputsize=${lookback}&apikey=${API_KEY}`;
    
    console.log(`[MARKET_PROVIDER] Fetching from ${PROVIDER_NAME} for symbol: ${apiSymbol}`);

    let response: Response;
    try {
        response = await fetch(url);
    } catch (error: any) {
        console.error(`[MARKET_PROVIDER_ERROR] Network request failed for ${symbol}`, error);
        addSystemError('PROVIDER_NETWORK_ERROR', { provider: PROVIDER_NAME, symbol, error: error.message });
        throw new Error(`Network error connecting to ${PROVIDER_NAME}.`);
    }

    const responseText = await response.text();

    // --- Step 3: Enhanced Debugging ---
    if (!response.ok || responseText.includes('"status":"error"')) {
        console.error(`[MARKET_PROVIDER_DEBUG] Failed Response for ${symbol}`);
        console.error(`> Status: ${response.status}`);
        // FIX: Use null-safe fallback for API_KEY
        console.error(`> URL: ${url.replace(API_KEY ?? '', '[REDACTED]')}`);
        console.error(`> Response Body: ${responseText.substring(0, 1000)}`);
        addSystemError('PROVIDER_API_ERROR', { 
            provider: PROVIDER_NAME, 
            symbol, 
            status: response.status,
            response: responseText.substring(0, 1000)
        });
        throw new Error(`API error from ${PROVIDER_NAME}: ${response.status} - ${responseText.substring(0, 200)}`);
    }

    try {
        const responseJson = JSON.parse(responseText);
        return normalizeMarketData(responseJson, symbol);
    } catch (error: any) {
        console.error(`[MARKET_PROVIDER_DEBUG] JSON Parsing or Normalization Failed for ${symbol}`);
        console.error(`> Error: ${error.message}`);
        console.error(`> Raw Response Text: ${responseText.substring(0, 1000)}`);
        addSystemError('PROVIDER_DATA_INVALID', { 
            provider: PROVIDER_NAME, 
            symbol,
            error: error.message,
            response: responseText.substring(0, 1000)
        });
        throw new Error(`Failed to parse or normalize data from ${PROVIDER_NAME}.`);
    }
}
