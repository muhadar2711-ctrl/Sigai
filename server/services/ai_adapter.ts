import OpenAI from "openai";
import axios from "axios";
import dotenv from "dotenv";
import pino from "pino";
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

// Setup Log to file
function logAI(
  provider: string,
  model: string,
  tokens: number,
  latency: number,
  error?: string,
) {
  try {
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, "ai.log");
    const entry = {
      timestamp: new Date().toISOString(),
      provider,
      model,
      tokens: tokens || 0,
      latency,
      error,
    };
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    // Ignore logging errors
  }
}

// Configuration & State
const PROVIDER_CONFIG = {
  timeout: 15000,
  maxFailures: 3,
  circuitOpenDuration: 5 * 60 * 1000, // 5 mins
};

const circuitOpenUntil: Record<string, number> = {
  openrouter: 0,
  openai: 0,
  free: 0,
  xai: 0,
  groq: 0,
  perplexity: 0,
  gemini: 0,
};

const failures: Record<string, number> = {
  openrouter: 0,
  openai: 0,
  free: 0,
  xai: 0,
  groq: 0,
  perplexity: 0,
  gemini: 0,
};

// Error Helpers
export function isQuotaError(err: any): boolean {
  const msg = (err.message || "").toLowerCase();
  const resMsg = (err.response?.data?.error?.message || "").toLowerCase();
  return (
    msg.includes("429") ||
    resMsg.includes("429") ||
    msg.includes("quota") ||
    resMsg.includes("quota") ||
    msg.includes("resource exhausted") ||
    resMsg.includes("resource exhausted")
  );
}

export function isTimeoutError(err: any): boolean {
  const msg = (err.message || "").toLowerCase();
  return msg.includes("timeout") || err.code === "ECONNABORTED";
}

export function isAuthError(err: any): boolean {
  const msg = (err.message || "").toLowerCase();
  const resMsg = (err.response?.data?.error?.message || "").toLowerCase();
  return (
    msg.includes("401") ||
    resMsg.includes("401") ||
    msg.includes("403") ||
    resMsg.includes("403")
  );
}

export function normalizeProviderResponse(content: string, toolCalls: any) {
  if (toolCalls && toolCalls.length > 0) {
    return JSON.stringify({ role: "assistant", content: content || "", tool_calls: toolCalls });
  }
  return content || "";
}

export function hideRawToolOutput(text: string): string {
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (parsed.tool_calls) {
      return "*(Sedang mengumpulkan data internal...)*";
    }
  } catch (e) {}

  if (
    text.includes('"tool_calls":') ||
    text.includes('{"name":') ||
    text.includes('`{"path":') ||
    text.includes('{"path":')
  ) {
    return "*(Sistem sedang memproses hasil dari repositori atau database...)*";
  }

  // Hapus meta commentary agresif
  let cleaned = text.replace(
    /Saya (telah|akan) (memanggil|menggunakan) tool.*/gi,
    "",
  );
  cleaned = cleaned.replace(
    /Berdasarkan (data live|data di atas|sistem|guardrail).*/gi,
    "",
  );
  cleaned = cleaned.replace(/Berikut adalah analisa(nya|).*:/gi, "");
  cleaned = cleaned.replace(
    /Saya tidak( dapat| bisa) (melihat|menemukan) (chart|gambar) karena.*/gi,
    "NO TRADE. Data gambar tidak terbaca dengan baik.",
  );
  cleaned = cleaned.replace(/dalam konteks implementasi/gi, "");
  cleaned = cleaned.replace(/karena native react/gi, "");
  cleaned = cleaned.replace(/whitespace-pre-wrap/gi, "");
  cleaned = cleaned.replace(/prompt guardrails?/gi, "");
  cleaned = cleaned.replace(/dependency/gi, "");
  cleaned = cleaned.replace(/rendering/gi, "");
  cleaned = cleaned.replace(/tool_calls/gi, "");
  cleaned = cleaned.replace(/json mentah/gi, "");
  cleaned = cleaned.replace(/log debug/gi, "");

  return cleaned.trim();
}

