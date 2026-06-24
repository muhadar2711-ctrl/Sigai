import axios from "axios";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new (YahooFinance as any)();
import WebSocket from "ws";
import { sendTelegramMessage } from "../telegram.js";
import { addSystemError, systemState, updateLivePrice } from "./engine.js";

export interface OHLC {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

let hasNotifiedTwelveDataFailure = false;
let hasNotifiedWsDisconnect = false;
let wsClient: WebSocket | null = null;
let wsConnected = false;
let fallbackInterval: NodeJS.Timeout | null = null;
let twelveDataCooldown = 0;

let wsReconnectTimeout: NodeJS.Timeout | null = null;
let wsReconnectAttempts = 0;
let wsStableTimer: NodeJS.Timeout | null = null;

export function initializeDataFeed() {
  (global as any).telegramFailDelay = (global as any).telegramFailDelay || 0;

  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    addSystemError(
      "No TWELVEDATA_API_KEY. WebSocket price streaming disabled.",
    );
    startFallbackPolling();
    return;
  }

  connectWebSocket(apiKey);
}

function connectWebSocket(apiKey: string) {
  if (wsClient) {
    try {
      wsClient.removeAllListeners();
      wsClient.close();
    } catch (e) {}
  }

  const url = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`;
  wsClient = new WebSocket(url);

  wsClient.on("open", () => {
    wsConnected = true;
    wsReconnectAttempts = 0;

    if (wsStableTimer) clearTimeout(wsStableTimer);

    wsStableTimer = setTimeout(() => {
      if (wsConnected && hasNotifiedWsDisconnect) {
        sendTelegramMessage(
          "✅ *TWELVEDATA WS RECONNECTED* \nWebsocket stream restored stably.",
        );
        hasNotifiedWsDisconnect = false;
      }
    }, 15000);

    stopFallbackPolling();

    // Subscribe to symbols
    wsClient?.send(
      JSON.stringify({
        action: "subscribe",
        params: {
          symbols: "XAU/USD,EUR/USD",
        },
      }),
    );
  });

  wsClient.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.event === "price") {
        const symbol = msg.symbol;
        const price = parseFloat(msg.price);
        if (symbol === "XAU/USD" && price > 0) {
          updateLivePrice("XAUUSD", price);
        } else if (symbol === "EUR/USD" && price > 0) {
          updateLivePrice("EURUSD", price);
        }
      }
    } catch (err) {
      // ignore parse errors
    }
  });

  wsClient.on("error", (err) => {
    // reduce log noise on simple ws errors
    if (!hasNotifiedWsDisconnect) {
      addSystemError(`TwelveData WS Error: ${err.message}`);
    }
  });

  wsClient.on("close", () => {
    wsConnected = false;

    if (wsStableTimer) clearTimeout(wsStableTimer);

    if (!hasNotifiedWsDisconnect) {
      sendTelegramMessage(
        "⚠️ *TWELVEDATA WS DISCONNECTED* \nFalling back to REST API polling.",
      );
      hasNotifiedWsDisconnect = true;
    }

    startFallbackPolling();

    if (wsReconnectTimeout) clearTimeout(wsReconnectTimeout);
    wsReconnectAttempts++;
    const backoff = Math.min(
      10000 * Math.pow(2, wsReconnectAttempts - 1),
      60000,
    );
    wsReconnectTimeout = setTimeout(() => connectWebSocket(apiKey), backoff);
  });
}

function startFallbackPolling() {
  if (fallbackInterval) return;
  fallbackInterval = setInterval(async () => {
    try {
      const pGold = await fetchLatestPrice("GC=F");
      if (pGold) updateLivePrice("XAUUSD", pGold);
    } catch (err: any) {
      addSystemError(`Gold price fallback feed error: ${err.message}`);
    }
    try {
      const pEur = await fetchLatestPrice("EURUSD=X");
      if (pEur) updateLivePrice("EURUSD", pEur);
    } catch (err: any) {
      addSystemError(`EURUSD price fallback feed error: ${err.message}`);
    }
  }, 20000);
}

function stopFallbackPolling() {
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
  }
}

export function normalizeSymbolForProvider(
  symbol: string,
  provider: "TWELVEDATA" | "YAHOO" | "MT5",
): string {
  if (
    symbol === "GC=F" ||
    symbol === "XAUUSD" ||
    symbol === "GOLD" ||
    symbol === "XAU/USD"
  ) {
    if (provider === "TWELVEDATA") return "XAU/USD";
    if (provider === "YAHOO") return "GC=F";
    if (provider === "MT5") return "XAUUSD";
  }
  if (
    symbol === "EUR=X" ||
    symbol === "EURUSD" ||
    symbol === "EURUSD=X" ||
    symbol === "EUR/USD"
  ) {
    if (provider === "TWELVEDATA") return "EUR/USD";
    if (provider === "YAHOO") return "EURUSD=X";
    if (provider === "MT5") return "EURUSD";
  }
  return symbol;
}

export async function fetchLatestPrice(symbol: string): Promise<number | null> {
  const tdSymbol = normalizeSymbolForProvider(symbol, "TWELVEDATA");

  // 1. Try Direct Feed Layer
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (apiKey && Date.now() > twelveDataCooldown) {
    try {
      const url = `https://api.twelvedata.com/price?symbol=${tdSymbol}&apikey=${apiKey}`;
      const res = await axios.get(url);
      if (res.data && res.data.price) {
        hasNotifiedTwelveDataFailure = false;
        return parseFloat(res.data.price);
      }
      if (res.data && res.data.code === 429) {
        throw new Error("429 Too Many Requests");
      }
    } catch (err: any) {
      if (
        err.message.includes("429") ||
        (err.response && err.response.status === 429)
      ) {
        twelveDataCooldown = Date.now() + 60000; // 1 minute cooldown
      }
      console.error(
        `TwelveData Price Failed for ${symbol}, falling back to Yahoo...`,
      );
      addSystemError(`TwelveData Price Failed for ${symbol}: ${err.message}`);
      if (
        !hasNotifiedTwelveDataFailure &&
        Date.now() > (global as any).telegramFailDelay
      ) {
        sendTelegramMessage(
          `⚠️ *TWELVEDATA API FAILURE* \nQuota exhausted or error.\nSystem falling back to Yahoo Finance for ${symbol}. \nError: ${err.message}`,
        );
        hasNotifiedTwelveDataFailure = true;
        (global as any).telegramFailDelay = Date.now() + 4 * 3600000; // 4 hours
      }
    }
  }

  // 2. Fallback Layer
  const yfSymbol = normalizeSymbolForProvider(symbol, "YAHOO");
  try {
    const quote = (await yahooFinance.quote(yfSymbol)) as any;
    return quote.regularMarketPrice || null;
  } catch (err) {
    return null;
  }
}

