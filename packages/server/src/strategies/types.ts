
// General-purpose type for a trading signal
export enum SignalType { NONE, BUY, SELL }

// Configuration for any strategy
export interface StrategyConfig {
    strategyId: string;
    symbol: string;
    ltfTimeframe: string; // Lower Time-Frame (e.g., 'M15')
    ltfLookback: number;
    [key: string]: any; // Allow for strategy-specific config
}

// The main trade signal object with all required fields
export interface TradeSignal {
    strategyId: string;
    strategyName: string;
    symbol: string;
    action: 'BUY' | 'SELL';
    price: number;          // Entry price
    timestamp: string;
    stopLoss?: number;
    takeProfit?: number;
    confidence?: number;
    rrRatio?: number;
    ai_verdict?: 'APPROVED' | 'REJECTED' | 'PENDING';
    ai_reason?: string;
    // Deprecated fields, kept for reference during transition
    entry?: number;
    sl?: number;
    tp?: number;
    type?: SignalType;
    id?: string;
}

// Base interface for a strategy
export interface Strategy {
    strategyId: string;
    name: string;
    enabled: boolean;
    config: StrategyConfig;
    run(data: any[], config: StrategyConfig): Promise<TradeSignal | null>;
}

// Enum for strategy operational status
export enum StrategyStatus {
    ON = 'ON',
    OFF = 'OFF',
    SCANNING = 'SCANNING',
    IDLE = 'IDLE',
    SIGNAL_READY = 'SIGNAL_READY',
    ERROR = 'ERROR',
}

// Represents the live state of a strategy in the system
export interface StrategyState {
    name: string;
    strategyId: string;
    enabled: boolean;
    status: StrategyStatus;
    setupState: Record<string, any>;
    performance: {
        dailyTrades: number;
        wins: number;
        losses: number;
        winrate: number;
        dailyPnl: number;
    };
    debugAudit: Record<string, any>;
    lastSignal: TradeSignal | null;
    lastMessage?: string; // FIX: Optional message property is included
}

// Type for defining killzones (time-based trading sessions)
export interface Killzone {
    name: string;
    start: string;
    end: string;
}
