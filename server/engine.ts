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
import { executeTrade } from "./execution.js";
import { getFirestore } from "./firebase.js";
import { getSupabase, initSupabase } from "./supabase.js";
import { db, initDB } from "./db.js";
// Enterprise Bootstrap Script
export async function bootstrapSystem() {
  console.log("[BOOTSTRAP] Commencing Enterprise Strategy Boot...");
  try {
    initSupabase();
    initializeEngines(); // Initializing legacy loops
    console.log("[BOOTSTRAP] All services ONLINE.");
  } catch (e) {
    console.error("[BOOTSTRAP FATAL]", e);
  }
}

// Initialize SQLite DB once
try {
  initDB();
  console.log("[DB] SQLite Initialized ready for signals.");
} catch (e) {
  console.error("[DB] Failed to init sqlite", e);
}
import { validateNewsEntry } from "./news_strategy.js";
import { runXauUsdSMCV3 } from "./strategies/xauusd_v3.js";
import { runLondonM15SMC } from "./strategies/london_m15_smc.js";
import { runSMCV1 } from "./strategies/smc_v1.js";
import { runXauUsdSnDEngulfing } from "./strategies/xauusd_snd_engulfing.js";
import { activePositionManager, ActivePosition } from "./position_manager.js";

const TIMEZONE = "Asia/Makassar";

export function initializeEngines() {
  console.log("Initializing SMC AI System...");

  if (!systemState.strategies) {
    systemState.strategies = {};
  }

  // Register known strategies
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

  // Gold (XAUUSD)
  initStrategy("smc_v3_GC=F", "SMC Scalping V3 (XAU)");
  initStrategy("smc_scalping_v1_GC=F", "SMC Scalping V1 (XAU)");
  initStrategy("london_m15_smc_GC=F", "London M15 SMC (XAU)");
  initStrategy("snd_engulfing_GC=F", "SnD Engulfing (XAU)");
  initStrategy("news_strategy_GC=F", "News Edge Strategy (XAU)");

  // Euro (EURUSD)
  initStrategy("smc_scalping_v1_EUR=X", "SMC Scalping V1 (EUR)");
  initStrategy("london_m15_smc_EUR=X", "London M15 SMC (EUR)");
  initStrategy("news_strategy_EUR=X", "News Edge Strategy (EUR)");

  initTelegram();
  initializeDataFeed();

  // Recovery logic for UI sync
  const recoveredPos = activePositionManager.getPositionBySymbol("XAUUSD");
  if (
    recoveredPos &&
    ["ACTIVE", "TP1_HIT", "BREAKEVEN", "TP2_HIT"].includes(recoveredPos.status)
  ) {
    systemState.activeSignal = recoveredPos;
    console.log(
      `[ENGINE] Recovered active signal for XAUUSD (${recoveredPos.status})`,
    );
  }

  // Run every 60 seconds
  cron.schedule("* * * * *", async () => {
    try {
      await runTradingPipeline("GC=F", "XAUUSD", "H1", "M5", "M1", "Scalping");
    } catch (err) {
      console.error("XAUUSD Pipeline Error:", err);
    }
  });

  cron.schedule("*/2 * * * *", async () => {
    // staggering slightly, run every 2 min
    try {
      await runTradingPipeline("EUR=X", "EURUSD", "H1", "M5", "M1", "Scalping");
    } catch (err) {
      console.error("EURUSD Pipeline Error:", err);
    }
  });
}

// In-Flight Guard
const processingLocks: Record<string, boolean> = {};

// Deduplication Cache for Signal
const signalCooldowns: Record<string, number> = {};

function getSignalFingerprint(
  symbol: string,
  strategy: string,
  type: string,
  entry: number,
  candleTimeMs?: number,
): string {
  const roundedEntry = Math.round(entry * 10) / 10;
  return `${symbol}_${strategy}_${type}_${roundedEntry}_${candleTimeMs || 0}`;
}