export function markdownCleaner(text: string): string {
  if (!text) return "";
  let cleaned = text.replace(/```[a-z]*\s*/gi, "");
  cleaned = cleaned.replace(/```/g, "");

  // normalize headers
  cleaned = cleaned.replace(/^#+\s+/gm, "");

  // Pertahankan struktur jika ada bold (seperti **Bias Market:**), tapi hapus bintang untuk teks.
  // Namun output trading report sering pakai bold, kita biarkan saja bold mark tapi hapus asterisk
  // Permintaan aslinya: format akhir Bias Market: dsb. Jadi hapus asterisk tapi jadikan Uppercase agar tegas, atau ganti dengan HTML?
  // Karena AIChat menggunakan <div whitespace-pre-wrap>, markdown bold text `**Bias**` akan tampil persis sebagai `**Bias**`.
  // Kita hilangkan bintangnya dan ubah teks dalamnya jadi UPPERCASE agar terlihat tegas.
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, (match, p1) => {
    return p1.toUpperCase();
  });

  // Clean up bullet points
  cleaned = cleaned.replace(/^[\*\-]\s+/gm, "• ");

  return cleaned.trim();
}

export function responseFormatter(text: string): string {
  let cleaned = hideRawToolOutput(text);
  if (cleaned.startsWith("*(")) return cleaned;
  return markdownCleaner(cleaned);
}

export function resolveFallbackChain(
  preferredProvider?: string,
  hasImage?: boolean,
  mode?: string,
): string[] {
  let primary = "gemini";

  if (hasImage) {
    primary = "gemini";
  } else if (mode === "news_filter" || mode === "market_scan") {
    primary = "groq";
  } else if (
    mode === "setup_validation" ||
    mode === "strategy_builder" ||
    mode === "risk_manager" ||
    mode === "general"
  ) {
    primary = "groq";
  } else if (mode === "code_fix") {
    primary = "groq";
  }

  if (preferredProvider) {
    primary = preferredProvider;
  }

  const allProviders = ["gemini", "groq", "xai", "openrouter", "free"];
  let chain = [primary, ...allProviders.filter((p) => p !== primary)];
  return chain;
}

export function retrieveKnowledgeContext(intents: string[]): string {
  const knowledgeDir = path.join(process.cwd(), "knowledge");
  if (!fs.existsSync(knowledgeDir)) return "";

  const keywordsToFiles: Record<string, string> = {
    SMC: "smc.md",
    ICT: "ict.md",
    "Smart Money": "smc.md",
    "Chart Analyst": "price_action.md",
    "Market Structure Analyst": "smc.md",
    "News Analyst": "macro_news.md",
    "Risk Manager": "risk_management.md",
    "Strategy Builder": "supply_demand.md",
  };

  let filesToRead: Set<string> = new Set();

  // default active knowledge
  filesToRead.add("xauusd_session.md");
  filesToRead.add("psychology.md");

  for (const intent of intents) {
    for (const [key, file] of Object.entries(keywordsToFiles)) {
      if (intent.toLowerCase().includes(key.toLowerCase()) || key === intent) {
        filesToRead.add(file);
      }
    }
  }

  let contextText = "\\n[KNOWLEDGE BASE TERSINKRONISASI]:\\n";

  for (const file of Array.from(filesToRead)) {
    const filePath = path.join(knowledgeDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        contextText += content + "\\n\\n";
      } catch (e) {}
    }
  }

  return contextText;
}

