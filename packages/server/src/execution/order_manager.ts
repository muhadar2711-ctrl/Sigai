import { metaApiBridge } from "./metaapi_bridge.js";

export class OrderManager {
  static async executeWithRetry(
    symbol: string,
    action: "BUY" | "SELL" | "CLOSE",
    volume: number,
    sl: number,
    tp: number,
    ticket?: string,
    retries = 3,
  ) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await metaApiBridge.executeTrade(
          symbol,
          action,
          volume,
          sl,
          tp,
        );
        return { success: true, attempt, result };
      } catch (err: any) {
        console.error(
          `[EXECUTION_ENGINE] Attempt ${attempt} failed: ${err.message}`,
        );
        if (attempt === retries) {
          return { success: false, error: err.message };
        }
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }
  }
}
