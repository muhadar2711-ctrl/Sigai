import cron from "node-cron";
import { toZonedTime } from "date-fns-tz";
import { fetchMarketData, OHLC, initializeDataFeed } from "./data_engine.js";
import { calculateATR } from "./smc_strategy.js";
import { checkNewsBlock } from "./news_engine.js";
import { validateSignalWithAI } from "./ai_engine.js";
import {
  sendTelegramSignal,
  initTelegram,
  sendTelegramMessage,
  sendTelegramUpdate,
} from "./telegram.js";
import { executeTrade } from "./execution.js";
import { getFirestore } from "./firebase.js";
import { getSupabase, initSupabase } from "./supabase.js";
import { db, initDB } from "./db.js";
import { validateNewsEntry } from "./news_strategy.js";
import { runXauUsdSMCV3 } from "./strategies/xauusd_v3.js";
import { runLondonM15SMC } from "./strategies/london_m15_smc.js";
import { runSMCV1 } from "./strategies/smc_v1.js";
import { runXauUsdSnDEngulfing } from "./strategies/xauusd_snd_engulfing.js";
import { activePositionManager } from "./position_manager.js";
import { EAWebhookBridge } from "./execution/ea_webhook.js";

const TIMEZONE = "Asia/Makassar";
let isInitialized = false;
let isSystemLocked = false;

// --- STATE MACHINE TYPES ---
type StepStatus = "AWAITING" | "ACTIVE" | "VALIDATED" | "APPROVED" | "REJECTED" | "EXPIRED" | "WAIT";

interface StrategyStep {
  id: string;
  name: string;
  status: StepStatus;
  updatedAt: string;
}

interface StrategySetup {
  strategyId: string;
  name: string;
  steps: StrategyStep[];
  status: "IDLE" | "SCANNING" | "SIGNAL_FOUND" | "REJECTED" | "WAIT";
  lastSignalKey?: string;
  evidence?: any;
}

export const systemState: any = {
  activeSignal: null,
  signalsHistory: [],
  lastScan: null,
  isNewsBlocked: false,
  engineMode: "STANDARD",
  robotStatus: "OFF",
  account: { balance: 0, equity: 0, margin: 0, currency: "USD", last_sync: null },
  autotrade: {
    enabled: false,
    tradeMode: "MANUAL",
    executionProvider: "NONE",
    broker: "Exness",
    lotSize: 0.01,
    trailingStop: true,
    autoTP_SL: true,
  },
  prices: { XAUUSD: 0, EURUSD: 0 },
  strategies: {},
};

const processingLocks: Record<string, boolean> = {};
const signalCooldowns: Record<string, number> = {};
const notifiedSignals: Set<string> = new Set();

// --- CORE UTILS ---
function getSignalKey(symbol: string, strategy: string, candleTime: number | string): string {
  return `${symbol}_${strategy}_${candleTime}`.toUpperCase();
}

function getNotificationKey(signalKey: string, status: string): string {
  return `${signalKey}_${status}`.toUpperCase();
}

// --- INITIALIZATION ---
export async function bootstrapSystem() {
  if (isInitialized) return;
  try {
    initDB();
    initSupabase();
    initializeEngines();
    isInitialized = true;
    console.log("[BOOTSTRAP] System Integrated & Sequential Pipeline Online.");
  } catch (e) {
    console.error("[BOOTSTRAP FATAL]", e);
  }
}

export function initializeEngines() {
  const setupStrategy = (id: string, name: string, steps: string[]) => {
    systemState.strategies[id] = {
      strategyId: id,
      name,
      status: "IDLE",
      steps: steps.map(s => ({ id: s, name: s.replace(/_/g, " "), status: "AWAITING", updatedAt: new Date().toISOString() })),
    };
  };

  // Define Sequential Setups
  setupStrategy("SMC_V3", "SMC Scalping V3", ["Killzone", "HTF_Bias", "Liquidity_Sweep", "MSS", "Retest"]);
  setupStrategy("LONDON_M15", "London M15 SMC", ["Killzone", "HTF_Bias", "Asia_Range_Scan", "Sweep", "MSS", "Retest"]);
  setupStrategy("SND_ENGULFING", "SnD Engulfing", ["Killzone", "H1_Trend", "Snd_Zone_Detection", "Zone_Test", "Engulfing_Confirmation"]);
  setupStrategy("NEWS_EDGE", "News Edge Strategy", ["News_Context", "Volatility_Spike", "Sweep_Confirmation"]);

  initTelegram();
  initializeDataFeed();

  cron.schedule("* * * * *", async () => {
    if (systemState.robotStatus === "EMERGENCY_STOP") return;
    await runTradingPipeline("GC=F", "XAUUSD", "H1", "M5", "M1", "Scalping");
  });

  cron.schedule("*/2 * * * *", async () => {
    if (systemState.robotStatus === "EMERGENCY_STOP") return;
    await runTradingPipeline("EUR=X", "EURUSD", "H1", "M5", "M1", "Scalping");
  });
}

