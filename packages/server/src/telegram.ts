
import { TradeSignal } from "../strategies/types.js";
import { getSystemState } from "../state/state_manager.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegramSignal(signal: TradeSignal, systemState: any) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error("[TELEGRAM] Bot token or chat ID is missing.");
        return;
    }

    const message = `
        *New Signal: ${signal.strategyName}*
        --------------------------------------
        Symbol: *${signal.symbol}*
        Direction: *${signal.direction}*
        Entry Price: *${signal.price.toFixed(2)}*
        Stop Loss: *${signal.stopLoss?.toFixed(2) || 'N/A'}*
        Take Profit: *${signal.takeProfit?.toFixed(2) || 'N/A'}*
        Risk/Reward Ratio: *${signal.rrRatio?.toFixed(2) || 'N/A'}*
        --------------------------------------
        AI Verdict: *${signal.ai_verdict || 'N/A'}*
        Reason: *${signal.ai_reason || 'N/A'}*
    `;

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                chat_id: TELEGRAM_CHAT_ID, 
                text: message, 
                parse_mode: 'Markdown' 
            })
        });
        console.log("[TELEGRAM] Signal sent successfully.");
    } catch (error) {
        console.error("[TELEGRAM] Error sending signal:", error);
    }
}
