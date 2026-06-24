import TelegramBot from "node-telegram-bot-api";
import { addSystemError } from "./engine.js";

let bot: TelegramBot | null = null;

const telegramDedupeCache: Record<string, number> = {};

interface QueueItem {
  type: "html" | "text";
  chatId: string;
  text: string;
}

const messageQueue: QueueItem[] = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (messageQueue.length > 0) {
    const item = messageQueue.shift();
    if (item && bot) {
      try {
        if (item.type === "html") {
          await bot.sendMessage(item.chatId, item.text, { parse_mode: "HTML" });
        } else {
          await bot.sendMessage(item.chatId, item.text);
        }
      } catch (err: any) {
        console.error("Telegram Send Error:", err?.message || String(err));

        if (err?.response?.statusCode === 429 || err?.code === "ETELEGRAM") {
          const retryAfter = err?.response?.body?.parameters?.retry_after || 60;
          console.warn(`Telegram rate limit. Backing off for ${retryAfter}s...`);
          addSystemError(`Telegram Rate-limit hit. Cooldown ${retryAfter}s`);
          messageQueue.unshift(item); // Re-queue
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        } else {
          addSystemError(`Telegram Send Error: ${err.message}`);
        }
      }

      await new Promise((r) => setTimeout(r, 1200)); // ~1 message per second to be safe
    }
  }

  isProcessingQueue = false;
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function initTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("No TELEGRAM_BOT_TOKEN. Telegram will not send messages.");
    return;
  }

  bot = new TelegramBot(token, { polling: false });
}

export async function sendTelegramSignal(signal: any, systemState?: any) {
  if (!bot) return;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  const dedupeKey = `sig_${signal.id}`;
  if (
    telegramDedupeCache[dedupeKey] &&
    Date.now() < telegramDedupeCache[dedupeKey]
  ) {
    return;
  }
  telegramDedupeCache[dedupeKey] = Date.now() + 24 * 3600000; // 24 hours lock for exact signal

  const tradeMode = systemState?.autotrade?.tradeMode || "MANUAL";
  const executionProvider = systemState?.autotrade?.executionProvider || "NONE";

  const msg = `
🚨 <b>SINYAL TRADING BARU</b> 🚨
<b>Simbol</b>: ${escapeHtml(signal.symbol)} 
<b>Arah</b>: ${signal.type === "BUY" ? "🟢 BUY" : "🔴 SELL"}

<b>Strategi</b>: ${escapeHtml(signal.strategy || "SMC")}
<b>Timeframe</b>: ${escapeHtml(signal.timeframe || "M5")}
<b>Status</b>: ${escapeHtml(signal.status?.replace("_", " "))}
<b>Harga Entry</b>: ${signal.entry.toFixed(2)}
<b>Stop Loss (SL)</b>: ${signal.sl.toFixed(2)}
<b>Take Profit 1</b>: ${signal.tp1.toFixed(2)}
<b>Take Profit 2</b>: ${signal.tp2.toFixed(2)}
<b>Take Profit 3</b>: ${signal.tp3 ? signal.tp3.toFixed(2) : "-"}
<b>Risk Reward (RR)</b>: 1:${signal.rrRatio ? signal.rrRatio.toFixed(1) : "1.7"}

<b>Analisis Tambahan</b>:
- Pips Target (TP1): ${Math.abs(signal.tp1 - signal.entry) * (signal.symbol.includes("XAU") ? 10 : 10000)} Pips
- ATR: ${signal.atr ? signal.atr.toFixed(2) : "-"} (Pengali: ${signal.atrMultiplier || 1.0}x)
- Keyakinan (Confidence): ${signal.confidence}%
- Validasi AI: ${escapeHtml(signal.ai_verdict)}
- Alasan: ${escapeHtml(signal.ai_reason ? (signal.ai_reason.length > 60 ? signal.ai_reason.slice(0, 60) + "..." : signal.ai_reason) : "-")}

<b>Sistem</b>:
- Mode Trade: ${escapeHtml(tradeMode)}
- Provider: ${escapeHtml(executionProvider)}
- Waktu: ${escapeHtml(new Date(signal.timestamp).toLocaleString("id-ID", { timeZone: "Asia/Makassar" }))} WITA
  `.trim();

  messageQueue.push({ type: "html", chatId, text: msg });
  processQueue();
}

export async function sendTelegramUpdate(
  signal: any,
  statusType: string,
  pips: number,
) {
  if (!bot) return;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  const dedupeKey = `upd_${signal.id}_${statusType}`;
  if (
    telegramDedupeCache[dedupeKey] &&
    Date.now() < telegramDedupeCache[dedupeKey]
  ) {
    return;
  }
  telegramDedupeCache[dedupeKey] = Date.now() + 24 * 3600000;

  let header = "";
  if (statusType === "TP1_HIT") header = "✅ <b>TAKE PROFIT 1 TERCAPAI</b> ✅";
  else if (statusType === "TP2_HIT")
    header = "🚀 <b>TAKE PROFIT 2 TERCAPAI</b> 🚀";
  else if (statusType === "TP3_HIT")
    header = "🔥 <b>TAKE PROFIT 3 TERCAPAI (MAX GAIN)</b> 🔥";
  else if (statusType === "BREAKEVEN")
    header = "🛡 <b>SL DIPINDAH KE BREAKEVEN</b> 🛡";
  else if (statusType === "SL_HIT") header = "❌ <b>STOP LOSS TERCAPAI</b> ❌";
  else if (statusType === "INVALIDATED")
    header = "⚠️ <b>SINYAL DIBATALKAN (INVALID)</b> ⚠️";
  else if (statusType === "EXPIRED") header = "⏳ <b>SINYAL KEDALUWARSA</b> ⏳";
  else header = "ℹ️ <b>UPDATE SINYAL</b> ℹ️";

  const msg = `
${header}
<b>Simbol</b>: ${escapeHtml(signal.symbol)} (${signal.type})
<b>Strategi</b>: ${escapeHtml(signal.strategy || "SMC")}
<b>Status Saat Ini</b>: ${escapeHtml(statusType.replace("_", " "))}
<b>Pips Berjalan</b>: ${pips > 0 ? "+" : ""}${pips.toFixed(1)} Pips
<b>Harga Terkini</b>: ${signal.lastPrice ? signal.lastPrice.toFixed(2) : "-"}
  `.trim();

  messageQueue.push({ type: "html", chatId, text: msg });
  processQueue();
}

export async function sendTelegramMessage(text: string) {
  if (!bot) return;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  const dedupeKey = `msg_${text.slice(0, 50)}`;
  if (
    telegramDedupeCache[dedupeKey] &&
    Date.now() < telegramDedupeCache[dedupeKey]
  ) {
    return;
  }
  telegramDedupeCache[dedupeKey] = Date.now() + 4 * 3600000; // 4 hours for simple messages/errors

  messageQueue.push({ type: "text", chatId, text });
  processQueue();
}
