import axios from "axios";
import * as cheerio from "cheerio";
import { addSystemError } from "./engine.js";

let newsApiCooldownUntil = 0;

// Cache for ForexFactory data
let cachedEvents: any[] = [];
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export async function checkNewsBlock(): Promise<{
  isBlocked: boolean;
  reason: string;
}> {
  const nowMs = Date.now();

  /*
  // This functionality is disabled as the Python backend is not available in the current environment.
  const pyBackendUrl = process.env.MCP_SERVER_URL || "http://127.0.0.1:8000";
  try {
    const ffResponse = await axios.get(`${pyBackendUrl}/news/forexfactory`, {
      timeout: 8000,
    });
    // Note: The original logic for this section was incomplete.
    // If the Python service is ever restored, this part may need implementation.
  } catch (err: any) {
    // console.warn("Python MCP ForexFactory connection attempt failed (as expected):");
  }
  */

  // FOREXFACTORY JSON DIRECT (WITH CACHING)
  try {
    if (nowMs - cacheTimestamp < CACHE_DURATION_MS && cachedEvents.length > 0) {
        // Using cached data
    } else {
        const ffJson = await axios.get(
            "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
            { timeout: 10000 },
        );
        cachedEvents = ffJson.data as Array<any>;
        cacheTimestamp = nowMs;
        console.log("[NEWS_ENGINE] Refreshed ForexFactory event cache.");
    }

    for (const ev of cachedEvents) {
      if (ev.country === "USD" && ev.impact === "High") {
        const evTime = new Date(ev.date).getTime();
        const diffMinutes = (evTime - nowMs) / (1000 * 60);

        if (diffMinutes >= -30 && diffMinutes <= 30) {
          return {
            isBlocked: true,
            reason: `FF_HIGH_IMPACT_ACTIVE: ${ev.title} (${diffMinutes.toFixed(0)}m away)`,
          };
        }
      }
    }
  } catch (e: any) {
    console.warn("ForexFactory JSON fetch failed: " + e.message);
  }

  // NEWSAPI FALLBACK
  const newsApiKey = process.env.NEWSAPI_KEY || process.env.NEWS_API_KEY;

  if (newsApiKey && nowMs > newsApiCooldownUntil) {
    const keywords = ["Federal Reserve", "Interest Rate", "FOMC", "Gold"];
    try {
      const q = keywords.join(" OR ");
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&apiKey=${newsApiKey}&pageSize=3`;
      const res = await axios.get(url, { timeout: 5000 });

      const articles = res.data.articles || [];
      const now = new Date();

      for (const article of articles) {
        const pubDate = new Date(article.publishedAt);
        const diffMinutes =
          Math.abs(now.getTime() - pubDate.getTime()) / (1000 * 60);
        if (diffMinutes <= 15) {
          return {
            isBlocked: true,
            reason: `NEWS_BLOCK (NewsAPI): ${article.title}`,
          };
        }
      }
    } catch (err: any) {
      console.error("NewsAPI Error:", err?.message || String(err));
      newsApiCooldownUntil = nowMs + 15 * 60 * 1000;
      addSystemError(`NewsAPI Error. Disabled 15m.`);
    }
  }

  return { isBlocked: false, reason: "" };
}
