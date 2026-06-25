
import { systemState } from './state/state_manager.js';

// Dummy news checking logic
// In a real scenario, this would fetch data from a news API
export async function checkNewsBlock(symbol: string): Promise<boolean> {
    // For demonstration, let's assume high-impact news blocks trading for EURUSD
    if (symbol === 'EURUSD') {
        console.log(`[NEWS_ENGINE] High-impact news detected for ${symbol}. Trading blocked.`);
        // FIX: Update and check state correctly
        systemState.isNewsBlocked[symbol] = true;
        return true;
    }
    
    // FIX: Update and check state correctly
    systemState.isNewsBlocked[symbol] = false;
    return false;
}
