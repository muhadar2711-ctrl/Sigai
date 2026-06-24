
import TelegramBot from "node-telegram-bot-api";
import { addSystemError } from "./services/engine.js";
import { TradeSignal } from "./strategies/types.js"; // FIX: Import the standardized type

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
      await new Promise((r) => setTimeout(r, 1200));
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

// REFACTOR: Use strong types and a simplified, standardized message format
export async function sendTelegramSignal(signal: TradeSignal, systemState?: any) {
  if (!bot) return;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  const dedupeKey = `sig_${signal.symbol}_${signal.entry}_${signal.type}`;
  if (telegramDedupeCache[dedupeKey] && Date.now() < telegramDedupeCache[dedupeKey]) {
    return;
  }
  telegramDedupeCache[dedupeKey] = Date.now() + 24 * 3600000;

  const tradeMode = systemState?.autotrade?.tradeMode || "MANUAL";

  const msg = `
🚨 <b>SINYAL BARU: ${escapeHtml(signal.strategy)}</b> 🚨

<b>${signal.type === "BUY" ? "🟢" : "🔴"} ${escapeHtml(signal.symbol)} ${escapeHtml(signal.type)}</b>

- <b>Entry</b>: ${signal.entry.toFixed(signal.symbol.includes("XAU") ? 2 : 5)}
- <b>Stop Loss</b>: ${signal.sl.toFixed(signal.symbol.includes("XAU") ? 2 : 5)}
- <b>Take Profit</b>: ${signal.tp.toFixed(signal.symbol.includes("XAU") ? 2 : 5)}
- <b>Risk/Reward</b>: 1:${signal.rrRatio.toFixed(1)}

- <b>Keyakinan</b>: ${(signal.confidence * 100).toFixed(0)}%
- <b>Mode Sistem</b>: ${escapeHtml(tradeMode)}
- <b>Waktu</b>: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" })} WITA
  `.trim();

  messageQueue.push({ type: "html", chatId, text: msg });
  processQueue();
}

// NOTE: This function may also need refactoring if the 'signal' object it receives is not standardized.
export async function sendTelegramUpdate(
  signal: any, // WARNING: This is still 'any' and a potential point of failure.
  statusType: string,
  pips: number,
) {
  if (!bot) return;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  // Using a simple dedupe key for now
  const dedupeKey = `upd_${signal.id || signal.entry}_${statusType}`;
  if (telegramDedupeCache[dedupeKey] && Date.now() < telegramDedupeCache[dedupeKey]) {
    return;
  }
  telegramDedupeCache[dedupeKey] = Date.now() + 24 * 3600000;

  let header = "";
  if (statusType === "TP1_HIT") header = "✅ <b>TAKE PROFIT 1 TERCAPAI</b> ✅";
  else if (statusType === "BREAKEVEN") header = "🛡 <b>SL DIPINDAH KE BREAKEVEN</b> 🛡";
  else if (statusType === "SL_HIT") header = "❌ <b>STOP LOSS TERCAPAI</b> ❌";
  else if (statusType === "INVALIDATED") header = "⚠️ <b>SINYAL DIBATALKAN</b> ⚠️";
  else header = `ℹ️ <b>UPDATE: ${statusType.replace("_"," ")}</b> ℹ️`;

  const msg = `
${header}
<b>Simbol</b>: ${escapeHtml(signal.symbol)} (${signal.type})
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

  const dedupeKey = `msg_${text.slice(0, 50)}_${Date.now()}`;
  telegramDedupeCache[dedupeKey] = Date.now() + 4 * 3600000;

  messageQueue.push({ type: "text", chatId, text });
  processQueue();
}
