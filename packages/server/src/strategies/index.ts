import { LondonM15SMC } from './london_m15_smc.js';
import { SMCStrategy } from './smc_strategy.js';
import { SMCv1 } from './smc_v1.js';
import { XAUUSDSnDEngulfing } from './xauusd_snd_engulfing.js';
import { XAUUSDv3 } from './xauusd_v3.js';
import { Strategy } from "./types.js";

const strategies: Strategy[] = [
  new LondonM15SMC(),
  new SMCStrategy(),
  new SMCv1(),
  new XAUUSDSnDEngulfing(),
  new XAUUSDv3(),
];

export function getAllStrategies(): Strategy[] {
  return strategies;
}

export { Strategy };

