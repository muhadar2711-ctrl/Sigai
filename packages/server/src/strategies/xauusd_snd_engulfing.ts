
import { systemState } from "../state/state_manager.js";
import { fetchMarketData, OHLC } from "../services/data_engine.js";
import { findEngulfingCandle, findSupplyAndDemandZones } from "../lib/indicators/snd.js";
import { calculateEMA } from "../lib/indicators/ema.js";
import { 
  StrategyStatus, 
  MarketBias, 
  SignalType, 
  TradeSignal, 
  StrategyState, 
  StrategyConfig,
  Killzone
} from "./types.js";

const config: StrategyConfig = {
    symbol: "XAU/USD",
    htfTimeframe: "4h",
    ltfTimeframe: "15m",
    htfLookback: 50,
    ltfLookback: 100,
    smcLookback: 0, // Not used in this strategy
    slOffset: 2, // 2 points for XAUUSD
    rrRatio: 2,
};

const strategyKey = "XAUUSD_SND_ENGULFING";

export function initialize_XAUUSD_SND_ENGULFING(): StrategyState {
    return {
        name: "XAUUSD S&D Engulfing",
        strategyId: strategyKey,
        enabled: false, // Default to disabled
        status: StrategyStatus.OFF,
        setupState: {},
        performance: { dailyTrades: 0, wins: 0, losses: 0, winrate: 0, dailyPnl: 0 },
        debugAudit: {},
        lastSignal: null,
    };
}

export async function execute_XAUUSD_SND_ENGULFING(): Promise<TradeSignal | null> {
    const state = systemState.strategies[strategyKey];
    if (!state || !state.enabled) return null;

    state.status = StrategyStatus.SCANNING;
    state.debugAudit = {};
    let signal: TradeSignal | null = null;

    try {
        // FIX: Compare kz.session (string) with a string, not the kz object itself.
        const kz: Killzone = systemState.market_context.killzone;
        if (kz.session !== "London" && kz.session !== "New York") {
            state.status = StrategyStatus.IDLE;
            state.debugAudit.idle_reason = "Awaiting London/NY Session";
            return null;
        }

        const h4Data = await fetchMarketData(config.symbol, config.htfTimeframe, config.htfLookback);
        if (h4Data.length < config.htfLookback) return null;

        const ema200_h4 = calculateEMA(h4Data.map(d => d.close), 21);
        const htfBias = h4Data[h4Data.length - 1].close > ema200_h4[ema200_h4.length - 1] ? MarketBias.BULLISH : MarketBias.BEARISH;
        state.setupState.step1_HTFBias = htfBias;

        const m15Data = await fetchMarketData(config.symbol, config.ltfTimeframe, config.ltfLookback);
        if (m15Data.length < config.ltfLookback) return null;

        const zones = findSupplyAndDemandZones(m15Data);
        const lastCandle = m15Data[m15Data.length - 1];

        if (htfBias === MarketBias.BULLISH) {
            const demandZone = zones.demand.find(zone => lastCandle.low <= zone.high && lastCandle.high >= zone.low);
            if (demandZone) {
                state.setupState.step2_ZoneHit = { type: 'Demand', zone };
                const engulfingSignal = findEngulfingCandle(m15Data.slice(-10), 'bullish'); // Check last 10 candles
                if (engulfingSignal) {
                    const entry = engulfingSignal.price;
                    const sl = demandZone.low - config.slOffset;
                    const risk = entry - sl;
                    const tp = entry + (risk * config.rrRatio);
                    signal = { type: SignalType.BUY, entry, sl, tp, strategy: strategyKey, confidence: 0.6, symbol: config.symbol, rrRatio: config.rrRatio };
                }
            }
        }

        if (htfBias === MarketBias.BEARISH) {
            const supplyZone = zones.supply.find(zone => lastCandle.low <= zone.high && lastCandle.high >= zone.low);
            if (supplyZone) {
                state.setupState.step2_ZoneHit = { type: 'Supply', zone };
                const engulfingSignal = findEngulfingCandle(m15Data.slice(-10), 'bearish');
                if (engulfingSignal) {
                    const entry = engulfingSignal.price;
                    const sl = supplyZone.high + config.slOffset;
                    const risk = sl - entry;
                    const tp = entry - (risk * config.rrRatio);
                    signal = { type: SignalType.SELL, entry, sl, tp, strategy: strategyKey, confidence: 0.6, symbol: config.symbol, rrRatio: config.rrRatio };
                }
            }
        }

        if (signal) {
            state.status = StrategyStatus.SIGNAL_READY;
            state.lastSignal = signal;
            return signal;
        } else {
            state.status = StrategyStatus.SCANNING;
            return null;
        }

    } catch (error: any) {
        state.status = StrategyStatus.ERROR;
        state.debugAudit.error = error.message;
        return null;
    }
}

export async function monitor_XAUUSD_SND_ENGULFING() {
    const state = systemState.strategies[strategyKey];
    if (state && state.status === StrategyStatus.SIGNAL_READY) {
        state.status = StrategyStatus.MONITORING;
    }
}