const candleCache: Record<string, { time: number; data: OHLC[] }> = {};

export async function fetchMarketData(
  symbol: string,
  interval: string,
  count: number,
): Promise<OHLC[]> {
  const cacheKey = `${symbol}_${interval}_${count}`;
  if (
    candleCache[cacheKey] &&
    Date.now() - candleCache[cacheKey].time < 55000
  ) {
    // 55 sec cache
    return candleCache[cacheKey].data;
  }

  let telegramNotificationCooldown = 0;

  // 1. Try Direct Feed Layer
  if (process.env.TWELVEDATA_API_KEY && Date.now() > twelveDataCooldown) {
    try {
      const data = await fetchTwelveData(symbol, interval, count);
      if (!data || data.length === 0) throw new Error("Empty TwelveData");
      hasNotifiedTwelveDataFailure = false; // Reset if it works again
      candleCache[cacheKey] = { time: Date.now(), data };
      return data;
    } catch (err: any) {
      if (
        err.message.includes("429") ||
        (err.response && err.response.status === 429) ||
        err.message.includes("Quota")
      ) {
        twelveDataCooldown = Date.now() + 60000;
      }
      console.error(
        `TwelveData Direct Failed for ${symbol}, falling back to Yahoo Finance...`,
      );
      if (
        !hasNotifiedTwelveDataFailure &&
        Date.now() > (global as any).telegramFailDelay
      ) {
        sendTelegramMessage(
          `⚠️ *TWELVEDATA API FAILURE* \nQuota exhausted or error.\nSystem falling back to Yahoo Finance for ${symbol}. \nError: ${err.message}`,
        );
        hasNotifiedTwelveDataFailure = true;
        (global as any).telegramFailDelay = Date.now() + 4 * 3600000; // Only notify every 4 hours max
      }
    }
  }

  // 2. Fallback Layer
  try {
    const yfSymbol = normalizeSymbolForProvider(symbol, "YAHOO");
    const res = await fetchYahooFinance(yfSymbol, interval, count);
    candleCache[cacheKey] = { time: Date.now(), data: res };
    return res;
  } catch (fallbackErr: any) {
    console.error(
      `Yahoo Finance Failed for ${symbol}:`,
      fallbackErr?.message || String(fallbackErr),
    );
    addSystemError(
      `Yahoo Finance Data Fetch Failed for ${symbol}: ${fallbackErr.message}`,
    );
    throw new Error("All Market Data Sources Failed");
  }
}

