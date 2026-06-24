
import { OHLC } from "../services/data_engine.js";

export enum StrategyStatus {
  OFF = "OFF",
  IDLE = "IDLE",
  SCANNING = "SCANNING",
  SIGNAL = "SIGNAL",
  ERROR = "ERROR",
  CRASHED = "CRASHED",
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

export interface TradeSignal {
  type: SignalType;
  entry: number;
  sl: number;
  tp: number;
  strategy: string;
  confidence: number;
  symbol: string;
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
