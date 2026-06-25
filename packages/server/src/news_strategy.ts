
import { findLastTrade } from "../state/state_manager.js";
import { Trade, TradeSignal } from "./types.js";

const NEWS_STRATEGY_ID = "news_based_exit";

interface NewsStrategyConfig {
    slThreshold: number; 
    rrThreshold: number; 
}

/**
 * Manages exits based on news events.
 * If a trade is in profit and a news event occurs,
 * it can either take profit or move SL to breakeven.
 */
export function runNewsBasedExit(config: NewsStrategyConfig, trades: Trade[]): TradeSignal | null {
    const lastTrade = findLastTrade(trades.length > 0 ? trades[0].strategyId : "");

    // FIX: Add a null check for the 'trade' object
    if (!lastTrade || lastTrade.status !== 'OPEN') {
        return null; // No open trade to manage
    }

    const pnl = lastTrade.pnl || 0;
    const entry = lastTrade.entryPrice;

    // Example Logic:
    // 1. If R:R > 1, move SL to BE
    if (pnl > 0 && pnl / Math.abs(entry - (lastTrade.slPrice || entry)) > config.rrThreshold) {
        return {
            strategyId: NEWS_STRATEGY_ID,
            symbol: lastTrade.symbol,
            type: "UPDATE", // UPDATE, not OPEN or CLOSE
            order: {
                type: "UPDATE",
                tradeId: lastTrade.id,
                slPrice: lastTrade.entryPrice, // Move SL to breakeven
            },
            timestamp: new Date().toISOString(),
        };
    }

    return null;
}
