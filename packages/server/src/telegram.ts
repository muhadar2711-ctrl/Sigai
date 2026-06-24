
import { Telegraf } from 'telegraf';
import { TradeSignal } from './strategies/types.js';
import { systemState, addSystemError } from './state/state_manager.js';

let bot: Telegraf<any>;

export function initTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    bot = new Telegraf(token);
    // ... bot setup
    console.log('[TELEGRAM] Bot initialized.');
  } else {
    console.warn('[TELEGRAM] Bot token not found, skipping initialization.');
  }
}

export async function sendTelegramSignal(signal: TradeSignal, state: typeof systemState) {
  if (!bot) return;
  
  const message = `
  🚨 *New Signal - ${signal.strategy}* 🚨
  
  *Symbol:* ${signal.symbol}
  *Type:* ${signal.type}
  *Entry:* ${signal.entry.toFixed(2)}
  *Stop Loss:* ${signal.sl.toFixed(2)}
  *Take Profit:* ${signal.tp.toFixed(2)}
  *R/R Ratio:* ${signal.rrRatio.toFixed(2)}:1
  
  *AI Verdict:* ${signal.ai_verdict} 
  *Reason:* ${signal.ai_reason}
  `;

  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (chatId) {
    try {
      await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error: any) {
        addSystemError('TELEGRAM_SEND_FAILED', { error: error.message, signalId: signal.id });
    }
  }
}
