
import TelegramBot from 'node-telegram-bot-api';
import { TradeSignal } from './strategies/types.js'; // FIX: Corrected import path
import { SystemState } from './state/state_manager.js'; // FIX: Corrected import path

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '';
const bot = new TelegramBot(token);

export async function sendTelegramSignal(signal: TradeSignal, state: SystemState): Promise<void> {
    try {
        const { 
            strategyName,
            symbol,
            action, 
            price,
            stopLoss,
            takeProfit,
            rrRatio,
            ai_verdict, 
            ai_reason 
        } = signal;

        const verdictIcon = ai_verdict === 'APPROVED' ? '✅' : '❌';
        const actionIcon = action === 'BUY' ? '🟢' : '🔴';

        const message = `
${actionIcon} *${action} Signal: ${symbol}*

*Strategy:* ${strategyName}
*Entry Price:* ${price}
*Stop Loss:* ${stopLoss}
*Take Profit:* ${takeProfit}
*Risk/Reward Ratio:* ${rrRatio?.toFixed(2)}

*AI Validation:* ${verdictIcon} ${ai_verdict}
*AI Reason:* ${ai_reason || 'N/A'}
        `;

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        console.log(`[TELEGRAM] Signal for ${symbol} sent successfully.`);

    } catch (error) {
        console.error('[TELEGRAM] Failed to send signal:', error);
    }
}
