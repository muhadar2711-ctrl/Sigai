
// FIX: Use 'export type' for isolated modules
export type { Strategy } from './types.js'; 

import londonM15SMC from './london_m15_smc.js';
import xauusdV3 from './xauusd_v3.js';
import smcV1 from './smc_v1.js';
import xauusdSndEngulfing from './xauusd_snd_engulfing.js';
import smcStrategy from './smc_strategy.js';
import { Strategy } from './types.js';

const ALL_STRATEGIES: Strategy[] = [
    londonM15SMC,
    xauusdV3,
    smcV1,
    xauusdSndEngulfing,
    smcStrategy
];

export function getAllStrategies(): Strategy[] {
    return ALL_STRATEGIES.filter(s => s.enabled);
}

export function getStrategyById(id: string): Strategy | undefined {
    return ALL_STRATEGIES.find(s => s.strategyId === id);
}
