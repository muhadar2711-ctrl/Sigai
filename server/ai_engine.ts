import { addSystemError, systemState } from "./engine.js";
import { memoryManager } from "./memory.js";
import {
  validateSignalAdapter,
  chatCompletionFull,
  generateContent,
  retrieveKnowledgeContext,
} from "./services/ai_adapter.js";

// --- TAHAP 2: PIPELINE ORKESTRASI TRADING ANALYST ---

export function detectTradingIntents(
  message: string,
  hasImage: boolean,
): string[] {
  const intents: string[] = [];
  const msgLower = (message || "").toLowerCase();

  if (hasImage) {
    intents.push("Chart Analyst");
    intents.push("Market Structure Analyst");
  }

  if (
    msgLower.includes("strategi") ||
    msgLower.includes("entry") ||
    msgLower.includes("setup") ||
    msgLower.includes("signal") ||
    msgLower.includes("analisa") ||
    msgLower.includes("buy") ||
    msgLower.includes("sell")
  ) {
    intents.push("Strategy Builder");
  }

  if (
    msgLower.includes("risk") ||
    msgLower.includes("lot") ||
    msgLower.includes("sl") ||
    msgLower.includes("tp") ||
    msgLower.includes("margin") ||
    msgLower.includes("modal")
  ) {
    intents.push("Risk Manager");
  }

  if (
    msgLower.includes("news") ||
    msgLower.includes("berita") ||
    msgLower.includes("fomc") ||
    msgLower.includes("cpi") ||
    msgLower.includes("nfp") ||
    msgLower.includes("us") ||
    msgLower.includes("usd") ||
    msgLower.includes("yield")
  ) {
    intents.push("News Analyst");
  }

  // If it's a general question or conversational
  if (intents.length === 0 && !hasImage) {
    intents.push("Mentor Trading");
  }

  return [...new Set(intents)];
}

export function resolveSkillChain(intents: string[]): string[] {
  const chain = [...intents];
  if (
    intents.includes("Strategy Builder") ||
    intents.includes("Chart Analyst")
  ) {
    chain.push("Self Critic");
  }
  return chain;
}

