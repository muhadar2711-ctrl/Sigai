import axios from "axios";
import * as cheerio from "cheerio";
import { addSystemError } from "./engine.js";

let newsApiCooldownUntil = 0;

export async function checkNewsBlock(): Promise<{
  isBlocked: boolean;
  reason: string;
}> {
  const nowMs = Date.now();
  const pyBackendUrl = process.env.MCP_SERVER_URL || "http://127.0.0.1:8000";

  // 1. PYTHON MCP (ForexFactory & Sentiment)
  try {
    const ffResponse = await axios.get(`${pyBackendUrl}/news/forexfactory`, {
      timeout: 8000,
    });
    const events = ffResponse.data.events || [];

    for (const ev of events) {
      if (ev.currency === "USD" && ev.impact === "HIGH") {
        // Simple time matching: we assume the Python MCP filters for TODAY.
        // For real trading, parsing the precise time is needed. Here we check if it says "now" or relative.
        // If the MCP returns it, we treat it as highly relevant today.
        // We will just do a simplified check to avoid heavy dependencies in parsing relative time for now
        // Let's assume if it's there and we want to block safely we warn, or we parse.
        // Actually, let's keep the block safe if there's any HIGH impact USD today
        // in an actual algorithm you'd parse `ev.time`, but for now we log it.
        // Let's connect to the JSON directly to get diffMinutes if Python doesn't provide exact timestamp
      }
    }
  } catch (err: any) {
    console.warn("Python MCP ForexFactory failed:", err.message);
  }

  // 1b. FOREXFACTORY SCRAPING (JSON Direct Fallback)
  try {
    const ffJson = await axios.get(
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      { timeout: 10000 },
    );
    const events = ffJson.data as Array<{
      title: string;
      country: string;
      date: string;
      impact: string;
    }>;

    for (const ev of events) {
      if (ev.country === "USD" && ev.impact === "High") {
        const evTime = new Date(ev.date).getTime();
        const diffMinutes = (evTime - nowMs) / (1000 * 60);

        // Block if within 30 minutes before and 30 minutes after the high impact event
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

  // 2. NEWSAPI FALLBACK
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