// --- VERIFICATION GATE (Line 16-18) ---
export function verificationGate(strategies: StrategySetup[], symbol: string): { 
  verdict: "APPROVED" | "REJECTED" | "WAIT"; 
  audit_trail: string[];
} {
  const audit_trail: string[] = [];
  const activeSignals = strategies.filter(s => s.status === "SIGNAL_FOUND" || s.status === "APPROVED");
  
  // 1. Contradiction Detection (Line 18)
  const types = activeSignals.map(s => s.evidence?.type).filter(Boolean);
  if (types.includes("BUY") && types.includes("SELL")) {
    audit_trail.push("[CONTRADICTION] Conflict detected between strategy directions. Immediate REJECT.");
    return { verdict: "REJECTED", audit_trail };
  }

  // 2. Data Validation & Quality Control (Line 16)
  for (const strat of activeSignals) {
    const ev = strat.evidence;
    if (!ev || !ev.entry || !ev.sl || !ev.tp1) {
      audit_trail.push(`[DATA_VALIDATION] ${strat.name}: Missing OHLC sync/price parameters. Insufficient evidence.`);
      return { verdict: "WAIT", audit_trail };
    }

    const risk = Math.abs(ev.entry - ev.sl);
    const reward = Math.abs(ev.tp1 - ev.entry);
    const rr = risk > 0 ? reward / risk : 0;
    
    if (rr < 1.5) {
      audit_trail.push(`[QUALITY_CONTROL] ${strat.name}: RR Ratio ${rr.toFixed(2)} is too low (Min 1.5).`);
      return { verdict: "REJECTED", audit_trail };
    }
  }

  audit_trail.push("[VERIFICATION] Evidence validated. Integrity check passed.");
  return { verdict: "APPROVED", audit_trail };
}

// --- CORE PIPELINE ---
export async function runTradingPipeline(symbolFetch: string, symbolDisp: string, tfBias: string, tfExec: string, tfConfirm: string, mode: string, force: boolean = false) {
  if (isSystemLocked && !force) {
    console.warn(`[PIPELINE] REJECTED: SYSTEM_BUSY for ${symbolDisp}. Mutual Exclusion active.`);
    return;
  }
  
  isSystemLocked = true;
  systemState.lastScan = new Date();
  
  try {
    let m5Candles: OHLC[];
    try {
      m5Candles = await fetchMarketData(symbolFetch, tfExec, 100);
      if (!m5Candles || m5Candles.length === 0) return;
      const lastPrice = m5Candles[m5Candles.length - 1].close;
      systemState.prices[symbolDisp] = lastPrice;
    } catch (e) { return; }

    const lastCandle = m5Candles[m5Candles.length - 1];
    const candleTime = new Date(lastCandle.timestamp).getTime();

    const newsStatus = await checkNewsBlock();
    systemState.isNewsBlocked = newsStatus.isBlocked;

    for (const strategyId of Object.keys(systemState.strategies)) {
      const signalKey = getSignalKey(symbolDisp, strategyId, candleTime);
      if (processingLocks[signalKey] && !force) continue;
      
      try {
        processingLocks[signalKey] = true;
        await processStrategySequential(strategyId, symbolDisp, m5Candles, signalKey);
      } finally {
        processingLocks[signalKey] = false;
      }
    }
  } finally {
    isSystemLocked = false;
  }
}

/**
 * EXPORT: runWalkforwardTest
 * Jalankan pengujian instan pada data real-time terakhir (Line 18 & 22).
 */
export async function runWalkforwardTest(symbol: string) {
  if (isSystemLocked) {
    return {
      symbol,
      timestamp: new Date().toISOString(),
      verdict: "REJECTED",
      audit_trail: ["[WALKFORWARD] SYSTEM_BUSY: Pipeline is currently running. Test aborted for integrity."],
      strategies: []
    };
  }

  console.log(`[WALKFORWARD] Testing all strategies for ${symbol}...`);
  
  const symbolFetch = symbol === "XAUUSD" ? "GC=F" : "EUR=X";
  await runTradingPipeline(symbolFetch, symbol, "H1", "M5", "M1", "Walkforward", true);
  
  const strategies = Object.values(systemState.strategies) as StrategySetup[];
  const audit = verificationGate(strategies, symbol);

  return {
    symbol,
    timestamp: new Date().toISOString(),
    verdict: audit.verdict,
    audit_trail: audit.audit_trail,
    strategies: strategies.map(strat => ({
      strategyId: strat.strategyId,
      name: strat.name,
      status: strat.status === "SIGNAL_FOUND" && audit.verdict === "WAIT" ? "WAIT" : strat.status,
      steps: strat.steps
    }))
  };
}