export function getCurrentKillzone(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();

  if (utcHour >= 7 && utcHour < 10) return "LONDON KILLZONE";
  if (utcHour >= 12 && utcHour < 15) return "NEW YORK KILLZONE";
  if (utcHour >= 0 && utcHour < 4) return "ASIAN KILLZONE";

  // ATURAN BESI UI sync (WITA)
  const zonedDate = toZonedTime(now, TIMEZONE);
  const hour = zonedDate.getHours();
  const startHour = process.env.SCAN_START_HOUR
    ? parseInt(process.env.SCAN_START_HOUR)
    : 13;
  const endHour = process.env.SCAN_END_HOUR
    ? parseInt(process.env.SCAN_END_HOUR)
    : 22;

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
  robotStatus: "OFF", // Supports: ON, OFF, PAUSE, EMERGENCY_STOP
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
  strategies: {
    "news_strategy_GC=F": { name: "News Edge Strategy (XAU)", status: "IDLE", setupState: { step1_NewsContext: "AWAITING", step2_VolatilitySpike: "AWAITING", step3_LiquiditySweep: "AWAITING", entryValidity: false } },
    "smc_v3_GC=F": { name: "SMC Scalping V3 (XAU)", status: "IDLE", setupState: { step1_Killzone: "AWAITING", step2_HTFBias: "AWAITING", step3_LiquiditySweep: "AWAITING", step4_StructureShift: "AWAITING", step5_RetestZone: "AWAITING", entryValidity: false } },
    "london_m15_smc_GC=F": { name: "London M15 SMC (XAU)", status: "IDLE", setupState: { step1_Killzone: "AWAITING", step2_HTFBias: "AWAITING", step3_AsiaRange: "AWAITING", step4_LiquiditySweep: "AWAITING", step5_StructureShift: "AWAITING", step6_RetestZone: "AWAITING", entryValidity: false } },
    "snd_engulfing_GC=F": { name: "SnD Engulfing (XAU)", status: "IDLE", setupState: { step1_Killzone: "AWAITING", step2_TrendH1: "AWAITING", step3_SndArea: "AWAITING", step4_ZoneTest: "AWAITING", step5_Engulfing: "AWAITING", entryValidity: false } },
    "smc_scalping_v1_GC=F": { name: "SMC Scalping V1 (XAU)", status: "IDLE", setupState: { step1_Killzone: "AWAITING", step2_HTFBias: "AWAITING", step3_StructureM5: "AWAITING", step4_LiquiditySweep: "AWAITING", step5_RetestZone: "AWAITING", entryValidity: false } },
    "news_strategy_EUR=X": { name: "News Edge Strategy (EUR)", status: "IDLE", setupState: { step1_NewsContext: "AWAITING", step2_VolatilitySpike: "AWAITING", step3_LiquiditySweep: "AWAITING", entryValidity: false } },
    "london_m15_smc_EUR=X": { name: "London M15 SMC (EUR)", status: "IDLE", setupState: { step1_Killzone: "AWAITING", step2_HTFBias: "AWAITING", step3_AsiaRange: "AWAITING", step4_LiquiditySweep: "AWAITING", step5_StructureShift: "AWAITING", step6_RetestZone: "AWAITING", entryValidity: false } },
    "smc_scalping_v1_EUR=X": { name: "SMC Scalping V1 (EUR)", status: "IDLE", setupState: { step1_Killzone: "AWAITING", step2_HTFBias: "AWAITING", step3_StructureM5: "AWAITING", step4_LiquiditySweep: "AWAITING", step5_RetestZone: "AWAITING", entryValidity: false } },
  },
};

export function addSystemError(msg: any) {
  const messageStr =
    typeof msg === "string" ? msg : msg?.message || String(msg);

  // Dedupe similar errors in the last 10 errors
  const isDuplicate = systemState.errors.some((err: any) => {
    const timeDiff = Date.now() - new Date(err.time).getTime();
    return (
      timeDiff < 600000 && // within 10 minutes
      (err.message === messageStr ||
        (messageStr.includes("TwelveData") &&
          err.message.includes("TwelveData")) ||
        (messageStr.includes("Yahoo Finance") &&
          err.message.includes("YahooFinance")) ||
        (messageStr.includes("fetchMarketData") &&
          err.message.includes("fetchMarketData")))
    );
  });

  if (isDuplicate) return;

  systemState.errors.unshift({
    time: new Date().toISOString(),
    message: messageStr,
  });
  if (systemState.errors.length > 5) systemState.errors.pop();
}