export async function runOrchestratedChat(
  message: string,
  images_base64: string[],
  history: any[],
  baseSystemPrompt: string,
): Promise<{
  finalAnswer: string;
  providerStatus: string;
  detectedMode: string;
  intermediateSteps?: { agent: string; content: string }[];
}> {
  const hasImages = images_base64 && images_base64.length > 0;
  const activeSkills = detectTradingIntents(message, hasImages);
  const fullChain = resolveSkillChain(activeSkills);

  const primaryMode = activeSkills.includes("Chart Analyst")
    ? "market_scan"
    : activeSkills.includes("News Analyst")
      ? "news_filter"
      : activeSkills.includes("Strategy Builder")
        ? "strategy_builder"
        : activeSkills.includes("Risk Manager")
          ? "risk_manager"
          : "general";

  const rawBiasDetect =
    message.toLowerCase().includes("buy") ||
    message.toLowerCase().includes("long")
      ? "BULLISH"
      : message.toLowerCase().includes("sell") ||
          message.toLowerCase().includes("short")
        ? "BEARISH"
        : undefined;

  const memoryContext = memoryManager.buildMemoryContext(rawBiasDetect);
  const knowledgeContext = retrieveKnowledgeContext(activeSkills);

  let pySentiment = "Unknown";

  // Real Media Sentiment extraction using NewsAPI
  try {
    const newsApiKey = process.env.NEWSAPI_KEY || process.env.NEWS_API_KEY;
    if (newsApiKey) {
      const axios = (await import("axios")).default;
      const url = `https://newsapi.org/v2/everything?q=Gold OR XAUUSD OR USD&sortBy=relevancy&apiKey=${newsApiKey}&pageSize=3`;
      const res = await axios.get(url, { timeout: 3000 });
      const articles = res.data.articles || [];
      if (articles.length > 0) {
        const headlines = articles.map((a: any) => a.title).join(" | ");
        pySentiment = `Real-time Market Headlines: ${headlines}`;
      } else {
        pySentiment =
          "No recent major market headlines regarding Gold/USD found.";
      }
    } else {
      pySentiment =
        "News API Key not configured; unable to fetch live media sentiment.";
    }
  } catch (err: any) {
    console.warn("Could not fetch media sentiment:", err.message);
  }

  const liveDataContext = `LIVE MARKET & SYSTEM CONTEXT SYNC:
- Twitter/Media Sentiment: ${pySentiment}
- Engine Mode & AutoTrade: ${systemState.engineMode || "STANDARD"} | ${systemState.robotStatus || "OFF"}
- Is News Blocked Active: ${systemState.isNewsBlocked ? "YES (HIGH IMPACT NEWS DILUAR SANA, NO ENTRY)" : "NO"}

WARNING KRITIS: 
1. Gunakan Live Market Data dan matriks Strategi di atas (base system prompt) sebagai fakta utama. JANGAN merekayasa angka.
2. TIDAK ADA HALUSINASI DATA. KETIKA HARGA ATAU SETUP TIDAK ADA, JAWAB "DATA TIDAK TERSEDIA".
3. Jawab pertanyaan user dengan responsif, terstruktur, Cerdas, dan Profesional.`;

  // Quick fallback if it's just a general question and we want faster natural processing
  if (activeSkills.length === 1 && activeSkills[0] === "Mentor Trading") {
    const sysContext = `${baseSystemPrompt}\n\n${liveDataContext}\n\n${knowledgeContext}\n\nTugasmu adalah sebagai Mentor Trading AI yang friendly, profesional, dan tajam. Jawab pertanyaan user secara kasual namun penuh insight. Tidak perlu memformat seperti robot report. Gunakan bahasa Indonesia.`;
    try {
      const res = await chatCompletionFull(
        history.concat([{ role: "user", content: message }]),
        sysContext,
        undefined,
        undefined,
        { mode: "general" },
      );
      return {
        finalAnswer:
          res.choices[0]?.message?.content || "Sistem merespons dengan senyap.",
        providerStatus: "primary_active",
        detectedMode: "general",
        intermediateSteps: [
          {
            agent: "Mentor AI",
            content: "Processed gracefully as normal chat.",
          },
        ],
      };
    } catch (err: any) {
      console.warn("[Mentor Chat] Failed, failing over.");
    }
  }

  let intermediateSteps: { agent: string; content: string }[] = [];
  const messagesPayload = [
    ...history.filter((m) => !m.content?.startsWith("*(")),
  ];

  const agentTasks = activeSkills.map(async (skill) => {
    let skillInstruction = "";
    switch (skill) {
      case "Chart Analyst":
        skillInstruction =
          "Tugasmu membaca candle, FVG, Order Block, Liquidity Sweep berdasarkan data chart terkini.";
        break;
      case "Market Structure Analyst":
        skillInstruction =
          "Tugasmu menentukan trend makro dan mikro (BOS/CHOCH).";
        break;
      case "Strategy Builder":
        skillInstruction =
          "Tugasmu menyusun Setup Trading (Entry, SL, TP) dengan R:R minimal 1:1.5 berdasarkan konfirmasi data.";
        break;
      case "Risk Manager":
        skillInstruction =
          "Tugasmu mengevaluasi level stop loss, margin, dan menolak setup berisiko bodoh.";
        break;
      case "News Analyst":
        skillInstruction =
          "Tugasmu mengekstrapolasi data sentimen pasar, atau jika data news tersedia, korelasikan dampaknya terhadap usd.";
        break;
      default:
        skillInstruction = "Berikan analisa netral.";
        break;
    }

    const prompt = `${baseSystemPrompt}

${knowledgeContext}

${liveDataContext}

INSTRUKSI INTERNAL SPESIALIS:
Kamu bertindak eksklusif sebagai role: ${skill}.
${skillInstruction}

ATURAN MUTLAK:
1. DILARANG KERAS MENGARANG ANGKA. Gunakan "LIVE MARKET DATA SYNC".
2. Bersikap objektif, jangan hype berlebihan. Susun draft temuan spesifik mu mengenai instruksi spesialis di atas berbasis data.`;

    try {
      const res = await chatCompletionFull(
        messagesPayload,
        prompt,
        undefined,
        undefined,
        {
          hasImage: hasImages,
          images_base64: images_base64,
          mode: primaryMode,
        },
      );
      return { agent: skill, content: res.choices[0]?.message?.content || "" };
    } catch (err: any) {
      return { agent: skill, content: `Error: ${err.message}` };
    }
  });

  const agentResults = await Promise.all(agentTasks);
  intermediateSteps = agentResults.filter((r) => r.content.length > 5);

  if (intermediateSteps.length === 0) {
    return {
      finalAnswer:
        "NO TRADE / DATA KOSONG. Gagal mendapatkan umpan balik dari para agen internal.",
      providerStatus: "primary_active",
      detectedMode: primaryMode,
    };
  }

  const criticSystemInstruction = `Kamu adalah Chief Trading Analyst AI untuk Sistem SMC XAUUSD.
Tugasmu mereview hasil investigasi Agen Spesialis di bawah, dan menyampaikan jawaban TUNGGAL FINAL kepada user.

${memoryContext}

ATURAN PENULISAN:
- Jika user HANYA BERTANYA, jawab dengan gaya percakapan yang cerdas, rapi, dan profesional.
- JIKA USER MEMINTA ANALISA SETUP/SIGNAL, sertakan ringkasan setup terstruktur (Format Bebas namun harus termuat: Bias, Entry Zone, SL, TP, Confidence, Final Action).
- JANGAN BERHALUSINASI DATA. Jika agen internal bilang tidak ada konfirmasi kuat, katakan NO TRADE atau WAIT.
- Berikan insight berkelas (jangan kaku seperti mesin robot). Gunakan bahasa Indonesia.`;

  const draftCombined = intermediateSteps
    .map((step) => `--- [DRAFT ${step.agent}] ---\n${step.content}`)
    .join("\n\n");
  const criticPrompt = `PESAN USER KEPADA KITA: "${message}" \n\nBERIKUT HASIL DRAFT DARI TIM MULTI-AGEN KITA:\n\n${draftCombined}\n\nRangkum temuan internal mereka dan ciptakan jawaban komprehensif, presisi, dan natural untuk pengguna.`;

  let finalAnswer = "";
  try {
    const criticRes = await chatCompletionFull(
      [{ role: "user", content: criticPrompt }],
      criticSystemInstruction,
      undefined,
      undefined,
      { mode: "general" },
    );
    finalAnswer =
      criticRes.choices[0]?.message?.content || "Gagal membangun report";
  } catch (e) {
    finalAnswer = "Sistem Critic gagal merespons. Lakukan check log sistem.";
  }

  return {
    finalAnswer,
    providerStatus: "primary_active",
    detectedMode: primaryMode,
    intermediateSteps,
  };
}

