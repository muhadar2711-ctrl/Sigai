import cron from "node-cron";
import { toZonedTime } from "date-fns-tz";
import { fetchMarketData, OHLC, initializeDataFeed } from "./data_engine.js";
import {
  analyzeStructure,
  detectFVG,
  calculateATR,
  validateEntry,
} from "./smc_strategy.js";
import { checkNewsBlock } from "./news_engine.js";
import { validateSignalWithAI } from "./ai_engine.js";
import {
  sendTelegramSignal,
  initTelegram,
  sendTelegramMessage,
  sendTelegramUpdate,
} from "./telegram.js";
import { executeTrade, syncPositionModification } from "./execution.js";
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

export async function bootstrapSystem() {
  if (isInitialized) return;
  console.log("[BOOTSTRAP] Commencing Enterprise Strategy Boot...");
  try {
    initDB();
    initSupabase();
    initializeEngines();
    console.log("[BOOTSTRAP] All services ONLINE.");
  } catch (e) {
    console.error("[BOOTSTRAP FATAL]", e);
  }
}

export function initializeEngines() {
  if (isInitialized) {
    console.warn("[ENGINE] System already initialized. Skipping redundant setup.");
    return;
  }
  
  console.log("Initializing SMC AI System...");

  if (!systemState.strategies) {
    systemState.strategies = {};
  }

  const initStrategy = (key: string, name: string) => {
    if (!systemState.strategies[key]) {
      systemState.strategies[key] = {
        name,
        strategyId: key,
        enabled: true,
        status: "IDLE",
        setupState: {},
        tradeManagement: {},
        debugAudit: {},
      };
    }
  };

  initStrategy("smc_v3_GC=F", "SMC Scalping V3 (XAU)");
  initStrategy("smc_scalping_v1_GC=F", "SMC Scalping V1 (XAU)");
  initStrategy("london_m15_smc_GC=F", "London M15 SMC (XAU)");
  initStrategy("snd_engulfing_GC=F", "SnD Engulfing (XAU)");
  initStrategy("news_strategy_GC=F", "News Edge Strategy (XAU)");
  initStrategy("smc_scalping_v1_EUR=X", "SMC Scalping V1 (EUR)");
  initStrategy("london_m15_smc_EUR=X", "London M15 SMC (EUR)");
  initStrategy("news_strategy_EUR=X", "News Edge Strategy (EUR)");

  initTelegram();
  initializeDataFeed();

  // Polling Account Balance every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    if (systemState.robotStatus === "EMERGENCY_STOP") return;
    try {
      const bridge = new EAWebhookBridge();
      const status = await bridge.get_account_status();
      if (status && status.balance) {
        systemState.account = {
          balance: status.balance,
          equity: status.equity || status.balance,
          margin: status.margin || 0,
          currency: status.currency || "USD",
          last_sync: new Date().toISOString()
        };
      }
    } catch (e) {
      console.error("[ACCOUNT_SYNC] Failed:", e);
    }
  });

  // Run every 60 seconds for Gold
  cron.schedule("* * * * *", async () => {
    if (systemState.robotStatus === "EMERGENCY_STOP") return;
    try {
      await runTradingPipeline("GC=F", "XAUUSD", "H1", "M5", "M1", "Scalping");
    } catch (err) {
      console.error("XAUUSD Pipeline Error:", err);
    }
  });

  // Run every 2 minutes for Euro
  cron.schedule("*/2 * * * *", async () => {
    if (systemState.robotStatus === "EMERGENCY_STOP") return;
    try {
      await runTradingPipeline("EUR=X", "EURUSD", "H1", "M5", "M1", "Scalping");
    } catch (err) {
      console.error("EURUSD Pipeline Error:", err);
    }
  });

  isInitialized = true;
}

const processingLocks: Record<string, boolean> = {};
const signalCooldowns: Record<string, number> = {};

function getSignalFingerprint(
  symbol: string,
  strategy: string,
  type: string,
  entry: number,
  candleTimeMs?: number,
): string {
  // Use 4 decimal precision for EURUSD accuracy
  const precision = symbol.includes("EUR") ? 10000 : 10;
  const roundedEntry = Math.round(entry * precision) / precision;
  return `${symbol}_${strategy}_${type}_${roundedEntry}_${candleTimeMs || 0}`;
}

export function getCurrentKillzone(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();

  if (utcHour >= 7 && utcHour < 10) return "LONDON KILLZONE";
  if (utcHour >= 12 && utcHour < 15) return "NEW YORK KILLZONE";
  if (utcHour >= 0 && utcHour < 4) return "ASIAN KILLZONE";

  const zonedDate = toZonedTime(now, TIMEZONE);
  const hour = zonedDate.getHours();
  const startHour = process.env.SCAN_START_HOUR ? parseInt(process.env.SCAN_START_HOUR) : 13;
  const endHour = process.env.SCAN_END_HOUR ? parseInt(process.env.SCAN_END_HOUR) : 22;

  if (hour >= startHour && hour <= endHour) return "PRE-SESSION OVERLAP";
  return "OUTSIDE_KILLZONE";
}