export async function updateLivePrice(symbolDisp: string, price: number) {
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
  const signal = activePositionManager.getPositionBySymbol(symbolDisp);
  if (!signal) return;

  // Only monitor actively running signals, remove if terminal
  if (
    [
      "CLOSED",
      "SL_HIT",
      "TP3_HIT",
      "INVALIDATED",
      "EXPIRED",
      "REJECTED_BY_AI",
    ].includes(signal.status)
  ) {
    activePositionManager.removePosition(signal.id);
    if (systemState.activeSignal?.id === signal.id) {
      systemState.activeSignal = null;
    }
    return;
  }

  if (signal.symbol !== symbolDisp) return;

  const { type, entry, sl, tp1, tp2 } = signal;
  const high = latestCandle.high;
  const low = latestCandle.low;
  const currentPrice = latestCandle.close;

  signal.lastPrice = currentPrice;
  signal.priceSource = priceSource;

  // Calculate Running Pips (Standard calculation for Gold: 1.0 move = +10 pips)
  // Example: 2000.00 to 2001.00 = 10 pips
  const pipMultiplier = signal.symbol.includes("XAU") ? 10 : 10000;
  const runningPips =
    type === "BUY"
      ? (currentPrice - entry) * pipMultiplier
      : (entry - currentPrice) * pipMultiplier;

  signal.runningPips = runningPips;
  signal.currentPips = runningPips;

  if (signal.peakPips === undefined || runningPips > signal.peakPips) {
    signal.peakPips = runningPips;
  }

  // State Transition Logic
  let newState = signal.status;

  if (type === "BUY") {
    if (low <= sl) newState = "SL_HIT";
    else if (signal.tp3 && high >= signal.tp3) newState = "TP3_HIT";
    else if (high >= tp2 && ["TP1_HIT", "BREAKEVEN"].includes(signal.status))
      newState = "TP2_HIT";
    else if (high >= tp1 && signal.status === "ACTIVE") newState = "TP1_HIT";
  } else if (type === "SELL") {
    if (high >= sl) newState = "SL_HIT";
    else if (signal.tp3 && low <= signal.tp3) newState = "TP3_HIT";
    else if (low <= tp2 && ["TP1_HIT", "BREAKEVEN"].includes(signal.status))
      newState = "TP2_HIT";
    else if (low <= tp1 && signal.status === "ACTIVE") newState = "TP1_HIT";
  }

  // Handle Updates
  if (newState !== signal.status) {
    signal.status = newState;

    if (newState === "TP1_HIT") {
      signal.result = "TP1 HIT";
      await sendTelegramUpdate(signal, "TP1_HIT", runningPips);
      // Move SL to Breakeven
      signal.sl = signal.entry;
      signal.status = "BREAKEVEN"; // Mark BE
      await sendTelegramUpdate(signal, "BREAKEVEN", runningPips);

      // Sync Trailing Stop to Broker
      if (systemState.autotrade.enabled && systemState.autotrade.trailingStop) {
        try {
          const { syncPositionModification } = await import("./execution.js");
          await syncPositionModification(
            signal.id,
            signal.sl,
            signal.tp2 || signal.tp1,
            systemState.autotrade.executionProvider,
          );
        } catch (e) {}
      }
    } else if (newState === "TP2_HIT") {
      signal.result = "TP2 HIT";
      await sendTelegramUpdate(signal, "TP2_HIT", runningPips);
      // Move SL to TP1
      signal.sl = signal.tp1;

      // Sync Trailing Stop to Broker
      if (systemState.autotrade.enabled && systemState.autotrade.trailingStop) {
        try {
          const { syncPositionModification } = await import("./execution.js");
          await syncPositionModification(
            signal.id,
            signal.sl,
            signal.tp3 || signal.tp2,
            systemState.autotrade.executionProvider,
          );
        } catch (e) {}
      }
    } else if (newState === "TP3_HIT") {
      signal.result = "WIN";
      signal.status = "CLOSED";
      await sendTelegramUpdate(signal, "TP3_HIT", runningPips);
    } else if (newState === "SL_HIT") {
      signal.result =
        signal.sl === signal.entry || signal.sl === signal.tp1
          ? "BREAKEVEN"
          : "LOSS";
      signal.status = "CLOSED";
      await sendTelegramUpdate(signal, "SL_HIT", runningPips);
    }

    activePositionManager.updatePosition(signal.id, {
      status: signal.status,
      result: signal.result,
      sl: signal.sl,
      runningPips: signal.runningPips,
      currentPips: signal.currentPips,
      peakPips: signal.peakPips,
      lastPrice: signal.lastPrice,
      priceSource: signal.priceSource,
    });

    if (
      signal.status === "CLOSED" &&
      systemState.activeSignal?.id === signal.id
    ) {
      systemState.activeSignal = null;
    }

    // Update DB if finalized
    if (
      [
        "CLOSED",
        "TP1_HIT",
        "TP2_HIT",
        "TP3_HIT",
        "SL_HIT",
        "BREAKEVEN",
      ].includes(signal.status)
    ) {
      const dbFs = getFirestore();
      if (dbFs) {
        dbFs
          .collection("signals")
          .doc(signal.id)
          .update({
            status: signal.status,
            result: signal.result,
            sl: signal.sl,
            runningPips: signal.runningPips,
            currentPips: signal.currentPips,
            peakPips: signal.peakPips,
            updated_at: new Date().toISOString(),
          })
          .catch((err: any) => console.log("DB Update Error", err));
      }
      
      const supabase = getSupabase();
      if (supabase) {
        supabase
          .from("signals")
          .update({
            status: signal.status,
            result: signal.result,
            sl: signal.sl,
            running_pips: signal.runningPips,
            current_pips: signal.currentPips,
            peak_pips: signal.peakPips,
            updated_at: new Date().toISOString(),
          })
          .eq("id", signal.id)
          .then(({ error }: any) => { if (error) console.log("Supabase Update Error", error); })
          .catch((err: any) => console.log("Supabase Update Error", err));
      }

      try {
        db.prepare(
          `UPDATE signals SET status = ?, currentPips = ?, peakPips = ? WHERE id = ?`,
        ).run(signal.status, signal.currentPips, signal.peakPips, signal.id);
      } catch (err: any) {
        console.error("SQLite Update Error", err);
      }
    }
  } else {
    activePositionManager.updatePosition(signal.id, {
      runningPips: signal.runningPips,
      currentPips: signal.currentPips,
      peakPips: signal.peakPips,
      lastPrice: signal.lastPrice,
      priceSource: signal.priceSource,
    });
  }

  // Sync to history for UI
  const histIdx = systemState.signalsHistory.findIndex(
    (s: any) => s.id === signal.id,
  );
  if (histIdx !== -1) {
    systemState.signalsHistory[histIdx].runningPips = runningPips;
    systemState.signalsHistory[histIdx].currentPips = signal.currentPips;
    systemState.signalsHistory[histIdx].peakPips = signal.peakPips;
    systemState.signalsHistory[histIdx].lastPrice = currentPrice;
    systemState.signalsHistory[histIdx].priceSource = signal.priceSource;
    systemState.signalsHistory[histIdx].status = signal.status;
    systemState.signalsHistory[histIdx].result = signal.result;
    systemState.signalsHistory[histIdx].sl = signal.sl;
  }
}

