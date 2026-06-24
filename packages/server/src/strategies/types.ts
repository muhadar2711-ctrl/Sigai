
import { OHLC } from "../services/data_engine.js";

// FIX: Expanded to include all legacy and modern statuses for successful compilation.
export enum StrategyStatus {
  OFF = "OFF",
  IDLE = "IDLE",
  SCANNING = "SCANNING",
  SIGNAL = "SIGNAL",
  ERROR = "ERROR",
  CRASHED = "CRASHED",
  MONITORING = "MONITORING",   // Legacy status
  SIGNAL_READY = "SIGNAL_READY", // Legacy status
}

export enum MarketBias {
  AWAITING = "AWAITING",
  BULLISH = "BULLISH",
  BEARISH = "BEARISH",
  NEUTRAL = "NEUTRAL",
}

export enum SignalType {
  BUY = "BUY",
  SELL = "SELL",
}

export interface FVGZone {
  high: number;
  low: number;
}

export interface StrategySetupState {
  [key: string]: any;
}

export interface StrategyPerformance {
  dailyTrades: number;
  wins: number;
  losses: number;
  winrate: number;
  dailyPnl: number;
}

export interface StrategyState {
  name: string;
  strategyId: string;
  enabled: boolean;
  status: StrategyStatus;
  setupState: StrategySetupState;
  performance: StrategyPerformance;
  debugAudit: { [key: string]: any };
  lastSignal?: TradeSignal | null;
}

// FIX: Standardized to a single 'tp' (Take Profit). This is the single source of truth.
export interface TradeSignal {
  type: SignalType;
  entry: number;
  sl: number;
  tp: number;
  strategy: string;
  confidence: number;
  symbol: string;
  rrRatio: number;
}

export interface Killzone {
  session: string;
  active: boolean;
  timeframe: string;
}

export interface StrategyConfig {
  symbol: string;
  htfTimeframe: string;
  ltfTimeframe: string;
  htfLookback: number;
  ltfLookback: number;
  smcLookback: number;
  slOffset: number;
  rrRatio: number;
}

export interface FVG {
  type: 'bullish' | 'bearish';
  zone: FVGZone;
  candleIndex: number;
}
