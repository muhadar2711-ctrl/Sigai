
export interface OHLC {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    time: number;
}

export interface Trade {
    id: string;
    pair: string;
    timeframe: string;
    type: 'BUY' | 'SELL';
    entry: number;
    sl: number;
    tp: number;
    pnl?: number;
    exitTime?: string;
}

export interface StrategyState {
    status: StrategyStatus;
    trades: Trade[];
    performance: {
        dailyTrades: number;
        winrate: number;
    };
}

export interface Killzone {
    start: string;
    end: string;
}

export type StrategyStatus = 'IDLE' | 'RUNNING' | 'STOPPED';

export interface StrategyConfig {
    id: string;
    pair: string;
    timeframe: string;
    killzone: Killzone;
}

export interface Strategy {
    (candles: OHLC[], config: StrategyConfig): TradeSignal | null;
}

export interface TradeSignal {
    type: 'BUY' | 'SELL';
    entry: number;
    sl: number;
    tp: number;
}
