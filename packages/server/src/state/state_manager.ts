
import { StrategyState, Killzone } from "./strategies/types.js";

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
  market_context: { killzone: { session: "", active: false, timeframe: "" } },
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
