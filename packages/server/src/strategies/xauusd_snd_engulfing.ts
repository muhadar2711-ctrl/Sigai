
import { systemState } from "../../state/state_manager.js";
import { fetchMarketData, OHLC } from "../../services/data_engine.js";
import { findEngulfingCandle, findSupplyAndDemandZones, Zone } from "../../lib/indicators/snd.js";
import { calculateEMA } from "../../lib/indicators/ema.js";
import { 
  StrategyStatus, 
  MarketBias, 
  SignalType, 
  TradeSignal, 
  StrategyState, 
  StrategyConfig,
  Killzone
} from "../types.js";

const config: StrategyConfig = {
    symbol: "XAU/USD",
    htfTimeframe: "1h",
    ltfTimeframe: "15m",
    htfLookback: 100,
    ltfLookback: 100,
    slOffset: 2, // 2 points for XAUUSD
    rrRatio: 2,
};

const strategyKey = "XAUUSD_SND_ENGULFING";

export function initialize_XAUUSD_SND_ENGULFING(): StrategyState {
    return {
        name: "XAUUSD SND Engulfing",
        strategyId: strategyKey,
        enabled: false, 
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

    try {
        const h1Data = await fetchMarketData(config.symbol, config.htfTimeframe, config.htfLookback);
        if (h1Data.length < 50) return null;

        const ema50_h1 = calculateEMA(h1Data.map(d => d.close), 50);
        const htfBias = h1Data[h1Data.length - 1].close > ema50_h1[ema50_h1.length - 1] ? MarketBias.BULLISH : MarketBias.BEARISH;
        state.setupState.step1_HTFBias = htfBias;

        const m15Data = await fetchMarketData(config.symbol, config.ltfTimeframe, config.ltfLookback);
        if (m15Data.length < 50) return null;

        const zones = findSupplyAndDemandZones(m15Data, 20);
        const demandZones = zones.filter(z => z.type === 'demand');
        const supplyZones = zones.filter(z => z.type === 'supply');

        let signal: TradeSignal | null = null;

        // Check for buy signal
        if (htfBias === MarketBias.BULLISH && demandZones.length > 0) {
            const lastCandle = m15Data[m15Data.length - 1];
            const relevantZone = demandZones.find((zone: Zone) => lastCandle.low <= zone.high && lastCandle.low >= zone.low);

            if (relevantZone) {
                const engulfing = findEngulfingCandle(m15Data.slice(-10), 'bullish');
                if (engulfing) {
                    const entry = engulfing.high;
                    const sl = relevantZone.low - config.slOffset;
                    const tp = entry + (entry - sl) * config.rrRatio;
                    signal = { type: SignalType.BUY, entry, sl, tp, strategy: strategyKey, confidence: 0.6, symbol: config.symbol, rrRatio: config.rrRatio };
                }
            }
        }

        // Check for sell signal
        if (htfBias === MarketBias.BEARISH && supplyZones.length > 0) {
            const lastCandle = m15Data[m15Data.length - 1];
            const relevantZone = supplyZones.find((zone: Zone) => lastCandle.high >= zone.low && lastCandle.high <= zone.high);

            if (relevantZone) {
                const engulfing = findEngulfingCandle(m15Data.slice(-10), 'bearish');
                if (engulfing) {
                    const entry = engulfing.low;
                    const sl = relevantZone.high + config.slOffset;
                    const tp = entry - (sl - entry) * config.rrRatio;
                    signal = { type: SignalType.SELL, entry, sl, tp, strategy: strategyKey, confidence: 0.6, symbol: config.symbol, rrRatio: config.rrRatio };
                }
            }
        }

        if (signal) {
            state.status = StrategyStatus.SIGNAL_READY;
            state.lastSignal = signal;
        }
        return signal;

    } catch (error: any) {
        state.status = StrategyStatus.ERROR;
        state.debugAudit.error = error.message;
        return null;
    }
}
