
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
  FVG,
} from "./types.js"; // FIX: Correct path to the single source of truth for types

const config: StrategyConfig = {
  symbol: "XAU/USD",
  htfTimeframe: "15m",
  ltfTimeframe: "1m",
  htfLookback: 200,
  ltfLookback: 100,
  smcLookback: 15,
  slOffset: 0.5,
  rrRatio: 3,
};

const strategyKey = "XAUUSD_SMC_V3";

export function initialize_XAUUSD_SMC_V3(): StrategyState {
  return {
    name: "SMC Scalping V3",
    strategyId: strategyKey,
    enabled: true,
    status: StrategyStatus.IDLE,
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

export async function execute_XAUUSD_SMC_V3(): Promise<TradeSignal | null> {
  const state = systemState.strategies[strategyKey];
  if (!state || !state.enabled) {
    return null;
  }

  state.status = StrategyStatus.SCANNING;
  state.debugAudit = {};
  let signal: TradeSignal | null = null;

  try {
    const killzone: Killzone = systemState.market_context.killzone;
    state.setupState.step1_Killzone = { ...killzone, valid: false };
    if (!killzone.active || (killzone.session !== "London" && killzone.session !== "New York")) {
      state.status = StrategyStatus.IDLE;
      state.debugAudit.idle_reason = "Awaiting London/NY Killzone";
      return null;
    }
    state.setupState.step1_Killzone.valid = true;

    const m15Data = await fetchMarketData(config.symbol, config.htfTimeframe, config.htfLookback);
    if (m15Data.length < config.htfLookback) {
      state.status = StrategyStatus.ERROR;
      state.debugAudit.error = `Not enough HTF data (${m15Data.length}/${config.htfLookback})`;
      return null;
    }
    const ema200_m15 = calculateEMA(m15Data.map((d) => d.close), config.htfLookback);
    const latest_ema200 = ema200_m15[ema200_m15.length - 1];
    const latest_price_m15 = m15Data[m15Data.length - 1].close;
    const htfBias = latest_price_m15 > latest_ema200 ? MarketBias.BULLISH : MarketBias.BEARISH;
    state.setupState.step2_HTFBias = htfBias;

    const m1Data = await fetchMarketData(config.symbol, config.ltfTimeframe, config.ltfLookback);
    if (m1Data.length < config.ltfLookback) {
      state.status = StrategyStatus.ERROR;
      state.debugAudit.error = `Not enough LTF data (${m1Data.length}/${config.ltfLookback})`;
      return null;
    }

    const smcAnalysis: SMCAnalysis[] = analyzeStructure(m1Data, config.smcLookback);
    
    const lastSweepIndex = smcAnalysis.slice().reverse().findIndex((s: SMCAnalysis) => s.isLiquiditySweep);
    if (lastSweepIndex === -1) {
      state.status = StrategyStatus.SCANNING;
      state.debugAudit.scan_status = "Awaiting Liquidity Sweep";
      return null;
    }

    const sweepEvent = smcAnalysis[smcAnalysis.length - 1 - lastSweepIndex];

    const subsequentCandles = smcAnalysis.slice(smcAnalysis.length - lastSweepIndex);
    const chochEvent = subsequentCandles.find((s: SMCAnalysis) => s.isChoch);

    if (htfBias === MarketBias.BULLISH && sweepEvent.sweepSide === 'low' && chochEvent?.chochDirection === 'bullish') {
        state.setupState.step3_LiquiditySweep = `LOW_SWEEP @ ${sweepEvent.candleIndex}`;
        state.setupState.step4_StructureShift = `BULLISH_CHOCH @ ${chochEvent.candleIndex}`;

        const fvgs: FVG[] = detectFVG(m1Data.slice(sweepEvent.candleIndex));
        const bullishFvg = fvgs.find((fvg: FVG) => fvg.type === 'bullish');

        if (bullishFvg) {
            state.setupState.step5_RetestZone = { type: "BULLISH_FVG", zone: bullishFvg.zone };
            const entry = bullishFvg.zone.high;
            const sl = bullishFvg.zone.low - config.slOffset;
            const risk = entry - sl;
            const tp = entry + (risk * config.rrRatio);
            
            signal = {
                type: SignalType.BUY, entry, sl, tp, 
                strategy: strategyKey, confidence: 0.8, 
                symbol: config.symbol, rrRatio: config.rrRatio
            };
        }
    }

    if (htfBias === MarketBias.BEARISH && sweepEvent.sweepSide === 'high' && chochEvent?.chochDirection === 'bearish') {
        state.setupState.step3_LiquiditySweep = `HIGH_SWEEP @ ${sweepEvent.candleIndex}`;
        state.setupState.step4_StructureShift = `BEARISH_CHOCH @ ${chochEvent.candleIndex}`;

        const fvgs: FVG[] = detectFVG(m1Data.slice(sweepEvent.candleIndex));
        const bearishFvg = fvgs.find((fvg: FVG) => fvg.type === 'bearish');

        if (bearishFvg) {
            state.setupState.step5_RetestZone = { type: "BEARISH_FVG", zone: bearishFvg.zone };
            const entry = bearishFvg.zone.low;
            const sl = bearishFvg.zone.high + config.slOffset;
            const risk = sl - entry;
            const tp = entry - (risk * config.rrRatio);

            signal = {
                type: SignalType.SELL, entry, sl, tp, 
                strategy: strategyKey, confidence: 0.8, 
                symbol: config.symbol, rrRatio: config.rrRatio
            };
        }
    }

    if (signal) {
      state.status = StrategyStatus.SIGNAL;
      state.lastSignal = signal;
      return signal;
    } else {
      state.status = StrategyStatus.SCANNING;
      if (!state.debugAudit.scan_status) state.debugAudit.scan_status = "Awaiting valid setup";
      return null;
    }
  } catch (error: any) {
    state.status = StrategyStatus.CRASHED;
    console.error(`Strategy ${strategyKey} crashed:`, error);
    state.debugAudit.error = error.message;
    state.debugAudit.error_stack = error.stack;
    return null;
  }
}
