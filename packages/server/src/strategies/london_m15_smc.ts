
import { StrategyConfig, Strategy } from "./types.js";
import { findSwings, isBreakOfStructure, isChangeOfCharacter } from "./smc_strategy.js";

const strategyConfig: StrategyConfig = {
    strategyId: "LONDON_M15_SMC",
    name: "London M15 SMC",
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

export default strategy;
