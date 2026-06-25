
import { StrategyConfig, Strategy, OHLC } from "./types.js";

const strategyConfig: StrategyConfig = {
    strategyId: "XAUUSD_SND_ENGULFING",
    name: "XAU/USD SND Engulfing",
    symbol: "XAU/USD",
    ltfTimeframe: "M15",
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
