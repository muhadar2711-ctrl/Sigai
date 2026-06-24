
import TelegramBot from 'node-telegram-bot-api';
import { systemState, addSystemError } from './services/engine.js';
import { TradeSignal } from './strategies/types.js'; // Using the standardized type
import { getSupabase, initSupabase } from './supabase.js';

let bot: TelegramBot | null = null;

// FIX: Function signature updated to accept the standardized TradeSignal object.
export async function sendTelegramSignal(signal: any, state: any) {
    if (!bot) {
        console.log("[TELEGRAM] Bot not initialized, skipping signal.");
        return;
    }

    const chatId = "-4228956919"; // Prod Channel

    // FIX: Message format updated to use the single 'tp' property.
    const message = `
✅ New Signal: *${signal.type} ${signal.symbol}*

*Strategy:* ${signal.strategy}
*Entry:* ${signal.entry}
*Stop Loss:* ${signal.sl}
*Take Profit:* ${signal.tp}
*Risk/Reward Ratio:* 1:${signal.rrRatio}

*AI Confidence:* ${signal.confidence * 100}%
*AI Verdict:* ${signal.ai_verdict}

\#${signal.symbol.replace('/', '')} \#${signal.strategy}
    `;

    try {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        console.log(`[TELEGRAM] Signal sent to ${chatId}`);
    } catch (error: any) {
        addSystemError("TELEGRAM_SEND_FAILED", { error: error.message, signalId: signal.id });
    }
}

export function initTelegram() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.log("[TELEGRAM] TELEGRAM_BOT_TOKEN not set. Bot is disabled.");
        return;
    }

    bot = new TelegramBot(token);
    bot.on('polling_error', (error) => {
        console.error('[TELEGRAM] Polling error:', error.message);
    });

    bot.startPolling().then(() => {
        console.log('[TELEGRAM] Bot started polling for updates.');
    }).catch(err => {
        addSystemError('TELEGRAM_POLLING_START_FAILED', { error: err.message });
    });
}

export function getBot() {
    return bot;
}