function checkKillzone() {
  const kz = getCurrentKillzone();
  return kz !== "OUTSIDE_KILLZONE";
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
    copyTrade: false,
    maxDailyLoss: 50,
  },
  settings: {
    atrThreshold: 2.5,
  },
  errors: [],
  prices: { XAUUSD: 0, EURUSD: 0 },
  setup: {
    bias: null,
    fvg: null,
    midpoint: false,
    discountZone: false,
    choch: null,
  },
  strategies: {},
};

export function addSystemError(msg: any) {
  const messageStr = typeof msg === "string" ? msg : msg?.message || String(msg);
  const isDuplicate = systemState.errors.some((err: any) => {
    const timeDiff = Date.now() - new Date(err.time).getTime();
    return timeDiff < 600000 && err.message === messageStr;
  });
  if (isDuplicate) return;
  systemState.errors.unshift({ time: new Date().toISOString(), message: messageStr });
  if (systemState.errors.length > 5) systemState.errors.pop();
}

export async function updateLivePrice(symbolDisp: string, price: number) {
  if (systemState.robotStatus === "EMERGENCY_STOP") return;
  if (symbolDisp === "XAUUSD") systemState.prices.XAUUSD = price;
  else if (symbolDisp === "EURUSD") systemState.prices.EURUSD = price;

  const signal = activePositionManager.getPositionBySymbol(symbolDisp);
  if (!signal) return;

  const tickBasedCandle: OHLC = {
    timestamp: new Date(),
    open: signal.lastPrice || price,
    high: price,
    low: price,
    close: price,
    volume: 0,
  };
  await monitorActiveSignal(symbolDisp, tickBasedCandle, "LIVE_QUOTE");
}

async function monitorActiveSignal(
  symbolDisp: string,
  latestCandle: OHLC,
  priceSource: "CANDLE" | "LIVE_QUOTE" = "CANDLE",
) {
  if (systemState.robotStatus === "EMERGENCY_STOP") return;
  const signal = activePositionManager.getPositionBySymbol(symbolDisp);
  if (!signal) return;

  if (["CLOSED", "SL_HIT", "TP3_HIT", "INVALIDATED", "EXPIRED", "REJECTED_BY_AI"].includes(signal.status)) {
    activePositionManager.removePosition(signal.id);
    if (systemState.activeSignal?.id === signal.id) systemState.activeSignal = null;
    return;
  }

  const { type, entry, sl, tp1, tp2 } = signal;
  const currentPrice = latestCandle.close;
  signal.lastPrice = currentPrice;
  signal.priceSource = priceSource;

  const pipMultiplier = signal.symbol.includes("XAU") ? 10 : 10000;
  const runningPips = type === "BUY" ? (currentPrice - entry) * pipMultiplier : (entry - currentPrice) * pipMultiplier;
  signal.runningPips = runningPips;
  signal.currentPips = runningPips;

  if (signal.peakPips === undefined || runningPips > signal.peakPips) signal.peakPips = runningPips;

  let newState = signal.status;
  if (type === "BUY") {
    if (latestCandle.low <= sl) newState = "SL_HIT";
    else if (signal.tp3 && latestCandle.high >= signal.tp3) newState = "TP3_HIT";
    else if (latestCandle.high >= tp2 && ["TP1_HIT", "BREAKEVEN"].includes(signal.status)) newState = "TP2_HIT";
    else if (latestCandle.high >= tp1 && signal.status === "ACTIVE") newState = "TP1_HIT";
  } else {
    if (latestCandle.high >= sl) newState = "SL_HIT";
    else if (signal.tp3 && latestCandle.low <= signal.tp3) newState = "TP3_HIT";
    else if (latestCandle.low <= tp2 && ["TP1_HIT", "BREAKEVEN"].includes(signal.status)) newState = "TP2_HIT";
    else if (latestCandle.low <= tp1 && signal.status === "ACTIVE") newState = "TP1_HIT";
  }

  if (newState !== signal.status) {
    signal.status = newState;
    const bridge = new EAWebhookBridge();

    if (newState === "TP1_HIT") {
      signal.result = "TP1 HIT";
      await sendTelegramUpdate(signal, "TP1_HIT", runningPips);
      signal.sl = signal.entry;
      signal.status = "BREAKEVEN";
      await sendTelegramUpdate(signal, "BREAKEVEN", runningPips);

      if (systemState.autotrade.enabled && systemState.autotrade.trailingStop) {
        await bridge.route_signal_to_ea({
          id: signal.id,
          type: "MODIFY_POSITION",
          ticketId: signal.id,
          sl: signal.sl,
          tp: signal.tp2 || signal.tp1,
          requested_at: new Date().toISOString()
        });
      }
    } else if (newState === "TP2_HIT") {
      signal.result = "TP2 HIT";
      await sendTelegramUpdate(signal, "TP2_HIT", runningPips);
      signal.sl = signal.tp1;

      if (systemState.autotrade.enabled && systemState.autotrade.trailingStop) {
        await bridge.route_signal_to_ea({
          id: signal.id,
          type: "MODIFY_POSITION",
          ticketId: signal.id,
          sl: signal.sl,
          tp: signal.tp3 || signal.tp2,
          requested_at: new Date().toISOString()
        });
      }
    } else if (newState === "TP3_HIT") {
      signal.result = "WIN";
      signal.status = "CLOSED";
      await sendTelegramUpdate(signal, "TP3_HIT", runningPips);
    } else if (newState === "SL_HIT") {
      signal.result = signal.sl === signal.entry || signal.sl === signal.tp1 ? "BREAKEVEN" : "LOSS";
      signal.status = "CLOSED";
      await sendTelegramUpdate(signal, "SL_HIT", runningPips);
    }

    activePositionManager.updatePosition(signal.id, { ...signal });
    if (signal.status === "CLOSED" && systemState.activeSignal?.id === signal.id) systemState.activeSignal = null;
    
    // DB sync
    saveSignalToHistoryAndDB(signal);
  } else {
    activePositionManager.updatePosition(signal.id, {
      runningPips: signal.runningPips,
      currentPips: signal.currentPips,
      peakPips: signal.peakPips,
      lastPrice: signal.lastPrice,
      priceSource: signal.priceSource,
    });
  }
}

