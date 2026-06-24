
import { NewsApiClient } from "./utils/news_api_client.js";
import { systemState, addSystemError } from './state/state_manager.js';

const newsClient = new NewsApiClient(process.env.NEWS_API_KEY);

export async function checkNewsBlock(symbol: string): Promise<boolean> {
    try {
        // Logic to check for high-impact news
        const isBlocked = await newsClient.hasHighImpactNews(symbol);
        systemState.isNewsBlocked = isBlocked;
        return isBlocked;
    } catch (error: any) {
        addSystemError("NEWS_CHECK_FAILED", { error: error.message, symbol });
        return false; // Fail-safe: don't block trades if news check fails
    }
}
