
import { systemState } from "../state/state_manager.js";
import { fetchMarketData, OHLC } from "../services/data_engine.js";
import {
  calculateEMA,
  detectFVG,
  analyzeStructure,
  SMCAnalysis,
} from "../lib/indicators/smc.js";
import {
  StrategyStatus,
  MarketBias,
  SignalType,
  TradeSignal,
  StrategyState,
  StrategyConfig,
  Killzone,
} from "./types.js";

const config: StrategyConfig = {
  symbol: "EUR/USD",
  htfTimeframe: "1h",
  ltfTimeframe: "15m",
  htfLookback: 200,
  ltfLookback: 100,
  smcLookback: 12,
  slOffset: 0.0005, 
  rrRatio: 2.5,
};

const strategyKey = "LONDON_M15_SMC";

export function initialize_LONDON_M15_SMC(): StrategyState {
  return {
    name: "London M15 SMC",
    strategyId: strategyKey,
    enabled: true,
    status: StrategyStatus.OFF,
    setupState: {},
    performance: {
      dailyTrades: 0,
      wins: 0,
      losses: 0,
      winrate: 0,
      dailyPnl: 0,
    },
    debugAudit: {},
    lastSignal: null,
  };
}

export async function execute_LONDON_M15_SMC(): Promise<TradeSignal | null> {
  const state = systemState.strategies[strategyKey];
  if (!state || !state.enabled) {
    return null;
  }

  state.status = StrategyStatus.SCANNING;
  state.debugAudit = {};
  let signal: TradeSignal | null = null;

  try {
    // FIX: Compare kz.session (string) with a string, not the kz object itself.
    const kz: Killzone = systemState.market_context.killzone;
    if (kz.session !== "London") {
      state.status = StrategyStatus.IDLE;
      state.debugAudit.idle_reason = "Awaiting London Session";
      return null;
    }

    const h1Data = await fetchMarketData(config.symbol, config.htfTimeframe, config.htfLookback);
    if (h1Data.length < config.htfLookback) {
      state.status = StrategyStatus.ERROR;
      state.debugAudit.error = `Not enough H1 data`;
      return null;
    }
    const ema200_h1 = calculateEMA(h1Data.map(d => d.close), config.htfLookback);
    const htfBias = h1Data[h1Data.length-1].close > ema200_h1[ema200_h1.length-1] ? MarketBias.BULLISH : MarketBias.BEARISH;
    state.setupState.step1_HTFBias = htfBias;

    const m15Data = await fetchMarketData(config.symbol, config.ltfTimeframe, config.ltfLookback);
    if (m15Data.length < config.ltfLookback) {
      state.status = StrategyStatus.ERROR;
      state.debugAudit.error = `Not enough M15 data`;
      return null;
    }

    const smcAnalysis: SMCAnalysis[] = analyzeStructure(m15Data, config.smcLookback);
    const lastSweepIndex = smcAnalysis.slice().reverse().findIndex(s => s.isLiquiditySweep);
    if (lastSweepIndex === -1) {
      state.debugAudit.scan_status = "Awaiting Liquidity Sweep";
      return null;
    }
    
    const sweepEvent = smcAnalysis[smcAnalysis.length - 1 - lastSweepIndex];
    const subsequentCandles = smcAnalysis.slice(smcAnalysis.length - lastSweepIndex);
    const chochEvent = subsequentCandles.find(s => s.isChoch);

    if (htfBias === MarketBias.BULLISH && sweepEvent.sweepSide === 'low' && chochEvent?.chochDirection === 'bullish') {
      const fvgs = detectFVG(m15Data.slice(sweepEvent.candleIndex));
      const bullishFvg = fvgs.find(fvg => fvg.type === 'bullish');
      if (bullishFvg) {
        const entry = bullishFvg.zone.high;
        const sl = bullishFvg.zone.low - config.slOffset;
        const risk = entry - sl;
        const tp = entry + (risk * config.rrRatio);
        signal = { type: SignalType.BUY, entry, sl, tp, strategy: strategyKey, confidence: 0.75, symbol: config.symbol, rrRatio: config.rrRatio };
      }
    }

    if (htfBias === MarketBias.BEARISH && sweepEvent.sweepSide === 'high' && chochEvent?.chochDirection === 'bearish') {
      const fvgs = detectFVG(m15Data.slice(sweepEvent.candleIndex));
      const bearishFvg = fvgs.find(fvg => fvg.type === 'bearish');
      if (bearishFvg) {
        const entry = bearishFvg.zone.low;
        const sl = bearishFvg.zone.high + config.slOffset;
        const risk = sl - entry;
        const tp = entry - (risk * config.rrRatio);
        signal = { type: SignalType.SELL, entry, sl, tp, strategy: strategyKey, confidence: 0.75, symbol: config.symbol, rrRatio: config.rrRatio };
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

// Dummy function for monitoring, can be expanded later
export async function monitor_LONDON_M15_SMC() {
  const state = systemState.strategies[strategyKey];
  if (state && state.status === StrategyStatus.SIGNAL_READY) {
     // Logic to monitor active trade would go here
     state.status = StrategyStatus.MONITORING;
  }
}
