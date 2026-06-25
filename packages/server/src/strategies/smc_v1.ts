
import { StrategyConfig, Strategy } from "./types.js";

const strategyConfig: StrategyConfig = {
    strategyId: "SMC_V1",
    name: "SMC V1", // FIX: Add missing name
    symbol: "XAU/USD",
    ltfTimeframe: "M15",
    ltfLookback: 200,
};

const strategy: Strategy = {
    ...strategyConfig,
    enabled: true,
    config: strategyConfig, // FIX: Add the config object
    run: async (candles, config) => {
        // Strategy logic goes here
        return null;
    },
};

// FIX: Use default export
export default strategy;
