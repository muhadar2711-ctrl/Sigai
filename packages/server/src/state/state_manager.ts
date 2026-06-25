
// FIX: Corrected import path
import { Killzone, StrategyState, Trade } from "../strategies/types.js";

// --- System State ---
export interface SystemState {
    status: 'BOOTSTRAPPING' | 'RUNNING' | 'IDLE' | 'STOPPED';
    lastUpdate: string;
    activeKillzones: string[];
    killzones: Killzone[];
    errors: { code: string; details: any; timestamp: string }[];
    data: { marketData: { [symbol: string]: { lastUpdate: string; candles: any[] } } };
    strategies: { [key: string]: StrategyState };
    isNewsBlocked: { [symbol: string]: boolean };
}

export let systemState: SystemState = {
    status: "STOPPED",
    lastUpdate: new Date().toISOString(),
    activeKillzones: [],
    killzones: [
        { name: "London", start: "08:00", end: "17:00" },
        { name: "New York", start: "13:00", end: "22:00" },
        { name: "Asian", start: "00:00", end: "09:00" },
    ],
    errors: [],
    data: { marketData: {} },
    strategies: {},
    isNewsBlocked: {},
};

// --- State Management Functions ---
export function addSystemError(code: string, details: any) {
    console.error(`[SYSTEM_ERROR] Code: ${code}`, details);
    systemState.errors.push({ code, details, timestamp: new Date().toISOString() });
}

export function updateStrategyState(strategyId: string, updates: Partial<StrategyState>) {
    if (systemState.strategies[strategyId]) {
        Object.assign(systemState.strategies[strategyId], updates);
    }
}

export function setSystemStatus(status: SystemState['status']) {
    systemState.status = status;
}

// FIX: Add back the findLastTrade function needed by news_strategy
export function findLastTrade(strategyId: string): Trade | undefined {
    const strategy = systemState.strategies[strategyId];
    if (strategy && strategy.trades.length > 0) {
        return strategy.trades[strategy.trades.length - 1];
    }
    return undefined;
}
