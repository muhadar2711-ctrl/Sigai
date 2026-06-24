
import cron from "node-cron";
import { fetchMarketData, OHLC, initializeDataFeed } from "./data_engine.js";
import { checkNewsBlock } from "../news_engine.js";
import { validateSignalWithAI } from "../routes/ai_engine.js";
import { sendTelegramSignal, initTelegram } from "../telegram.js";
import { executeTrade } from "../execution.js";
import { getSupabase, initSupabase } from "../supabase.js";
import { db, initDB } from "../db.js";

import { initialize_XAUUSD_SMC_V3, execute_XAUUSD_SMC_V3 } from "../strategies/xauusd_v3.js";
import { initialize_LONDON_M15_SMC, execute_LONDON_M15_SMC } from "../strategies/london_m15_smc.js";
import { initialize_SMC_V1, execute_SMC_V1 } from "../strategies/smc_v1.js";
import { initialize_XAUUSD_SND_ENGULFING, execute_XAUUSD_SND_ENGULFING } from "../strategies/xauusd_snd_engulfing.js";

import { StrategyState, TradeSignal, Killzone } from "../strategies/types.js";
import { systemState, addSystemError } from "../state/state_manager.js"; // Corrected Import

let isInitialized = false;
let isSystemLocked = false;

const notifiedSignals: Set<string> = new Set();

function getSignalKey(signal: TradeSignal): string {
  return `${signal.symbol}_${signal.type}_${signal.entry}`.toUpperCase();
}

export async function bootstrapSystem() {
  if (isInitialized) return;
  try {
    initDB();
    initSupabase();
    initializeEngines();
    isInitialized = true;
    console.log(`[${new Date().toISOString()}] [BOOTSTRAP] System Integrated & State-Driven Pipeline Online.`);
  } catch (e:any) {
    console.error(`[${new Date().toISOString()}] [BOOTSTRAP FATAL]`, e);
    addSystemError("BOOTSTRAP_FATAL", {error: e.message});
  }
}

export function initializeEngines() {
  try {
    systemState.strategies["XAUUSD_SMC_V3"] = initialize_XAUUSD_SMC_V3();
    systemState.strategies["LONDON_M15_SMC"] = initialize_LONDON_M15_SMC();
    systemState.strategies["SMC_V1"] = initialize_SMC_V1();
    systemState.strategies["XAUUSD_SND_ENGULFING"] = initialize_XAUUSD_SND_ENGULFING();
    console.log('[PIPELINE] Initialized strategies:', Object.keys(systemState.strategies).join(', '));

    initTelegram();
    initializeDataFeed();

    cron.schedule("* * * * *", async () => {
      if (systemState.robotStatus === "EMERGENCY_STOP" || isSystemLocked) return;
      isSystemLocked = true;
      
      try {
        console.log(`[PIPELINE] Scanning for setups...`);
        systemState.lastScan = new Date();
        systemState.market_context.killzone = getCurrentKillzone();

        const signalPromises = [
            execute_XAUUSD_SMC_V3(),
            execute_LONDON_M15_SMC(),
            execute_SMC_V1(),
            execute_XAUUSD_SND_ENGULFING(),
        ];
        
        const signals = await Promise.all(signalPromises);
        const validSignals = signals.filter(s => s !== null) as TradeSignal[];

        for (const signal of validSignals) {
            console.log(`[PIPELINE] Signal Candidate Found by ${signal.strategy}`, signal);
            await dispatchFinalSignal(signal);
        }

      } catch (e: any) {
        addSystemError("MAIN_PIPELINE_CRASH", { error: e.message, stack: e.stack });
      } finally {
        isSystemLocked = false;
      }
    });

  } catch (error: any) {
    addSystemError('ENGINE_INITIALIZATION_FAILED', { error: error.message });
  }
}

async function dispatchFinalSignal(signal: TradeSignal) {
  const signalKey = getSignalKey(signal);
  if (notifiedSignals.has(signalKey)) return;

  const aiResult = { verdict: "APPROVED", reason: "Auto-approved during testing." };

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

export function getCurrentKillzone(): Killzone {
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
  } catch (e: any) {
    addSystemError("SAVE_TO_SQLITE_FAILED", { error: e.message, signalId: signal.id });
  }
}