export function extractTradeSummary(finalAnswer: string, mode: string): any {
  // Parsing sederhana untuk mengambil field dari Final Report
  const parseLine = (regex: RegExp) => {
    const match = finalAnswer.match(regex);
    return match ? match[1].trim().replace(/\*\*/g, "") : "";
  };

  const bias = parseLine(/\b(?:Bias Market:?|Bias:?)\s*(?:[\*\s]*)([^\n]+)/i);
  const setup = parseLine(/\b(?:Setup:?)\s*(?:[\*\s]*)([^\n]+)/i);
  const action = parseLine(/\b(?:Final Action:?)\s*(?:[\*\s]*)([^\n]+)/i);
  const confidence = parseLine(
    /\b(?:Confidence Score:?|Confidence:?)\s*(?:[\*\s]*)([^\n]+)/i,
  );
  const structure = parseLine(
    /\b(?:Struktur Market:?|Market Structure:?)\s*(?:[\*\s]*)([^\n]+)/i,
  );

  return {
    timestamp: new Date().toISOString(),
    mode,
    bias: bias || "UNKNOWN",
    setup: setup || "NONE",
    action: action || "WAIT",
    confidence: confidence || "0%",
    structure: structure || "NONE",
    outcome: "PENDING",
  };
}

export function markProviderFailure(provider: string) {
  if (failures[provider] !== undefined) {
    failures[provider]++;
    if (failures[provider] >= PROVIDER_CONFIG.maxFailures) {
      logger.warn(`[${provider.toUpperCase()}] triggered circuit breaker!`);
      circuitOpenUntil[provider] =
        Date.now() + PROVIDER_CONFIG.circuitOpenDuration;
    }
  }
}

export function markProviderSuccess(provider: string) {
  if (failures[provider] !== undefined) {
    failures[provider] = 0;
  }
}

