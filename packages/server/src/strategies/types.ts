
export enum StrategyStatus {
  ON = "ON",
  OFF = "OFF",
  SCANNING = "SCANNING",
  IDLE = "IDLE",
  SIGNAL_READY = "SIGNAL_READY",
  ERROR = "ERROR",
}

export enum MarketBias {
  BULLISH = "BULLISH",
  BEARISH = "BEARISH",
  NEUTRAL = "NEUTRAL",
}

export enum SignalType {
  BUY = "BUY",
  SELL = "SELL",
}

export interface TradeSignal {
  id: string; 
  type: SignalType;
  entry: number;
  sl: number;
  tp: number;
  tp1: number; 
  strategy: string;
  confidence: number;
  symbol: string;
  rrRatio: number;
  ai_verdict: string; 
  ai_reason: string;  
}

export interface StrategyConfig {
  symbol: string;
  htfTimeframe: string;
  ltfTimeframe: string;
  htfLookback: number;
  ltfLookback: number;
  smcLookback?: number;
  slOffset: number;
  rrRatio: number;
}

// *** BARU DITAMBAHKAN ***
export interface Strategy {
  name: string;
  strategyId: string;
  enabled: boolean;
  config: StrategyConfig;
  run: (data: any[], config: StrategyConfig) => Promise<TradeSignal | null>;
}

export interface Killzone {
  session: "Asian" | "London" | "New York" | "NONE";
  active: boolean;
  timeframe: string;
}

export interface StrategyState {
  name: string;
  strategyId: string;
  enabled: boolean;
  status: StrategyStatus;
  setupState: any;
  performance: {
    dailyTrades: number;
    wins: number;
    losses: number;
    winrate: number;
    dailyPnl: number;
  };
  debugAudit: any;
  lastSignal: TradeSignal | null;
}
