import { StrategyState, Killzone, TradeSignal } from "../strategies/types.js";
import { OHLC } from "../services/data_engine.js";

// Centralized state for the entire system
export const systemState: {
  activeSignal: any | null;
  signalsHistory: any[];
  systemErrors: any[];
  lastScan: Date | null;
  isNewsBlocked: boolean;
  engineMode: string;
  robotStatus: string;
  autotrade: any;
  prices: { [key: string]: number };
  strategies: { [key: string]: StrategyState };
  market_context: { killzone: Killzone };
  data: { marketData: { [key: string]: { lastUpdate: string; candles: OHLC[] } } };
} = {
  activeSignal: null,
  signalsHistory: [],
  systemErrors: [],
  lastScan: null,
  isNewsBlocked: false,
  engineMode: "STANDARD",
  robotStatus: "OFF",
  autotrade: {
    enabled: false,
    tradeMode: "MANUAL",
    executionProvider: "NONE",
  },
  prices: { "XAU/USD": 0, "EUR/USD": 0 },
  strategies: {},
  market_context: { killzone: { session: "NONE", active: false, timeframe: "" } },
  data: { marketData: {} },
};

// Centralized error logging function
export function addSystemError(message: string, meta?: any) {
  console.error(`[SYSTEM_ERROR] ${message}`, meta || '');
  systemState.systemErrors.unshift({ time: new Date().toISOString(), message, meta: meta || null });
  // Keep the error log from growing indefinitely
  if (systemState.systemErrors.length > 100) {
    systemState.systemErrors.pop();
  }
}

export function updateStrategyState(strategyId: string, updates: Partial<StrategyState>) {
    if (systemState.strategies[strategyId]) {
        Object.assign(systemState.strategies[strategyId], updates);
    }
}

export function setSystemStatus(status: string) {
    systemState.robotStatus = status;
}

export function addSignalToHistory(signal: TradeSignal) {
    systemState.signalsHistory.unshift(signal);
    if (systemState.signalsHistory.length > 100) {
        systemState.signalsHistory.pop();
    }
}