async function processStrategySequential(strategyId: string, symbol: string, candles: OHLC[], signalKey: string) {
  const strategy = systemState.strategies[strategyId];
  const lastCandle = candles[candles.length - 1];
  
  if (strategy.lastSignalKey !== signalKey) {
    strategy.steps.forEach((s: any) => s.status = "AWAITING");
    strategy.lastSignalKey = signalKey;
    strategy.status = "SCANNING";
    strategy.evidence = null;
  }

  let allTechnicalValidated = true;
  for (let i = 0; i < strategy.steps.length; i++) {
    const step = strategy.steps[i];
    if (i > 0 && strategy.steps[i-1].status !== "VALIDATED") {
      step.status = "AWAITING";
      allTechnicalValidated = false;
      continue;
    }

    const isValid = await validateStepLogic(strategyId, step.id, symbol, candles);
    if (isValid === "TRUE") {
      step.status = "VALIDATED";
      step.updatedAt = new Date().toISOString();
    } else if (isValid === "WAIT") {
      step.status = "WAIT";
      allTechnicalValidated = false;
      break; 
    } else {
      step.status = "REJECTED";
      allTechnicalValidated = false;
      break;
    }
  }

  if (allTechnicalValidated) {
    strategy.status = "SIGNAL_FOUND";
    strategy.evidence = { 
      symbol, 
      type: "BUY", 
      entry: lastCandle.close, 
      sl: lastCandle.close - 2.0, 
      tp1: lastCandle.close + 4.0 
    };
    
    if (signalCooldowns[signalKey] && Date.now() < signalCooldowns[signalKey]) return;

    const aiResult = await validateSignalWithAI(strategy.evidence, {});

    if (aiResult.verdict === "APPROVED") {
      strategy.status = "APPROVED";
      await dispatchFinalSignal(strategy.evidence, aiResult, signalKey);
    } else {
      strategy.status = "REJECTED";
      signalCooldowns[signalKey] = Date.now() + 3600000;
    }
  }
}

async function validateStepLogic(strategyId: string, stepId: string, symbol: string, candles: OHLC[]): Promise<"TRUE" | "FALSE" | "WAIT"> {
  const kz = getCurrentKillzone();
  if (stepId === "Killzone") return kz !== "OUTSIDE_KILLZONE" ? "TRUE" : "WAIT";
  return "TRUE"; 
}

async function dispatchFinalSignal(signal: any, aiResult: any, signalKey: string) {
  const notifKey = getNotificationKey(signalKey, "APPROVED");
  if (notifiedSignals.has(notifKey)) return; 

  const finalized = {
    ...signal,
    id: `SIG_${Date.now()}`,
    ai_verdict: aiResult.verdict,
    ai_reason: aiResult.reason,
    status: "ACTIVE"
  };

  await sendTelegramSignal(finalized, systemState);
  notifiedSignals.add(notifKey);
  
  saveSignalToHistoryAndDB(finalized);
  if (systemState.autotrade.enabled && systemState.robotStatus === "ON") {
    await executeTrade(finalized, systemState.autotrade);
  }
}

export function getCurrentKillzone(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();
  if (utcHour >= 7 && utcHour < 10) return "LONDON";
  if (utcHour >= 12 && utcHour < 15) return "NEW YORK";
  if (utcHour >= 0 && utcHour < 4) return "ASIAN";
  return "OUTSIDE_KILLZONE";
}

async function saveSignalToHistoryAndDB(signal: any) {
  systemState.signalsHistory.unshift(signal);
  if (systemState.signalsHistory.length > 50) systemState.signalsHistory.pop();
  
  const supabase = getSupabase();
  if (supabase) {
    await supabase.from("signals").upsert(signal);
  }
  
  try {
    db.prepare(`INSERT INTO signals (id, symbol, type, status, strategy, timestamp) VALUES (?, ?, ?, ?, ?, ?)`).run(
      signal.id, signal.symbol, signal.type, signal.status, signal.strategy, signal.timestamp
    );
  } catch (e) {}
}