function calculateDynamicATRMultiplier(
  atr: number,
  structure: any,
  fvgType: any,
): number {
  // Base is 1.0, scales between 0.5 and 1.5 based on conditions
  let multiplier = 1.0;

  if (atr > 2.0)
    multiplier = 1.5; // High volatility -> Wider stop
  else if (atr < 0.8) multiplier = 0.8; // Low volatility -> Tighter stop

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
  systemState.lastScan = new Date();

  if (systemState.robotStatus === "EMERGENCY_STOP" && !force) return;

  // LOCK GUARD IN-FLIGHT
  const pipelineKey = `${symbolDisp}_${tfExec}`;
  if (processingLocks[pipelineKey] && !force) {
    console.log(
      `Pipeline ${pipelineKey} is already locked/running. Skipping this tick.`,
    );
    return;
  }
  processingLocks[pipelineKey] = true;

  try {
    const inKillzone = checkKillzone();
    if (!inKillzone && !force) {
      console.log(`Outside Killzone for ${symbolDisp} (WAITING_KILLZONE)`);
      systemState.engineMode = "OUTSIDE_SCAN_WINDOW";
      
      // Update strategy statuses to reflect outside killzone
      Object.keys(systemState.strategies).forEach((key) => {
        if (key.includes(symbolFetch)) {
           systemState.strategies[key].status = "IDLE";
           systemState.strategies[key].debugAudit = { lastReasonRejected: "OUTSIDE_SCAN_WINDOW" };
           // Explicitly set Killzone step if it exists
           if ("step1_Killzone" in systemState.strategies[key].setupState) {
               systemState.strategies[key].setupState.step1_Killzone = "AWAITING_SESSION";
           }
        }
      });
      return;
    }

    // News Check
    const newsStatus = await checkNewsBlock();
    systemState.isNewsBlocked = newsStatus.isBlocked;
    const isNewsMode = newsStatus.isBlocked;
    systemState.engineMode = isNewsMode ? "NEWS" : "STANDARD";

    if (isNewsMode) {
      console.log(
        `News Detected for ${symbolDisp} (${newsStatus.reason}). Switching to NEWS STRATEGY.`,
      );

      // Check if we already alerted this exact news recently to prevent spam
      if (systemState.lastNewsReasonAlerted !== newsStatus.reason) {
        systemState.lastNewsReasonAlerted = newsStatus.reason;

        const newsRecord = {
          id: `NEWS_${Date.now()}`,
          timestamp: new Date().toISOString(),
          mode: "NEWS",
          symbol: symbolDisp,
          type: "NEWS ALERT",
          strategy: "High Impact News",
          status: "ALERT",
          result: "INFO",
          ai_verdict: "ALERT",
          ai_reason: newsStatus.reason,
          confidence: 100,
          entry: 0,
          sl: 0,
          tp1: 0,
          tp2: 0,
          tp3: 0,
          rrRatio: 0,
        };

        systemState.signalsHistory.unshift(newsRecord);
        if (systemState.signalsHistory.length > 50)
          systemState.signalsHistory.pop();

        sendTelegramMessage(
          `🚨 *HIGH IMPACT NEWS ALERT* 🚨\n\n📌 *Event*: ${newsStatus.reason}\n🤖 *System Action*: Switching engine to News Volatility Strategy for ${symbolDisp}.`,
        );
      }
    }

    // Fetch Market Data
    let m5Candles: OHLC[];
    try {
      m5Candles = await fetchMarketData(symbolFetch, tfExec, 100);
      // Update live price
      if (m5Candles.length > 0) {
        const livePrice = m5Candles[m5Candles.length - 1].close;
        if (symbolDisp === "XAUUSD") systemState.prices.XAUUSD = livePrice;
        if (symbolDisp === "EURUSD") systemState.prices.EURUSD = livePrice;
        await monitorActiveSignal(symbolDisp, m5Candles[m5Candles.length - 1]);
      }
    } catch (err: any) {
      console.error(`Market Data Fetch Error ${symbolDisp}:`, err.message);
      addSystemError(`Market Data Fetch Error ${symbolDisp}: ${err.message}`);
      return;
    }

    const atr = calculateATR(m5Candles, 14);

    // Run Strategies
    const signals: any[] = [];

    // 1. News Strategy
    if (isNewsMode) {
      const newsResult = validateNewsEntry(
        m5Candles,
        systemState.settings.atrThreshold,
      );
      systemState.strategies[`news_strategy_${symbolFetch}`] = {
        name: "News Edge Strategy",
        status: "RUNNING",
        setupState: {
          step1_NewsContext: "HIGH IMPACT VOLATILITY",
          step2_VolatilitySpike: newsResult.checklist.volatilitySpike
            ? "DETECTED"
            : "AWAITING",
          step3_LiquiditySweep: newsResult.checklist.liquiditySweep
            ? "DETECTED"
            : "AWAITING",
          entryValidity: newsResult.signalType !== null,
        },
        debugAudit: {
          lastReasonRejected:
            newsResult.signalType === null ? "Waiting for News Spike" : "",
        },
      };
      systemState.setup = {
        bias: "NEWS_VOLATILITY",
        fvg: newsResult.checklist.fvg,
        midpoint: false,
        discountZone: newsResult.checklist.volatilitySpike,
        choch: newsResult.checklist.liquiditySweep ? "SWEEP" : null,
      };

      if (newsResult.signalType) {
        let conf = 50;
        if (newsResult.checklist.volatilitySpike) conf += 20;
        if (newsResult.checklist.liquiditySweep) conf += 20;

        const entryPrice = newsResult.signalType.price;
        const atrMult = calculateDynamicATRMultiplier(
          atr,
          { trend: "NEWS" },
          newsResult.checklist.fvg,
        );
        const slOffset = atr * atrMult;

        const tp1RR = 2.0;
        const tp2RR = 3.0;
        const tp3RR = 4.0;

        signals.push({
          strategy: "News Edge Strategy",
          type: newsResult.signalType.type,
          entry: entryPrice,
          sl:
            newsResult.signalType.type === "BUY"
              ? entryPrice - slOffset
              : entryPrice + slOffset,
          tp1:
            newsResult.signalType.type === "BUY"
              ? entryPrice + slOffset * tp1RR
              : entryPrice - slOffset * tp1RR,
          tp2:
            newsResult.signalType.type === "BUY"
              ? entryPrice + slOffset * tp2RR
              : entryPrice - slOffset * tp2RR,
          tp3:
            newsResult.signalType.type === "BUY"
              ? entryPrice + slOffset * tp3RR
              : entryPrice - slOffset * tp3RR,
          confidence: conf,
          atr,
          atrMultiplier: atrMult,
          bias: "NEWS_SPIKE",
          timeframe: tfExec,
          priority: 3, // Highest in news mode
        });
      }
    }

    // 2. SMC V3 Strategy
    let v3Result = null;
    if (symbolDisp === "XAUUSD" && !isNewsMode) {
      v3Result = await runXauUsdSMCV3(symbolFetch);
      if (v3Result && v3Result.signal) {
        const htBias =
          systemState.strategies[`smc_v3_${symbolFetch}`]?.setupState
            ?.step1_BiasHTF || "NEUTRAL";
        signals.push({
          strategy: v3Result.strategy,
          type: v3Result.signal,
          entry: v3Result.entryPrice,
          sl: v3Result.stopLoss,
          tp1: v3Result.tp1,
          tp2: v3Result.tp2,
          tp3: v3Result.tp3,
          confidence: 85,
          atr,
          atrMultiplier: 1.5,
          bias: htBias,
          timeframe: tfExec,
          priority: 2,
        });
      }
    }

    // 3. London M15 Strategy
    let londonM15Result = null;
    if ((symbolDisp === "XAUUSD" || symbolDisp === "EURUSD") && !isNewsMode) {
      londonM15Result = await runLondonM15SMC(symbolFetch);
      if (londonM15Result && londonM15Result.signal) {
        const htBias =
          systemState.strategies[`london_m15_smc_${symbolFetch}`]?.setupState
            ?.step2_HTFBias || "NEUTRAL";
        signals.push({
          strategy: londonM15Result.strategy,
          type: londonM15Result.signal,
          entry: londonM15Result.entryPrice,
          sl: londonM15Result.stopLoss,
          tp1: londonM15Result.tp1,
          tp2: londonM15Result.tp2,
          tp3: londonM15Result.tp3,
          confidence: 90,
          atr: londonM15Result.atr,
          atrMultiplier: 2.0,
          bias: htBias,
          timeframe: "M15",
          priority: 2, // High confidence due to M15
        });
      }
    }

    // 4. SnD Engulfing Setup (XAUUSD ONLY)
    let sndEngulfingResult = null;
    if (symbolDisp === "XAUUSD" && !isNewsMode) {
      sndEngulfingResult = await runXauUsdSnDEngulfing(symbolFetch, symbolDisp);
      if (sndEngulfingResult && sndEngulfingResult.signal) {
        signals.push({
          strategy: sndEngulfingResult.strategy,
          type: sndEngulfingResult.signal,
          entry: sndEngulfingResult.entryPrice,
          sl: sndEngulfingResult.stopLoss,
          tp1: sndEngulfingResult.tp1,
          tp2: sndEngulfingResult.tp2,
          tp3: sndEngulfingResult.tp3,
          confidence: sndEngulfingResult.confidence,
          atr: sndEngulfingResult.atr,
          atrMultiplier: sndEngulfingResult.atrMultiplier,
          bias: sndEngulfingResult.htfBias,
          timeframe: "M5",
          priority: 2,
        });
      }
    }

    // 5. SMC V1 (Standard) Strategy
    let v1Result = null;
    if (!isNewsMode) {
      v1Result = await runSMCV1(symbolFetch, m5Candles);

      if (v1Result && v1Result.signal) {
        signals.push({
          strategy: v1Result.strategy,
          type: v1Result.signal,
          entry: v1Result.entryPrice,
          sl: v1Result.stopLoss,
          tp1: v1Result.tp1,
          tp2: v1Result.tp2,
          tp3: v1Result.tp3,
          confidence: v1Result.confidence,
          atr: v1Result.atr,
          atrMultiplier: v1Result.atrMultiplier,
          bias: v1Result.htfBias,
          timeframe: "M5", // M5 Exec
          priority: 1,
        });
      }
    }

    if (signals.length === 0) return;

    // Conflict Resolution: If multiple strategies produce opposing signals, reject them safely.
    if (signals.length > 1) {
      const buys = signals.filter((s) => s.type === "BUY");
      const sells = signals.filter((s) => s.type === "SELL");
      if (buys.length > 0 && sells.length > 0) {
        console.log(
          `[ENGINE] CONFLICT DETECTED for ${symbolDisp}: Buy and Sell signals generated simultaneously. Rejecting to protect capital.`,
        );
        return;
      }
    }

    // Prevent overriding an active signal
    const existingPos = activePositionManager.getPositionBySymbol(symbolDisp);
    if (
      existingPos &&
      ["ACTIVE", "TP1_HIT", "BREAKEVEN", "TP2_HIT"].includes(existingPos.status)
    ) {
      return; // Block duplicate for this symbol
    }

    // Sort by priority to evaluate the strongest setups first
    signals.sort((a, b) => b.priority - a.priority);

    let activeDispatched = false;

    for (const bestSignal of signals) {
      // Calculate actual RR
      const risk = Math.abs(bestSignal.entry - bestSignal.sl);
      const reward1 = Math.abs(bestSignal.tp1 - bestSignal.entry);
      const rrRatio1 = risk > 0 ? reward1 / risk : 0;
      const currentKz = getCurrentKillzone();

      const lastCandle = m5Candles && m5Candles.length > 0 ? m5Candles[m5Candles.length - 1] : null;
      const tMs = lastCandle ? new Date(lastCandle.timestamp).getTime() : 0;

      const fingerprint = getSignalFingerprint(
        symbolDisp,
        bestSignal.strategy,
        bestSignal.type,
        bestSignal.entry,
        tMs
      );

      // STRICT DEDUPLICATION: Prevent evaluating and spamming the EXACT same setup again and again within 4 hours.
      const cd = signalCooldowns[fingerprint];
      if (cd && Date.now() < cd) {
        console.log(
          `[DEDUPE] Signal ${fingerprint} is currently on cooldown. Skipping AI validation to prevent Telegram spam.`,
        );
        continue;
      }

      if (rrRatio1 < 1.68) {
        // Strict threshold for 1.7 with floating point safety
        console.log(
          `Signal rejected, RR too low for ${symbolDisp} (${bestSignal.strategy}): 1:${rrRatio1.toFixed(2)}`,
        );

        // Put on cooldown for rejected rrRatio so we don't spam UI
        signalCooldowns[fingerprint] = Date.now() + 2 * 3600000; // 2 hours
        const rawSignal = {
          id: `SIG_${Date.now()}_${crypto.randomUUID().split("-")[0]}`,
          timestamp: new Date().toISOString(),
          mode,
          symbol: symbolDisp,
          rrRatio: rrRatio1,
          activeKillzone: currentKz,
          ...bestSignal,
          status: "INVALIDATED",
          result: "INVALIDATED",
          ai_verdict: "REJECTED",
          ai_reason: "Risk-Reward (RR) terlalu rendah (< 1:1.7).",
        };
        saveSignalToHistoryAndDB(rawSignal);
        continue; // Try next signal
      }

      const rawSignal = {
        id: `SIG_${Date.now()}_${crypto.randomUUID().split("-")[0]}`,
        timestamp: new Date().toISOString(),
        mode,
        symbol: symbolDisp,
        rrRatio: rrRatio1,
        activeKillzone: currentKz,
        ...bestSignal,
      };

      // AI Validation
      console.log(
        `[ENGINE] Validating setup for ${bestSignal.strategy} with AI... Fingerprint: ${fingerprint}`,
      );

      const recentCandles = m5Candles
        ? m5Candles.slice(-12).map((c) => ({
            time: (c.timestamp instanceof Date
              ? c.timestamp
              : new Date(c.timestamp)
            )
              .toISOString()
              .substring(11, 16),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        : [];

      const marketContext = {
        historicalPriceAction: recentCandles,
        marketSentiment: isNewsMode
          ? systemState.lastNewsReasonAlerted
          : "Neutral / No High Impact News",
        recentSignalPatterns: systemState.signalsHistory
          .slice(0, 5)
          .map((s: any) => ({
            strategy: s.strategy,
            type: s.type,
            status: s.status,
            result: s.result,
            entry: s.entry,
          })),
      };

      const aiResult = await validateSignalWithAI(rawSignal, marketContext);
      if (aiResult.verdict === "APPROVED") rawSignal.confidence += 10;

      if (rawSignal.confidence < 75 && aiResult.verdict !== "APPROVED") {
        console.log(
          `Signal rejected, low confidence for ${symbolDisp}: ${rawSignal.confidence}`,
        );
        signalCooldowns[fingerprint] = Date.now() + 1 * 3600000; // 1 hour cooldown
        continue;
      }

      const statusIndicator =
        aiResult.verdict === "APPROVED"
          ? "ACTIVE"
          : aiResult.verdict === "NEED_MORE_CONFIRMATION"
            ? "PENDING"
            : "REJECTED_BY_AI";
      const finalizedSignal = {
        ...rawSignal,
        ai_verdict: aiResult.verdict,
        ai_reason: aiResult.reason,
        status: statusIndicator,
        result:
          statusIndicator === "ACTIVE"
            ? "PENDING"
            : statusIndicator === "PENDING"
              ? "AWAITING"
              : "REJECTED_BY_AI",
      };

      saveSignalToHistoryAndDB(finalizedSignal);

      // Regardless of YES or NO, we lock this exact setup fingerprint from being spammed again for 4 hours.
      signalCooldowns[fingerprint] = Date.now() + 4 * 3600000; // 4 Hour lock for the same exact signal

      if (statusIndicator === "ACTIVE") {
        systemState.activeSignal = finalizedSignal;
        activePositionManager.registerSignal(finalizedSignal as any);
        await sendTelegramSignal(finalizedSignal, systemState);

        // Auto-execution logic
        if (
          systemState.autotrade.enabled &&
          systemState.robotStatus === "ON" &&
          systemState.autotrade.tradeMode === "AUTO"
        ) {
          const tradeSuccess = await executeTrade(
            finalizedSignal,
            systemState.autotrade,
          );
          if (!tradeSuccess) {
            addSystemError("Trade Execution Failed");
          } else {
            console.log(
              `[EXECUTION] Auto-trade successful for ${finalizedSignal.symbol}`,
            );
          }
        } else {
          console.log(
            `[EXECUTION] Auto-trade is disabled or MANUAL mode. Signal generated but not executed.`,
          );
        }
        activeDispatched = true;
        break; // DONT dispatch multiple conflicting orders
      } else {
        console.log(
          `Signal from ${bestSignal.strategy} rejected/pending by AI: ${aiResult.reason} - Locked from repeats.`,
        );
      }
    }
  } catch (err: any) {
    console.error(`Unhandled Pipeline Error for ${symbolDisp}:`, err);
  } finally {
    // RELEASE LOCK
    processingLocks[pipelineKey] = false;
  }
}

// Extracted for reusability
async function saveSignalToHistoryAndDB(finalizedSignal: any) {
  systemState.signalsHistory.unshift(finalizedSignal);
  if (systemState.signalsHistory.length > 50) systemState.signalsHistory.pop();

  const dbFs = getFirestore();
  if (dbFs) {
    try {
      await dbFs
        .collection("signals")
        .doc(finalizedSignal.id)
        .set({
          ...finalizedSignal,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    } catch (err: any) {
      console.error("Firestore Save Error:", err);
      addSystemError(`Firestore Save Error: ${err.message}`);
    }
  }

  const supabase = getSupabase();
  if (supabase) {
    supabase
      .from("signals")
      .insert({
        id: finalizedSignal.id,
        symbol: finalizedSignal.symbol,
        type: finalizedSignal.type,
        entry: finalizedSignal.entry,
        sl: finalizedSignal.sl,
        tp1: finalizedSignal.tp1,
        tp2: finalizedSignal.tp2,
        tp3: finalizedSignal.tp3,
        status: finalizedSignal.status,
        confidence: finalizedSignal.confidence,
        strategy: finalizedSignal.strategy,
        timestamp: finalizedSignal.timestamp,
        ai_verdict: finalizedSignal.ai_verdict || "",
        ai_reason: finalizedSignal.ai_reason || "",
        current_pips: finalizedSignal.currentPips || 0,
        peak_pips: finalizedSignal.peakPips || 0,
        rr_ratio: finalizedSignal.rrRatio || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .then(({ error }: any) => { if (error) console.log("Supabase Insert Error", error); })
      .catch((err: any) => console.log("Supabase Insert Error", err));
  }

  try {
    const aiVerdictString = String(finalizedSignal.ai_verdict || "");
    const aiReasonString = String(finalizedSignal.ai_reason || "");
    db.prepare(
      `
      INSERT INTO signals (id, symbol, type, entry, sl, tp1, tp2, tp3, status, confidence, strategy, timestamp, ai_verdict, ai_reason, currentPips, peakPips, rrRatio) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      finalizedSignal.id,
      finalizedSignal.symbol,
      finalizedSignal.type,
      finalizedSignal.entry,
      finalizedSignal.sl,
      finalizedSignal.tp1,
      finalizedSignal.tp2,
      finalizedSignal.tp3,
      finalizedSignal.status,
      finalizedSignal.confidence,
      finalizedSignal.strategy,
      finalizedSignal.timestamp,
      aiVerdictString,
      aiReasonString,
      0,
      0,
      finalizedSignal.rrRatio || 0,
    );
  } catch (err: any) {
    console.error("SQLite Insert Error", err);
  }
}
