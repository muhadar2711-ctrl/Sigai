
import express from 'express';
import { systemState } from "../services/engine.js";
import { memoryManager } from "../memory.js";
import {
  validateSignalAdapter,
  chatCompletionFull,
  retrieveKnowledgeContext,
} from "../services/ai_adapter.js";

const router = express.Router();

// --- TAHAP 2: PIPELINE ORKESTRASI TRADING ANALYST (STRICT EXECUTION ENGINE) ---

export function detectTradingIntents(
  message: string,
  hasImage: boolean,
): string[] {
  const intents: string[] = [];
  const msgLower = (message || "").toLowerCase();

  // Primary Intent: Execution & Analysis (No General Mentoring)
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

  // Force system into Analyst role if no intent detected
  if (intents.length === 0 && !hasImage) {
    intents.push("Strategy Builder");
  }

  return [...new Set(intents)];
}

export function resolveSkillChain(intents: string[]): string[] {
  const chain = [...intents];
  // Always include Verifier for consistency
  chain.push("Verifier Agent");
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

  const primaryMode = activeSkills.includes("Chart Analyst")
    ? "market_scan"
    : activeSkills.includes("News Analyst")
      ? "news_filter"
      : "strategy_builder";

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
  let dataConfidence = 0;

  // Real-time Data Sync Check
  try {
    const newsApiKey = process.env.NEWSAPI_KEY || process.env.NEWS_API_KEY;
    if (newsApiKey) {
      const axios = (await import("axios")).default;
      const url = `https://newsapi.org/v2/everything?q=Gold OR XAUUSD OR USD&sortBy=relevancy&apiKey=${newsApiKey}&pageSize=3`;
      const res = await axios.get(url, { timeout: 3000 });
      const articles = res.data.articles || [];
      if (articles.length > 0) {
        pySentiment = articles.map((a: any) => a.title).join(" | ");
        dataConfidence += 40; // Data available
      }
    }
  } catch (err) {
    console.warn("News sync failed.");
  }

  // Engine State Check
  if (systemState.engineMode) dataConfidence += 60;

  const liveDataContext = `[LIVE DATA SYNC STATUS: ${dataConfidence}%]\n- Media Sentiment: ${pySentiment}\n- Engine Mode: ${systemState.engineMode || "UNKNOWN"}\n- Robot Status: ${systemState.robotStatus || "OFF"}\n- News Block: ${systemState.isNewsBlocked ? "ACTIVE" : "INACTIVE"}\n\nSTRICT RULE: Jika Data Sync < 50%, jawab "DATA TIDAK TERSEDIA". JANGAN HALUSINASI ANGKA.`;

  let intermediateSteps: { agent: string; content: string }[] = [];
  const messagesPayload = [
    ...history.filter((m) => !m.content?.startsWith("*(")),
  ];

  const agentTasks = activeSkills.map(async (skill) => {
    let skillInstruction = "";
    switch (skill) {
      case "Chart Analyst":
        skillInstruction = "Menganalisa Candle, FVG, OB, Liquidity. Gunakan bukti visual dari gambar.";
        break;
      case "Market Structure Analyst":
        skillInstruction = "Menentukan BOS/CHOCH dan Trend Direction.";
        break;
      case "Strategy Builder":
        skillInstruction = "Menyusun Entry, SL, TP (R:R min 1:1.5).";
        break;
      case "Risk Manager":
        skillInstruction = "Evaluasi Exposure dan Drawdown. Tolak setup jika SL tidak logis.";
        break;
      case "News Analyst":
        skillInstruction = "Korelasi dampak fundamental terhadap XAUUSD.";
        break;
      default:
        skillInstruction = "Analisa teknikal objektif.";
        break;
    }

    const prompt = `${baseSystemPrompt}\n${knowledgeContext}\n${liveDataContext}\n\nROLE: ${skill}\n${skillInstruction}\n\nCORE REQUIREMENT: Berikan BUKTI (Evidence) untuk setiap klaim. Jika evidence tidak ada, katakan "EVIDENCE TIDAK DITEMUKAN".`;

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

  // --- [VERIFICATION GATE] ---
  const verifierInstruction = `Kamu adalah Quality Control & Verification Agent.\nTugasmu mendeteksi KONTRADIKSI dan VALIDASI BUKTI dari draf agen.\n\nDRAF INTERNAL:\n${intermediateSteps.map((s) => `[${s.agent}]: ${s.content}`).join("\n")}\n\nKRITERIA REJECT (Wajib Jawab 'WAIT' atau 'REJECT'):\n1. Agen Strategy dan Risk bertolak belakang.\n2. Klaim teknikal (BOS/FVG) tidak didukung data Chart Analyst.\n3. Live Data Sync tidak memadai untuk eksekusi.\n4. Terdapat indikasi halusinasi angka.\n\nOutput: Berikan 'VERDICT' (CLEAN/CONTRADICTION/LOW_EVIDENCE) dan alasan singkat.`;

  let verificationVerdict = "CLEAN";
  try {
    const vRes = await chatCompletionFull(
      [{ role: "user", content: verifierInstruction }],
      "Verification Mode: ON",
      undefined,
      undefined,
      { mode: "general" },
    );
    const vContent = vRes.choices[0]?.message?.content || "";
    intermediateSteps.push({ agent: "Verification Gate", content: vContent });
    if (vContent.includes("CONTRADICTION") || vContent.includes("LOW_EVIDENCE")) {
      verificationVerdict = "REJECTED";
    }
  } catch (e) {
    verificationVerdict = "LOW_EVIDENCE";
  }

  // --- [FINAL CHIEF ANALYSIS] ---
  const criticSystemInstruction = `Kamu adalah Chief Trading Analyst AI.\nTugasmu melakukan audit akhir terhadap bukti (evidence) yang diberikan tim.\n\nATURAN AUDIT:\n- Jika Verifier menyatakan REJECTED/LOW_EVIDENCE, kamu WAJIB menjawab "WAIT - Evidence Tidak Mencukupi" atau "NO TRADE".\n- Dilarang memperkuat klaim agen jika bukti visual/data tidak sinkron.\n- Struktur Jawaban: BIAS | ENTRY | SL | TP | CONFIDENCE | RATIONALE.\n- Jika data sync gagal, jawab "DATA TIDAK TERSEDIA".\n\n${memoryContext}\nGunakan Bahasa Indonesia. Profesional dan Tanpa Halusinasi.`;

  const draftCombined = intermediateSteps
    .map((step) => `--- [DRAFT ${step.agent}] ---\n${step.content}`)
    .join("\n\n");
  
  const criticPrompt = `STATUS VERIFIKASI: ${verificationVerdict}\n\nUSER REQUEST: \"${message}\" \n\nDRAF TIM:\n\n${draftCombined}`;

  let finalAnswer = "";
  try {
    const criticRes = await chatCompletionFull(
      [{ role: "user", content: criticPrompt }],
      criticSystemInstruction,
      undefined,
      undefined,
      { mode: "general" },
    );
    finalAnswer = criticRes.choices[0]?.message?.content || "DATA TIDAK TERSEDIA";
  } catch (e) {
    finalAnswer = "CRITICAL ERROR: Sistem gagal membangun laporan final.";
  }

  return {
    finalAnswer,
    providerStatus: "primary_active",
    detectedMode: primaryMode,
    intermediateSteps,
  };
}

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
  const systemInstruction = `Kamu adalah XAUUSD AI Architect. \nAUDIT MODE: Cari Root Cause, File, Line, dan berikan Patch Valid. \nDILARANG HALUSINASI KODE. Jika tidak tahu, katakan 'LOG TIDAK CUKUP'.`;

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
    return `AI Error: ${err.message}`;
  }
}

router.post('/chat', async (req, res) => {
  try {
    const { message, images_base64, history, baseSystemPrompt } = req.body;
    const result = await runOrchestratedChat(message, images_base64, history, baseSystemPrompt);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to process chat', details: error.message });
  }
});

export const aiRouter = router;
