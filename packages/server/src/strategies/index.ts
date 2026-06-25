
import { london_m15_smc } from './london_m15_smc.js';
import { smc_strategy } from './smc_strategy.js';
import { smc_v1 } from './smc_v1.js';
import { xauusd_snd_engulfing } from './xauusd_snd_engulfing.js';
import { xauusd_v3 } from './xauusd_v3.js';
import { Strategy } from "./types.js";

// Strategi adalah objek, bukan kelas. Hapus `new`.
const strategies: Strategy[] = [
  london_m15_smc,
  smc_strategy,
  smc_v1,
  xauusd_snd_engulfing,
  xauusd_v3,
];

export function getAllStrategies(): Strategy[] {
  return strategies;
}

export type { Strategy };