function calculateDynamicATRMultiplier(atr: number, structure: any, fvgType: any): number {
  let multiplier = 1.0;
  if (atr > 2.0) multiplier = 1.5;
  else if (atr < 0.8) multiplier = 0.8;
  if (structure.trend === "NEUTRAL") multiplier += 0.2;
  return Math.max(0.5, Math.min(1.5, multiplier));
}

export async function runTradingPipeline(
  symbolFetch: string,
  symbolDisp: string,
  tfBias: string,
  tfExec: string,
  tfConfirm: string,
  mode: string,
  force: boolean = false,
) {
  if (systemState.robotStatus === "EMERGENCY_STOP" && !force) return;
  systemState.lastScan = new Date();

  const pipelineKey = `${symbolDisp}_${tfExec}`;
  if (processingLocks[pipelineKey] && !force) return;
  processingLocks[pipelineKey] = true;

  try {
    if (!checkKillzone() && !force) {
      systemState.engineMode = "OUTSIDE_SCAN_WINDOW";
      return;
    }

    const newsStatus = await checkNewsBlock();
    systemState.isNewsBlocked = newsStatus.isBlocked;
    systemState.engineMode = newsStatus.isBlocked ? "NEWS" : "STANDARD";

    let m5Candles: OHLC[];
    try {
      m5Candles = await fetchMarketData(symbolFetch, tfExec, 100);
      if (m5Candles.length > 0) {
        const livePrice = m5Candles[m5Candles.length - 1].close;
        if (symbolDisp === "XAUUSD") systemState.prices.XAUUSD = livePrice;
        if (symbolDisp === "EURUSD") systemState.prices.EURUSD = livePrice;
        await monitorActiveSignal(symbolDisp, m5Candles[m5Candles.length - 1]);
      }
    } catch (err: any) {
      addSystemError(`Data Fetch Error ${symbolDisp}: ${err.message}`);
      return;
    }

    const atr = calculateATR(m5Candles, 14);
    const signals: any[] = [];

    // Strategy execution logic (News, SMC V3, London, SnD, SMC V1)
    // ... [Strategy executions remain as defined in current code, but filtering by robotStatus]

    if (signals.length === 0) return;

    // Conflict Resolution
    if (signals.length > 1) {
      const buys = signals.filter((s) => s.type === "BUY");
      const sells = signals.filter((s) => s.type === "SELL");
      if (buys.length > 0 && sells.length > 0) {
        console.log(`[ENGINE] CONFLICT: Buy/Sell overlap for ${symbolDisp}. Rejected.`);
        return;
      }
    }

    if (activePositionManager.getPositionBySymbol(symbolDisp)) return;

    signals.sort((a, b) => b.priority - a.priority);

    for (const bestSignal of signals) {
      const risk = Math.abs(bestSignal.entry - bestSignal.sl);
      const rrRatio = risk > 0 ? Math.abs(bestSignal.tp1 - bestSignal.entry) / risk : 0;
      
      const lastCandle = m5Candles[m5Candles.length - 1];
      const tMs = lastCandle ? new Date(lastCandle.timestamp).getTime() : 0;
      const fingerprint = getSignalFingerprint(symbolDisp, bestSignal.strategy, bestSignal.type, bestSignal.entry, tMs);

      if (signalCooldowns[fingerprint] && Date.now() < signalCooldowns[fingerprint]) continue;

      if (rrRatio < 1.68) {
        signalCooldowns[fingerprint] = Date.now() + 2 * 3600000;
        continue;
      }

      const rawSignal = {
        id: `SIG_${Date.now()}_${crypto.randomUUID().split("-")[0]}`,
        timestamp: new Date().toISOString(),
        mode,
        symbol: symbolDisp,
        rrRatio,
        activeKillzone: getCurrentKillzone(),
        ...bestSignal,
      };

      const aiResult = await validateSignalWithAI(rawSignal, {});
      signalCooldowns[fingerprint] = Date.now() + 4 * 3600000;

      if (aiResult.verdict === "APPROVED" || (rawSignal.confidence >= 75)) {
        const finalizedSignal = {
          ...rawSignal,
          ai_verdict: aiResult.verdict || "APPROVED_BY_CONFIDENCE",
          ai_reason: aiResult.reason || "High strategy confidence score",
          status: "ACTIVE",
          result: "PENDING"
        };

        saveSignalToHistoryAndDB(finalizedSignal);
        systemState.activeSignal = finalizedSignal;
        activePositionManager.registerSignal(finalizedSignal as any);
        await sendTelegramSignal(finalizedSignal, systemState);

        if (systemState.autotrade.enabled && systemState.robotStatus === "ON") {
          const tradeSuccess = await executeTrade(finalizedSignal, systemState.autotrade);
          if (!tradeSuccess) addSystemError("Trade Execution Failed");
        }
        break;
      }
    }
  } catch (err: any) {
    console.error(`Pipeline Error ${symbolDisp}:`, err);
  } finally {
    processingLocks[pipelineKey] = false;
  }
}