async function fetchTwelveData(
  symbol: string,
  interval: string,
  count: number,
): Promise<OHLC[]> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) throw new Error("No TWELVEDATA_API_KEY in environment");

  const tdSymbol = normalizeSymbolForProvider(symbol, "TWELVEDATA");
  // Map interval logic: M1, M5, M15, H1, H4
  let tdInterval = "1min";
  if (interval === "M1" || interval === "1m") tdInterval = "1min";
  else if (interval === "M5" || interval === "5m") tdInterval = "5min";
  else if (interval === "M15" || interval === "15m") tdInterval = "15min";
  else if (interval === "H1" || interval === "1h") tdInterval = "1h";
  else if (interval === "H4" || interval === "4h") tdInterval = "4h";
  else tdInterval = interval; // fallback

  const url = `https://api.twelvedata.com/time_series?symbol=${tdSymbol}&interval=${tdInterval}&outputsize=${count}&apikey=${apiKey}`;
  const response = await axios.get(url);

  if (response.data.status !== "ok") {
    throw new Error(response.data.message || "TwelveData API Error");
  }

  const values = response.data.values;
  return values
    .map((v: any) => ({
      timestamp: new Date(v.datetime),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume) || 0,
    }))
    .reverse(); // Reverse so oldest is first, newest is last.
}

async function fetchYahooFinance(
  symbol: string,
  interval: string,
  count: number,
): Promise<OHLC[]> {
  let period1 = new Date();

  // subtract time depending on interval to ensure enough bars
  let multiplier = 1;
  if (interval === "1m" || interval === "M1") multiplier = 1;
  else if (interval === "5m" || interval === "M5") multiplier = 5;
  else if (interval === "15m" || interval === "M15") multiplier = 15;
  else if (interval === "1h" || interval === "H1") multiplier = 60;
  else if (interval === "4h" || interval === "H4") multiplier = 240;

  period1.setMinutes(
    period1.getMinutes() - count * multiplier * 2 - 5 * 24 * 60,
  ); // Add 5 days buffer for weekends and holidays

  let validInterval = interval; // yahoo uses 1m, 2m, 5m, 15m, 30m, 60m
  let isH4 = false;
  if (interval === "H1" || interval === "1h") {
    validInterval = "60m";
  } else if (interval === "H4" || interval === "4h") {
    validInterval = "60m";
    isH4 = true;
    period1.setMinutes(period1.getMinutes() - count * 4 * 60); // request plenty more 1H data for H4
  } else if (interval === "M1" || interval === "1m") {
    validInterval = "1m";
  } else if (interval === "M5" || interval === "5m") {
    validInterval = "5m";
  } else if (interval === "M15" || interval === "15m") {
    validInterval = "15m";
  }

  const result = (await yahooFinance.chart(symbol, {
    period1: period1,
    interval: validInterval as any,
  })) as any;

  if (!result || !result.quotes || result.quotes.length === 0) {
    throw new Error("Yahoo Finance returned no quotes");
  }

  let quotes = result.quotes.filter(
    (q: any) => q.open !== null && q.high !== null && q.open !== undefined,
  );

  let mappedOHLC = quotes.map((q: any) => ({
    timestamp: new Date(q.date),
    open: q.open!,
    high: q.high!,
    low: q.low!,
    close: q.close!,
    volume: q.volume || 0,
  }));

  if (isH4) {
    const h4Aggregated: OHLC[] = [];
    let currentH4: OHLC | null = null;
    let currentH4Chunk = -1;

    for (const q of mappedOHLC) {
      // Align boundaries to 4-hour blocks relative to UTC
      const chunkIdx = Math.floor(q.timestamp.getTime() / (4 * 60 * 60 * 1000));
      if (chunkIdx !== currentH4Chunk) {
        if (currentH4) h4Aggregated.push(currentH4);
        currentH4Chunk = chunkIdx;
        currentH4 = { ...q }; // start new candle
      } else if (currentH4) {
        currentH4.high = Math.max(currentH4.high, q.high);
        currentH4.low = Math.min(currentH4.low, q.low);
        currentH4.close = q.close;
        currentH4.volume += q.volume;
      }
    }
    if (currentH4) h4Aggregated.push(currentH4);
    mappedOHLC = h4Aggregated;
  }

  if (mappedOHLC.length > count) {
    mappedOHLC = mappedOHLC.slice(-count);
  }

  return mappedOHLC;
}