// --- ORIGINAL EXPERT EXPORTS ---

export async function validateSignalWithAI(
  signalData: any,
  marketContext?: any,
): Promise<{
  verdict: "APPROVED" | "REJECTED" | "NEED_MORE_CONFIRMATION";
  reason: string;
}> {
  return await validateSignalAdapter(signalData, marketContext);
}

export async function chatWithMechanic(
  message: string,
  history: any[],
  customKey?: string,
): Promise<string> {
  const systemInstruction = `Kamu adalah XAUUSD AI Architect. 
Capabilities: Senior TypeScript, React, NodeJS, Firebase, DevOps, Trading Systems, & SMC Engineer.
Tool tersedia (bila ini prompt system khusus): System Status, System Logs, Deployment Logs, Configuration Files, Environment Variables, Signal History, Market Data, Source Code.

Mendukung command: /fix, /analyze, /review, /refactor, /patch, /deploy, /debug, /scan.
Jika kamu melihat error log (contoh log Railway/Vercel/TS/Runtime), otomatis lakukan mode AUTONOMOUS:

Balas dengan format presisi berikut:

ROOT CAUSE:
<penjelasan root cause dalam bahasa Indonesia yang ringkas>

FILE:
<exact file path penyebab error>

LINE:
<exact line number>

FIX:
<deskripsi solusi deployment atau code fix>

PATCH:
<git diff patch format atau kode perbaikan utuh>

CONFIDENCE:
<skor dalam %>

Selalu jawab dalam bahasa Indonesia.`;

  // Format history for OpenAI SDK
  const formattedHistory = history
    .filter((msg: any) => msg.role === "user" || msg.role === "model")
    .map((msg: any) => ({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.content,
    }));

  formattedHistory.push({ role: "user", content: message });

  try {
    const response = await chatCompletionFull(
      formattedHistory,
      systemInstruction,
    );
    return response.choices[0]?.message?.content || "No response generated.";
  } catch (err: any) {
    console.error("Mechanic AI Error:", err);
    let errMessage = err.message || "";
    return `AI service temporarily unavailable. Error: ${errMessage}`;
  }
}
