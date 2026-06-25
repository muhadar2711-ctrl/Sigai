 
import { StrategyState, Killzone, StrategyStatus, Trade } from "../strategies/types.js";

interface SystemState {
    status: "IDLE" | "RUNNING" | "BOOTSTRAPPING" | "ERROR";
    errors: { code: string; metadata: any; timestamp: string }[];
    strategies: { [key: string]: StrategyState };
}

let systemState: SystemState = {
    status: "BOOTSTRAPPING",
    errors: [],
    strategies: {}
};

// ... (keep the rest of the file the same until the function)

export function getSystemState() {
    return systemState;
}

export function setSystemStatus(status: "IDLE" | "RUNNING" | "BOOTSTRAPPING" | "ERROR") {
    systemState.status = status;
}

export function addSystemError(code: string, metadata: any) {
    systemState.errors.push({ code, metadata, timestamp: new Date().toISOString() });
}

export function updateStrategyState(strategyId: string, updates: Partial<StrategyState>) {
    if (systemState.strategies[strategyId]) {
        Object.assign(systemState.strategies[strategyId], updates);
    }
}

export function addTradeToStrategy(strategyId: string, trade: Trade) {
    const strategy = systemState.strategies[strategyId];
    if (strategy) {
        if (!strategy.trades) {
            strategy.trades = [];
        }
        strategy.trades.push(trade);
        strategy.performance.dailyTrades = strategy.trades.length;
        // FIX: Added type definition for the lambda parameter
        strategy.performance.winrate = (strategy.trades.filter((t: Trade) => t.pnl && t.pnl > 0).length / strategy.trades.length) * 100;
    }
}
