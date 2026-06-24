
import cron from "node-cron";
import { fetchMarketData, OHLC, initializeDataFeed } from "./data_engine.js";
import { checkNewsBlock } from "../news_engine.js";
import { validateSignalWithAI } from "../routes/ai_engine.js";
import { sendTelegramSignal, initTelegram } from "../telegram.js";
import { executeTrade } from "../execution.js";
import { getSupabase, initSupabase } from "../supabase.js";
import { db, initDB } from "../db.js";
import { activePositionManager } from "../position_manager.js";

// --- NEW STANDARD STRATEGY IMPORTS ---
import { initialize_XAUUSD_SMC_V3, execute_XAUUSD_SMC_V3 } from "../strategies/xauusd_v3.js";
import { StrategyState, TradeSignal } from "../strategies/types.js";

let isInitialized = false;
let isSystemLocked = false;

// --- STANDARDIZED SYSTEM STATE ---
export const systemState: {
  activeSignal: any | null;
  signalsHistory: any[];
  systemErrors: any[];
  lastScan: Date | null;
  isNewsBlocked: boolean;
  engineMode: string;
  robotStatus: string;
  autotrade: any;
  prices: { [key: string]: number };
  strategies: { [key: string]: StrategyState };
  market_context: any;
} = {
  activeSignal: null,
  signalsHistory: [],
  systemErrors: [],
  lastScan: null,
  isNewsBlocked: false,
  engineMode: "STANDARD",
  robotStatus: "OFF",
  autotrade: {
    enabled: false,
    tradeMode: "MANUAL",
    executionProvider: "NONE",
  },
  prices: { "XAU/USD": 0, "EUR/USD": 0 },
  strategies: {},
  market_context: { killzone: { session: "", active: false, timeframe: "" } },
};

const processingLocks: Record<string, boolean> = {};
const notifiedSignals: Set<string> = new Set();

// --- CORE UTILS ---
export function addSystemError(message: string, meta?: any) {
  console.error(`[SYSTEM_ERROR] ${message}`, meta || '');
  systemState.systemErrors.unshift({ time: new Date().toISOString(), message, meta: meta || null });
  if (systemState.systemErrors.length > 100) systemState.systemErrors.pop();
}

export function updateLivePrice(symbol: string, price: number) {
  if (systemState.prices[symbol] !== undefined) {
    systemState.prices[symbol] = price;
  } else {
    addSystemError(`Attempted to update price for unknown symbol: ${symbol}`);
  }
}

function getSignalKey(signal: TradeSignal): string {
  return `${signal.symbol}_${signal.type}_${signal.entry}`.toUpperCase();
}

// --- INITIALIZATION ---
export async function bootstrapSystem() {
  if (isInitialized) return;
  try {
    initDB();
    initSupabase();
    initializeEngines();
    isInitialized = true;
    console.log(`[${new Date().toISOString()}] [BOOTSTRAP] System Integrated & State-Driven Pipeline Online.`);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [BOOTSTRAP FATAL]`, e);
    addSystemError("BOOTSTRAP_FATAL", e);
  }
}

export function initializeEngines() {
  try {
    // --- Initialize State-Driven Strategies ---
    systemState.strategies["XAUUSD_SMC_V3"] = initialize_XAUUSD_SMC_V3();
    
    console.log('[PIPELINE] Initialized strategies:', Object.keys(systemState.strategies).join(', '));

    // --- Initialize Core Services ---
    initTelegram();
    initializeDataFeed();

    // --- Main Execution Pipeline Cron ---
    cron.schedule("* * * * *", async () => {
      if (systemState.robotStatus === "EMERGENCY_STOP" || isSystemLocked) return;
      isSystemLocked = true;
      
      try {
        console.log(`[PIPELINE] Scanning for setups...`);
        systemState.lastScan = new Date();

        // Update Killzone context for all strategies
        systemState.market_context.killzone = getCurrentKillzone();

        // --- Execute Strategies ---
        const xauSignal = await execute_XAUUSD_SMC_V3();
        
        if (xauSignal) {
            console.log(`[PIPELINE] Signal Candidate Found by XAUUSD_SMC_V3`, xauSignal);
            await dispatchFinalSignal(xauSignal);
        }

      } catch (e: any) {
        addSystemError("MAIN_PIPELINE_CRASH", { error: e.message, stack: e.stack });
      } finally {
        isSystemLocked = false;
      }
    });

  } catch (error) {
    addSystemError('ENGINE_INITIALIZATION_FAILED', { error });
  }
}

// --- SIGNAL DISPATCH & FINALIZATION ---
async function dispatchFinalSignal(signal: TradeSignal) {
  const signalKey = getSignalKey(signal);
  if (notifiedSignals.has(signalKey)) return;

  // For now, all signals are auto-approved. AI logic can be re-introduced here.
  const aiResult = { verdict: "APPROVED", reason: "Auto-approved by new engine." };

  const finalizedSignal = {
    ...signal,
    id: `SIG_${Date.now()}`,
    ai_verdict: aiResult.verdict,
    ai_reason: aiResult.reason,
    status: "ACTIVE",
    timestamp: new Date().toISOString()
  };

  await sendTelegramSignal(finalizedSignal, systemState);
  notifiedSignals.add(signalKey);
  saveSignalToHistoryAndDB(finalizedSignal);
  
  if (systemState.autotrade.enabled && systemState.robotStatus === "ON") {
    await executeTrade(finalizedSignal, systemState.autotrade);
  }
}

// --- HELPERS ---
export function getCurrentKillzone(): { session: string; active: boolean; timeframe: string } {
  const now = new Date();
  const utcHour = now.getUTCHours();
  if (utcHour >= 1 && utcHour < 7) return { session: "Asian", active: true, timeframe: "01-07z" };
  if (utcHour >= 7 && utcHour < 10) return { session: "London", active: true, timeframe: "07-10z" };
  if (utcHour >= 13 && utcHour < 16) return { session: "New York", active: true, timeframe: "13-16z" };
  return { session: "NONE", active: false, timeframe: "" };
}

async function saveSignalToHistoryAndDB(signal: any) {
  systemState.signalsHistory.unshift(signal);
  if (systemState.signalsHistory.length > 50) systemState.signalsHistory.pop();
  const supabase = getSupabase();
  if (supabase) {
      const { error } = await supabase.from("signals").upsert(signal);
      if (error) addSystemError("SAVE_TO_SUPABASE_FAILED", { error });
  }
  try {
    db.prepare(`INSERT INTO signals (id, symbol, type, status, strategy, timestamp, entry, sl, tp, rrRatio, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      signal.id, signal.symbol, signal.type, signal.status, signal.strategy, signal.timestamp, signal.entry, signal.sl, signal.tp, signal.rrRatio, signal.confidence
    );
  } catch (e) {
    addSystemError("SAVE_TO_SQLITE_FAILED", { error: e, signalId: signal.id });
  }
}