export async function generateContent(
  prompt: string,
  customSystemInstruction?: string,
  messages?: any[],
  tools?: any[],
  preferredProvider?: string,
  options?: {
    hasImage?: boolean;
    mode?: string;
    image_base64?: string;
    images_base64?: string[];
  },
): Promise<string> {
  const providers = resolveFallbackChain(
    preferredProvider,
    options?.hasImage,
    options?.mode,
  );
  let lastError = null;

  for (const provider of providers) {
    if (Date.now() < circuitOpenUntil[provider]) {
      logger.warn(`Circuit breaker open for ${provider}, skipping...`);
      continue;
    }

    const startTime = Date.now();
    let modelUsed = "";
    try {
      let responseContent = "";
      let tokens = 0;

      const history = messages ? [...messages] : [];
      if (
        prompt &&
        (!history.length || history[history.length - 1].content !== prompt)
      ) {
        history.push({ role: "user", content: prompt });
      }

      if (
        provider === "gemini" &&
        (process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2)
      ) {
        logger.info(`Attempting Gemini...`);
        modelUsed = "gemini-3.5-flash";
        const keys = [
          process.env.GEMINI_API_KEY,
          process.env.GEMINI_API_KEY_2,
        ].filter(Boolean) as string[];

        let geminiSuccess = false;
        for (const key of keys) {
          try {
            const ai = new GoogleGenAI({ apiKey: key });
            let geminiParts: any[] = [];

            if (options?.images_base64 && options.images_base64.length > 0) {
              for (const imgBase64 of options.images_base64) {
                const b64Data = imgBase64.includes(",")
                  ? imgBase64.split(",")[1]
                  : imgBase64;
                geminiParts.push({
                  inlineData: { data: b64Data, mimeType: "image/jpeg" },
                });
              }
            } else if (options?.image_base64) {
              const b64Data = options.image_base64.includes(",")
                ? options.image_base64.split(",")[1]
                : options.image_base64;
              geminiParts.push({
                inlineData: { data: b64Data, mimeType: "image/jpeg" },
              });
            }

            const sysText = customSystemInstruction || "Halo";
            const lastMsg =
              history.length > 0 ? history[history.length - 1].content : prompt;
            geminiParts.push({ text: lastMsg || "Halo" });

            let mappedTools: any = undefined;
            if (tools && tools.length > 0) {
              const declarations = tools
                .filter((t) => t.type === "function")
                .map((t) => {
                  const f = t.function;
                  return {
                    name: f.name,
                    description: f.description || "",
                    parameters: f.parameters || { type: "OBJECT" },
                  };
                });
              mappedTools = [{ functionDeclarations: declarations }];
            }

            const response = await ai.models.generateContent({
              model: modelUsed,
              contents: [{ role: "user", parts: geminiParts }],
              config: { 
                systemInstruction: sysText, 
                tools: mappedTools 
              },
            });

            if (response.functionCalls && response.functionCalls.length > 0) {
              const tCalls = response.functionCalls.map((fc: any) => ({
                id: Math.random().toString(36).substring(2, 10),
                type: "function",
                function: {
                  name: fc.name,
                  arguments: JSON.stringify(fc.args),
                },
              }));
              responseContent = JSON.stringify({ role: "assistant", content: response.text || "", tool_calls: tCalls });
            } else {
              responseContent = response.text || "";
            }
            geminiSuccess = true;
            break;
          } catch (err: any) {
            if (isQuotaError(err) || isAuthError(err)) continue;
            throw err;
          }
        }
        if (!geminiSuccess)
          throw new Error("Gemini API Quota/Auth failed across all keys");
      } else if (provider === "groq" && process.env.GROQ_API_KEY) {
        logger.info(`Attempting Groq...`);
        modelUsed = "llama-3.3-70b-versatile";
        const finalMessages = customSystemInstruction
          ? [{ role: "system", content: customSystemInstruction }, ...history]
          : history;
        const res = await axios.post(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            model: modelUsed,
            messages: finalMessages,
            tools: tools,
          },
          {
            headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
            timeout: PROVIDER_CONFIG.timeout,
          },
        );
        responseContent = normalizeProviderResponse(
          res.data.choices[0]?.message?.content,
          res.data.choices[0]?.message?.tool_calls,
        );
        tokens = res.data.usage?.total_tokens || 0;
      } else if (provider === "xai" && process.env.XAI_API_KEY) {
        logger.info(`Attempting xAI (Grok)...`);
        modelUsed = "grok-3-mini";
        const finalMessages = customSystemInstruction
          ? [{ role: "system", content: customSystemInstruction }, ...history]
          : history;
        const res = await axios.post(
          "https://api.x.ai/v1/chat/completions",
          {
            model: modelUsed,
            messages: finalMessages,
            tools: tools,
          },
          {
            headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
            timeout: PROVIDER_CONFIG.timeout,
          },
        );
        responseContent = normalizeProviderResponse(
          res.data.choices[0]?.message?.content,
          res.data.choices[0]?.message?.tool_calls,
        );
        tokens = res.data.usage?.total_tokens || 0;
      } else if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
        logger.info(`Attempting OpenRouter...`);
        modelUsed =
          process.env.OPENROUTER_MODEL_DEFAULT ||
          "google/gemini-2.5-flash-lite";

        const lastMsg =
          history.length > 0 ? history[history.length - 1].content : prompt;
        const openRouterMessages = history.map((m) => {
          if (m.role === "user" && m.content === lastMsg) {
            let contentArr: any[] = [
              { type: "text", text: m.content || "Halo" },
            ];

            if (options?.images_base64 && options.images_base64.length > 0) {
              for (const img of options.images_base64) {
                contentArr.push({
                  type: "image_url",
                  image_url: {
                    url: img.includes(",")
                      ? img
                      : `data:image/jpeg;base64,${img}`,
                  },
                });
              }
            } else if (options?.image_base64) {
              contentArr.push({
                type: "image_url",
                image_url: {
                  url: options.image_base64.includes(",")
                    ? options.image_base64
                    : `data:image/jpeg;base64,${options.image_base64}`,
                },
              });
            }

            return {
              role: m.role,
              content: contentArr.length > 1 ? contentArr : m.content,
            };
          }
          return { role: m.role, content: m.content || "" };
        });

        const finalMessages = customSystemInstruction
          ? [
              { role: "system", content: customSystemInstruction },
              ...openRouterMessages,
            ]
          : openRouterMessages;
        const res = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: modelUsed,
            messages: finalMessages,
            tools: tools,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
            },
            timeout: PROVIDER_CONFIG.timeout,
          },
        );
        responseContent = normalizeProviderResponse(
          res.data.choices[0]?.message?.content,
          res.data.choices[0]?.message?.tool_calls,
        );
        tokens = res.data.usage?.total_tokens || 0;
      } else if (
        provider === "free" &&
        process.env.FREE_AI_API_KEY &&
        process.env.FREE_AI_BASE_URL
      ) {
        logger.info(`Attempting Free AI Fallback...`);
        modelUsed = process.env.FREE_AI_MODEL || "gpt-3.5-turbo";
        const finalMessages = customSystemInstruction
          ? [{ role: "system", content: customSystemInstruction }, ...history]
          : history;
        const client = new OpenAI({
          apiKey: process.env.FREE_AI_API_KEY,
          baseURL: process.env.FREE_AI_BASE_URL,
        });
        const response = await client.chat.completions.create(
          {
            model: modelUsed,
            messages: finalMessages,
            tools: tools,
          },
          { timeout: PROVIDER_CONFIG.timeout, maxRetries: 1 },
        );
        responseContent = normalizeProviderResponse(
          response.choices[0]?.message?.content || "",
          response.choices[0]?.message?.tool_calls,
        );
        tokens = response.usage?.total_tokens || 0;
      } else {
        continue;
      }

      markProviderSuccess(provider);
      const latency = Date.now() - startTime;
      logAI(provider, modelUsed, tokens, latency);
      return responseContent;
    } catch (err: any) {
      const errMsg = err.response?.data?.error?.message || err.message;
      logger.error(`[${provider.toUpperCase()}] Failed: ${errMsg}`);
      lastError = err;

      markProviderFailure(provider);
      const latency = Date.now() - startTime;
      logAI(provider, modelUsed || "unknown", 0, latency, errMsg);

      if (isQuotaError(err) || isTimeoutError(err)) {
        continue; // Try next fallback gracefully
      }
    }
  }

  return JSON.stringify({
    error_fallback: true,
    message: `All multi-provider AI routes failed. Last error: ${lastError?.message || "Unknown"}`,
  });
}

