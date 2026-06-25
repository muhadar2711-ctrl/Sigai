
import { Telegraf } from "telegraf";
import { systemState, addSystemError } from "./state/state_manager.js";
import { TradeSignal } from "./strategies/types.js";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || "");
const chatId = process.env.TELEGRAM_CHAT_ID || "";

export async function sendTelegramSignal(signal: TradeSignal, state: typeof systemState) {
    // WAJIB: Guard Clause untuk mencegah crash runtime
    if (
        !signal ||
        typeof signal.entry !== 'number' ||
        typeof signal.sl !== 'number' ||
        typeof signal.tp !== 'number' ||
        typeof signal.rrRatio !== 'number' ||
        typeof signal.confidence !== 'number'
    ) {
        addSystemError("TELEGRAM_INVALID_SIGNAL_DATA", { 
            error: "Incomplete or invalid signal object received.",
            signalData: signal // Log the problematic signal data
        });
        console.error("[TELEGRAM] Aborted sending signal due to incomplete data:", signal);
        return; // Hentikan eksekusi untuk mencegah crash
    }

    if (!chatId) {
        addSystemError("TELEGRAM_SEND_FAILED", { error: "Chat ID not configured" });
        return;
    }

    try {
        const message = `
        🚨 *New Signal: ${signal.strategy}*
        
        *Symbol:* ${signal.symbol}
        *Type:* ${signal.type}
        *Entry:* ${signal.entry.toFixed(2)}
        *Stop Loss:* ${signal.sl.toFixed(2)}
        *Take Profit:* ${signal.tp.toFixed(2)}
        *R/R Ratio:* ${signal.rrRatio.toFixed(2)}

        *Confidence:* ${(signal.confidence * 100).toFixed(0)}%
        *AI Verdict:* ${signal.ai_verdict || "N/A"}
        *AI Reason:* ${signal.ai_reason || "N/A"}

        *Signal ID:* \`${signal.id || "N/A"}\`
        `;

        await bot.telegram.sendMessage(chatId, message, { parse_mode: "Markdown" });
        console.log(`[TELEGRAM] Signal ${signal.id} sent successfully.`);

    } catch (error: any) {
        console.error("[TELEGRAM] Error sending signal:", error);
        addSystemError("TELEGRAM_SEND_FAILED", { error: error.message, signalId: signal.id });
    }
}