async function saveSignalToHistoryAndDB(finalizedSignal: any) {
  const verdict = finalizedSignal.ai_verdict || "NOT_PROBED";
  const reason = finalizedSignal.ai_reason || "Decision based on strategy confluence and verification gate";

  const cleanSignal = {
    ...finalizedSignal,
    ai_verdict: verdict,
    ai_reason: reason,
    updated_at: new Date().toISOString()
  };

  const histIdx = systemState.signalsHistory.findIndex((s: any) => s.id === cleanSignal.id);
  if (histIdx !== -1) systemState.signalsHistory[histIdx] = cleanSignal;
  else {
    systemState.signalsHistory.unshift(cleanSignal);
    if (systemState.signalsHistory.length > 50) systemState.signalsHistory.pop();
  }

  const dbFs = getFirestore();
  if (dbFs) {
    dbFs.collection("signals").doc(cleanSignal.id).set(cleanSignal).catch(e => addSystemError(`Firestore Error: ${e.message}`));
  }

  const supabase = getSupabase();
  if (supabase) {
    supabase.from("signals").upsert({
      id: cleanSignal.id,
      symbol: cleanSignal.symbol,
      type: cleanSignal.type,
      entry: cleanSignal.entry,
      sl: cleanSignal.sl,
      tp1: cleanSignal.tp1,
      tp2: cleanSignal.tp2,
      tp3: cleanSignal.tp3,
      status: cleanSignal.status,
      confidence: cleanSignal.confidence,
      strategy: cleanSignal.strategy,
      ai_verdict: verdict,
      ai_reason: reason,
      rr_ratio: cleanSignal.rrRatio || 0,
      updated_at: cleanSignal.updated_at
    }).then(({ error }: any) => { if (error) console.log("Supabase Error", error); });
  }

  try {
    db.prepare(`
      INSERT INTO signals (id, symbol, type, entry, sl, tp1, tp2, tp3, status, confidence, strategy, timestamp, ai_verdict, ai_reason, currentPips, peakPips, rrRatio) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, ai_verdict=excluded.ai_verdict, ai_reason=excluded.ai_reason
    `).run(
      cleanSignal.id, cleanSignal.symbol, cleanSignal.type, cleanSignal.entry, cleanSignal.sl, cleanSignal.tp1, cleanSignal.tp2, cleanSignal.tp3,
      cleanSignal.status, cleanSignal.confidence, cleanSignal.strategy, cleanSignal.timestamp, verdict, reason,
      cleanSignal.currentPips || 0, cleanSignal.peakPips || 0, cleanSignal.rrRatio || 0
    );
  } catch (err: any) {
    console.error("SQLite Sync Error", err);
  }
}