export async function chatCompletionFull(
  messages: any[],
  systemInstruction?: string,
  tools?: any[],
  preferredProvider?: string,
  options?: {
    hasImage?: boolean;
    mode?: string;
    image_base64?: string;
    images_base64?: string[];
  },
): Promise<any> {
  const rawRes = await generateContent(
    "",
    systemInstruction,
    messages,
    tools,
    preferredProvider,
    options,
  );
  try {
    const parsed = JSON.parse(rawRes);
    if (parsed && parsed.role === "assistant") {
      return { choices: [{ message: parsed }] };
    }
    if (parsed && parsed.tool_calls) {
      return { choices: [{ message: { role: "assistant", content: parsed.content || "", tool_calls: parsed.tool_calls } }] };
    }
    if (parsed && parsed.error_fallback) {
      throw new Error("Provider exhausted"); // bubble up error logically if expected by old callers
    }
  } catch (e) {}

  return { choices: [{ message: { content: rawRes } }] };
}

export async function validateSignalAdapter(
  signalData: any,
  marketContext?: any,
): Promise<{
  verdict: "APPROVED" | "REJECTED" | "NEED_MORE_CONFIRMATION";
  reason: string;
}> {
  const signalJson = JSON.stringify(signalData, null, 2);
  const contextJson = marketContext
    ? JSON.stringify(marketContext, null, 2)
    : "Data market terkini tidak tersedia.";

  // Define true multi-agent tasks
  const agents = [
    {
      name: "Risk & Reward Manager",
      role: "Evaluasi level risiko, stop loss ratio (apakah SL terlalu lebar), R:R, dan margin safety.",
    },
    {
      name: "Market Structure Analyst",
      role: "Evaluasi kesesuaian antara tren saat ini pada OHLC dan market sentiment dengan sinyal.",
    },
    {
      name: "SMC Technical Specialist",
      role: "Validasi apakah setup mematuhi mitigasi FVG, likuiditas, dan struktur sesi.",
    },
  ];

  try {
    const agentPromises = agents.map(async (agent) => {
      const prompt = `Kamu adalah ${agent.name} dalam komite trading institusional.
Tugas khususmu: ${agent.role}

Berikut adalah Konteks Pasar Saat Ini (Candle Histories, Sentiment News, Recent Signals):
${contextJson}

Berikut adalah data setup algoritmik yang akan dieksekusi:
${signalJson}

Berikan pandangan kritis maksimum 2 paragraf. Secara logis, apakah setup ini mencerminkan probabilitas tinggi (HIGH QUALITY) atau justru memaksakan masuk ke pasar (LOW QUALITY) berdasarkan data price action dan sentimen? Sertakan argumen persetujuan/penolakan menurut bidang keahlianmu.`;

      try {
        const rawRes = await generateContent(prompt, "", [], [], "gemini", {
          mode: "setup_validation",
        });
        return `--- [${agent.name}] ---\n${rawRes.trim()}`;
      } catch (err: any) {
        return `--- [${agent.name}] ---\nError: Gagal memproses data.`;
      }
    });

    const agentResults = await Promise.all(agentPromises);
    const combinedInsights = agentResults.join("\n\n");

    const criticPrompt = `Kamu adalah Chief Trade Validator AI.
ATURAN WAJIB (STRICT RULES) The Matrix:
1. Killzone / Waktu: Setup WAJIB memiliki status "activeKillzone" (mis. LONDON, NEW YORK). Jika "OUTSIDE_KILLZONE", WAJIB REJECTED.
2. Liquidity Sweep: Jika tidak ada bukti Sapu Likuiditas (Liquidity Sweep) atau "NO_LIQUIDITY_SWEEP", kurangi signifikansinya.
3. R:R (Risk to Reward): Jika data rrRatio di bawah 1.5, WAJIB REJECTED.

Berikut evaluasi mendalam dari tim pakarmu atas sinyal trading ini, dilengkapi dengan kondisi market terkini:
${combinedInsights}

Tugasmu merangkum konsensus tersebut ke dalam satu keputusan akhir.
Tentukan apakah Sinyal ini HIGH QUALITY (probabilitas unggul) atau LOW QUALITY (berisiko tinggi/manipulasi pasar).
Jika HIGH QUALITY dan sesuai rules, setujui (APPROVED). Jika LOW QUALITY atau melanggar aturan pasti, TOLAK (REJECTED).
Jika bukti price action masih kurang jelas, minta tunggu (NEED_MORE_CONFIRMATION).

Balas STRICTLY dalam format JSON dengan 2 properti:
"verdict": "APPROVED" atau "REJECTED" atau "NEED_MORE_CONFIRMATION"
"reason": "Buat analisis mendalam tentang mengapa signal ini HIGH_QUALITY atau LOW_QUALITY. Berikan detail price action/sentimen apa yang mendasari keputusan. Sertakan pula saran perbaikan sinyal (misal: 'Perkecil jarak SL', 'Sebaiknya tunggu liquidity sapuan ke 2355'). Gunakan bahasa Indonesia baku profesional yang analitis dan terstruktur."`;

    const criticRes = await generateContent(
      criticPrompt,
      "",
      [],
      [],
      "gemini",
      {
        mode: "setup_validation",
      },
    );

    let cleanRes = criticRes
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    try {
      const parsed = JSON.parse(cleanRes);
      if (
        ["APPROVED", "REJECTED", "NEED_MORE_CONFIRMATION"].includes(
          parsed.verdict,
        )
      ) {
        return { verdict: parsed.verdict, reason: parsed.reason };
      }
    } catch (e: any) {
      console.log("Chief Validator JSON parse failed:", cleanRes);
    }
  } catch (e: any) {
    console.error("Multi-Agent validation error:", e);
  }

  return {
    verdict: "NEED_MORE_CONFIRMATION",
    reason:
      "Validasi Multi-Agen gagal diproses oleh Gemini. Proteksi keamanan aktif, sistem masuk mode siaga.",
  };
}
