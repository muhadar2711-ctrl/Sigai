
import { systemState } from "../state/state_manager.js";
import { fetchMarketData, OHLC } from "../services/data_engine.js";
import {
  calculateEMA,
  detectFVG,
  analyzeStructure,
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

// --- CONFIGURATION ---
const config: StrategyConfig = {
  symbol: "XAU/USD",
  htfTimeframe: "15m",
  ltfTimeframe: "1m",
  htfLookback: 200,
  ltfLookback: 100,
  smcLookback: 15,
  slOffset: 0.5, // Pips to add/subtract from SL for safety
  rrRatio: 3, // Risk-to-Reward Ratio (e.g., 3 means 1:3 RR)
};

const strategyKey = "XAUUSD_SMC_V3";

// --- STRATEGY INITIALIZATION ---
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

// --- CORE STRATEGY LOGIC ---
export async function execute_XAUUSD_SMC_V3(): Promise<TradeSignal | null> {
  const state = systemState.strategies[strategyKey];
  if (!state || !state.enabled) {
    return null;
  }

  // Reset state for new tick
  state.status = StrategyStatus.SCANNING;
  state.debugAudit = {};
  let signal: TradeSignal | null = null;

  try {
    // === STEP 1: KILLZONE FILTER ===
    const killzone: Killzone = systemState.market_context.killzone; // Assume this is populated by another service
    state.setupState.step1_Killzone = { ...killzone, valid: false };
    if (
      !killzone.active ||
      (killzone.session !== "London" && killzone.session !== "New York")
    ) {
      state.status = StrategyStatus.IDLE;
      state.debugAudit.idle_reason = "Awaiting London/NY Killzone";
      return null;
    }
    state.setupState.step1_Killzone.valid = true;

    // === STEP 2: HIGHER TIMEFRAME (HTF) BIAS ===
    const m15Data = await fetchMarketData(
      config.symbol,
      config.htfTimeframe,
      config.htfLookback
    );
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

    // === STEP 3: LIQUIDITY SWEEP & STRUCTURE SHIFT (LTF) ===
    const m1Data = await fetchMarketData(
      config.symbol,
      config.ltfTimeframe,
      config.ltfLookback
    );
    if (m1Data.length < config.ltfLookback) {
      state.status = StrategyStatus.ERROR;
      state.debugAudit.error = `Not enough LTF data (${m1Data.length}/${config.ltfLookback})`;
      return null;
    }

    const smcAnalysis = analyzeStructure(m1Data, config.smcLookback);
    
    // LOGIC FIX: Find the sequence of events (Sweep -> CHoCH), not simultaneous events
    const lastSweepIndex = smcAnalysis.slice().reverse().findIndex(s => s.isLiquiditySweep);
    if (lastSweepIndex === -1) {
      state.status = StrategyStatus.SCANNING;
      state.debugAudit.scan_status = "Awaiting Liquidity Sweep";
      return null;
    }

    const sweepEvent = smcAnalysis[smcAnalysis.length - 1 - lastSweepIndex];

    const subsequentCandles = smcAnalysis.slice(smcAnalysis.length - lastSweepIndex);
    const chochEvent = subsequentCandles.find(s => s.isChoch);

    // === Bullish Setup ===
    if (htfBias === MarketBias.BULLISH && sweepEvent.sweepSide === 'low' && chochEvent?.chochDirection === 'bullish') {
        state.setupState.step3_LiquiditySweep = `LOW_SWEEP_CONFIRMED @ ${sweepEvent.candleIndex}`;
        state.setupState.step4_StructureShift = `BULLISH_CHOCH_CONFIRMED @ ${chochEvent.candleIndex}`;

        const fvgs = detectFVG(m1Data.slice(sweepEvent.candleIndex));
        const bullishFvg = fvgs.find(fvg => fvg.type === 'bullish');

        if (bullishFvg) {
            state.setupState.step5_RetestZone = { type: "BULLISH_FVG", zone: bullishFvg.zone };
            const entry = bullishFvg.zone.high;
            const sl = bullishFvg.zone.low - config.slOffset;
            const risk = entry - sl;
            const tp = entry + (risk * config.rrRatio); // RR Calculation FIX
            
            signal = {
                type: SignalType.BUY,
                entry,
                sl,
                tp,
                strategy: strategyKey,
                confidence: 0.8,
                symbol: config.symbol
            };
        }
    }

    // === Bearish Setup ===
    if (htfBias === MarketBias.BEARISH && sweepEvent.sweepSide === 'high' && chochEvent?.chochDirection === 'bearish') {
        state.setupState.step3_LiquiditySweep = `HIGH_SWEEP_CONFIRMED @ ${sweepEvent.candleIndex}`;
        state.setupState.step4_StructureShift = `BEARISH_CHOCH_CONFIRMED @ ${chochEvent.candleIndex}`;

        const fvgs = detectFVG(m1Data.slice(sweepEvent.candleIndex));
        const bearishFvg = fvgs.find(fvg => fvg.type === 'bearish');

        if (bearishFvg) {
            state.setupState.step5_RetestZone = { type: "BEARISH_FVG", zone: bearishFvg.zone };
            const entry = bearishFvg.zone.low;
            const sl = bearishFvg.zone.high + config.slOffset;
            const risk = sl - entry;
            const tp = entry - (risk * config.rrRatio); // RR Calculation FIX

            signal = {
                type: SignalType.SELL,
                entry,
                sl,
                tp,
                strategy: strategyKey,
                confidence: 0.8,
                symbol: config.symbol
            };
        }
    }

    // === FINAL SIGNAL DECISION ===
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
