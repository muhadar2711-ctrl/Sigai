
import { StrategyConfig, Strategy, OHLC } from "./types.js";

const strategyConfig: StrategyConfig = {
    strategyId: "XAUUSD_V3",
    name: "XAU/USD V3",
    symbol: "XAU/USD",
    ltfTimeframe: "H4", // FIX: Corrected typo from htfTimeframe to ltfTimeframe
    ltfLookback: 200,
};

const strategy: Strategy = {
    ...strategyConfig,
    enabled: true,
    config: strategyConfig, // FIX: Add the config object
    run: async (candles: OHLC[], config: any) => {
        // Strategy logic goes here
        return null;
    },
};

export default strategy;
