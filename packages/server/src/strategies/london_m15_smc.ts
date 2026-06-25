
import { TradeSignal, StrategyConfig, Strategy } from "./types.js";

// FIX: Correct the structure and export as default
const londonM15SMC: Strategy = {
  name: "London M15 SMC",
  strategyId: "london_m15_smc",
  enabled: true,
  config: {
    // FIX: Add missing strategyId
    strategyId: "london_m15_smc",
    symbol: "XAUUSD",
    ltfTimeframe: "M15",
    ltfLookback: 100,
    // strategy-specific properties are allowed
    htfTimeframe: "H4", 
    htfLookback: 50, 
    slOffset: 2, 
    rrRatio: 2
  },
  async run(data: any[], config: StrategyConfig): Promise<TradeSignal | null> {
    // ... logic would go here
    return null;
  },
};

export default londonM15SMC;
