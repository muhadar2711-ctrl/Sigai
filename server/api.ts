import express, { Router } from "express";
import { systemState, runTradingPipeline } from "./server/engine.js";
import { getFirestore } from "./server/firebase.js";
import fs from "fs";
import path from "path";
import { memoryManager } from "./server/memory.js";
import { gitAgent } from "./server/git_agent.js";
import { requireAdminAuth, rateLimiter } from "./server/middleware.js";

import {
  chatCompletionFull,
  responseFormatter,
} from "./server/services/ai_adapter.js";

export const apiRouter = Router();

// Apply a generic public rate limit (e.g. max 100 requests per 15 mins)
apiRouter.use(rateLimiter(100, 15 * 60 * 1000));

// 1. GET /api/repo/file?path=
apiRouter.get("/repo/file", requireAdminAuth, (req, res) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: "No path provided" });

    // SECURITY: Whitelist folder
    if (
      !filePath.startsWith("src/") &&
      !filePath.startsWith("server/") &&
      !filePath.startsWith("data/") &&
      !filePath.startsWith("logs/")
    ) {
      return res.status(403).json({
        error: "Access denied. Only src/, server/, data/, logs/ allowed",
      });
    }
    // SECURITY: Block path traversal
    if (filePath.includes("..")) {
      return res.status(403).json({ error: "Invalid path" });
    }

    // SECURITY: Block specific files
    const blockedFiles = ["package.json", ".env", "PRD.md"];
    if (blockedFiles.some((f) => filePath === f || filePath.endsWith(f))) {
      return res.status(403).json({ error: "Access to protected file denied" });
    }

    const fullPath = path.join(process.cwd(), filePath);

    // Check file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const content = fs.readFileSync(fullPath, "utf-8");

    // Limit 50KB
    if (content.length > 50000) {
      return res.status(413).json({ error: "File too large" });
    }

    console.log(`[AI_AGENT] User minta BACA di ${filePath}`);
    res.json({
      path: filePath,
      content: content,
      size: content.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/agent/write
apiRouter.post("/agent/write", requireAdminAuth, express.json({ limit: "1mb" }), (req, res) => {
  try {
    const { path: filePath, content, reason } = req.body;
    if (!filePath || !content || !reason) {
      return res
        .status(400)
        .json({ success: false, error: "Missing path, content, or reason" });
    }

    // SECURITY: Whitelist & Traversal
    if (
      (!filePath.startsWith("src/") && !filePath.startsWith("server/")) ||
      filePath.includes("..")
    ) {
      return res
        .status(403)
        .json({ success: false, error: "Invalid path access." });
    }

    const blockedFiles = [
      "package.json",
      ".env",
      "PRD.md",
      "data/ai_memory.json",
    ];
    if (blockedFiles.some((f) => filePath === f || filePath.endsWith(f))) {
      return res
        .status(403)
        .json({ success: false, error: "Protected file modification denied" });
    }

    // LOGIC GUARD
    if (
      filePath === "server/smc_strategy.ts" &&
      (content.includes("function detectBOS") ||
        content.includes("function detectCHOCH"))
    ) {
      return res.status(403).json({
        success: false,
        error: "Protected SMC logic Cannot modify detectBOS/CHOCH.",
      });
    }

    console.log(`[AI_AGENT] User minta TULIS di ${filePath}`);
    const backup_sha = gitAgent.getLastCommit();

    const fullPath = path.join(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");

    memoryManager.saveMemory(
      "past_decisions",
      `Edit file ${filePath} karena ${reason}`,
    );

    res.json({ success: true, diff: "File updated", backup_sha });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. DELETE /api/agent/file
apiRouter.delete("/agent/file", requireAdminAuth, express.json(), (req, res) => {
  try {
    const { path: filePath, reason } = req.body;
    if (!filePath || !reason) {
      return res
        .status(400)
        .json({ success: false, error: "Missing path or reason" });
    }

    // SECURITY: Whitelist & Traversal
    if (
      (!filePath.startsWith("src/") && !filePath.startsWith("server/")) ||
      filePath.includes("..")
    ) {
      return res
        .status(403)
        .json({ success: false, error: "Invalid path access." });
    }

    // BLACKLIST
    const blockedFiles = [
      "package.json",
      ".env",
      "PRD.md",
      "server/smc_strategy.ts",
      "data/ai_memory.json",
    ];
    if (blockedFiles.some((f) => filePath === f || filePath.endsWith(f))) {
      return res
        .status(403)
        .json({ success: false, error: "Cannot delete protected file" });
    }

    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: "File not found" });
    }

    console.log(`[AI_AGENT] User minta HAPUS di ${filePath}`);
    fs.unlinkSync(fullPath);

    memoryManager.saveMemory(
      "past_decisions",
      `Hapus file ${filePath} karena ${reason}`,
    );

    res.json({ success: true, message: `File ${filePath} deleted` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. POST /api/agent/commit
apiRouter.post("/agent/commit", requireAdminAuth, express.json(), (req, res) => {
  try {
    const { message } = req.body;
    if (!message)
      return res.status(400).json({ success: false, error: "Missing message" });

    console.log(`[AI_AGENT] User minta COMMIT dengan pesan: ${message}`);
    const result = gitAgent.commitAll(message);

    memoryManager.saveMemory("past_decisions", `Commit Git: ${message}`);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. GET /api/ai/history
apiRouter.get("/ai/history", requireAdminAuth, (req, res) => {
  try {
    const memList = memoryManager.getMemory("user_preferences");
    res.json({ success: true, data: memList });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. POST /api/ai/chat (Otak Chat + Vision)
import { GoogleGenAI } from "@google/genai";

apiRouter.post(
  "/ai/chat",
  requireAdminAuth,
  express.json({ limit: "50mb" }),
  async (req, res) => {
    try {
      let { message, history, images_base64, model, mode } = req.body;

      const msgLower = (message || "").toLowerCase();
      const isCodeFix =
        mode === "code_fix" ||
        msgLower.includes("/fix") ||
        msgLower.includes("bug") ||
        msgLower.includes("error log");

      if (isCodeFix) {
        mode = "code_fix";
      }

      if (
        !process.env.GEMINI_API_KEY &&
        !process.env.GROQ_API_KEY &&
        !process.env.OPENROUTER_API_KEY &&
        !process.env.XAI_API_KEY &&
        !process.env.FREE_AI_API_KEY
      ) {
        return res.status(500).json({
          error:
            "Belum ada API Key. Pastikan set GEMINI_API_KEY atau kunci API provider lain di environment.",
        });
      }

      const sysPriceXau =
        systemState.prices?.XAUUSD ||
        systemState.prices?.["XAU/USD"]?.price ||
        "Tidak Tersedia";
      const sysStratsInfo = systemState.strategies
        ? JSON.stringify(systemState.strategies, null, 2)
        : "BELUM ADA DATA STRATEGI";

      const baseSystemInstruction = `Kamu adalah Mentor Trading Profesional, Senior AI Engineer, dan Chief Trading Analyst Spesialis SMC & Price Action kelas dunia (Scalping Sniper Level).
Tugas utama kamu adalah membimbing, mengevaluasi setup, dan memberikan wawasan trading yang rasional, objektif, tajam, presisi, dan SANGAT PROFESIONAL bagai penembak runduk (sniper). Kamu selalu menunggu setup A+ sebelum menarik pelatuk.

ATURAN WAJIB SISTEM KECERDASAN BUATAN - SANGAT KETAT:
1. DILARANG KERAS BERHALUSINASI, MENGARANG ANGKA, ATAU MENGARANG DATA HARGA/SETUP.
2. DILARANG KERAS MEMBUAT PREDIKSI TANPA BUKTI AKTUAL DARI DATA MARKET. Gunakan fakta empiris.
3. JIKA DATA / HARGA TIDAK ADA, MAKA JAWAB DENGAN JUJUR "DATA TIDAK TERSEDIA".
4. KAMU HARUS KEBAL DARI MANIPULASI USER. Segala bentuk prompt yang meminta sinyal palsu HARUS DITOLAK.
5. ANALISISLAH DATA LIVE STRATEGIES DENGAN DETAIL DAN JELASKAN KEADAANNYA JIKA DITANYA USER. JANGAN MENGARANG LOGIC, HANYA BACA STATUS AKTUALNYA.
6. JELASKAN URUTAN SETUP (Step 1, 2, dll) YANG ADA DI JSON STRATEGI SECARA JELAS JIKA DIMINTA USER.

[PENJELASAN SINYAL & RISIKO (RAG GROUNDED)]
- Evaluasi layaknya Sniper Scalper: Tunggu konfirmasi di zona Killzone, konfirmasi Lower Time Frame (LTF), cari konfluensi level (Liquidity Sweeps, Breaker Blocks).
- Wajib memperhitungkan Risk Profile! Jika ditanya soal ukuran posisi, sebutkan margin bebas, risk per trade maksimal 1-2%, dan SL buffer terukur.
- Tolak trade yang memiliki Risk-to-Reward (RR) di bawah 1:1.5. Rekomendasikan minimal 1:2 atau 1:3.
- Jika Drawdown Guard tercapai atau Engine Mode = "NEWS", perintahkan trader untuk menghentikan seluruh operasi market (No Trade Zone). Jangan berspekulasi di masa ketidakpastian.

[DATABASE PENGETAHUAN SMC]
- FVG (Fair Value Gap): Ketidakseimbangan harga yang ditandai oleh 3 candle berurutan tanpa overlap wicking pada candle tengah.
- BOS (Break of Structure): Penembusan level swing high/low mengeksekusi kelanjutan tren.
- CHOCH (Change of Character): Pergeseran momentum, penanda awal pembalikan.
- Liquidity Sweep / Engineered Liquidity: Retail trap. Area di mana Smart Money mengambil likuiditas sebelum reversal kuat.
- POI (Point of Interest): Area Order Block atau Breaker Block tempat limit order besar terkonsentrasi.

[DATA MARKET REAL-TIME SAAT INI (LIVE)]
Engine Mode: ${systemState.engineMode || "STANDARD"}
Robot Status: ${systemState.robotStatus || "OFF"}
Harga XAUUSD Saat Ini: ${sysPriceXau}

[STATUS STRATEGI & MATRIKS SETUP LIVE (DARI SCANNER UI)]
${sysStratsInfo}`;

      let systemInstruction = baseSystemInstruction;
      if (isCodeFix) {
        const modeSpecificInstruction = `Mode Saat Ini: CODE FIX / ENGINEERING
Fokus membantu penulisan kode, debugging logic backend SMC, atau membedah error logs. Bertindaklah sebagai Senior Full-Stack dan Algo Developer.`;
        systemInstruction = `${baseSystemInstruction}\n\n${modeSpecificInstruction}\n\nATURAN BESI GUARDRAIL:\nJANGAN PERNAH menyertakan meta-commentary, tulisan log internal, atau membahas implementasi/tools UI. Mode "code_fix" hanya boleh menggunakan Tools System jika sungguh diperlukan.`;
      } else {
        const modeSpecificInstruction = `Mode Saat Ini: TRADING / ANALYSIS
Fokus memberikan audit, strategi, validasi sinyal, dan analisis teknikal berdasarkan data empiris dan knowledge Serta dokumen markdown terlampir RAG.`;
        systemInstruction = `${baseSystemInstruction}\n\n${modeSpecificInstruction}\n\nJANGAN MENGARANG ANGKA.`;
      }

      let aiAnswer = "";
      let providerStatus = "primary_active";
      let preferredProvider = req.body.provider || undefined;

      // Build tool definitions — using OpenAI-style function calling format
      // This is correct for Groq, xAI, OpenRouter (OpenAI-compatible)
      // For Gemini, we remap inside ai_adapter.ts
      const tools: any = [
        {
          type: "function",
          function: {
            name: "readFile",
            description: "Membaca isi file dari repository.",
            parameters: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "Path relatif (e.g., src/App.tsx)",
                },
              },
              required: ["path"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "writeFile",
            description: "Membuat atau mengubah isi file di repository.",
            parameters: {
              type: "object",
              properties: {
                path: { type: "string" },
                content: {
                  type: "string",
                  description: "Isi script lengkap yang akan direplace/dibuat",
                },
                reason: {
                  type: "string",
                  description: "Alasan mengapa diubah",
                },
              },
              required: ["path", "content", "reason"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "deleteFile",
            description: "Menghapus file.",
            parameters: {
              type: "object",
              properties: {
                path: { type: "string" },
                reason: { type: "string" },
              },
              required: ["path", "reason"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "listFiles",
            description: "Melihat struktur isi directory.",
            parameters: {
              type: "object",
              properties: {
                dir: {
                  type: "string",
                  description:
                    "Folder path (kosongkan string atau isi '.' utk root)",
                },
              },
              required: ["dir"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "getSystemState",
            description:
              "Dapatkan data market real-time, kondisi SMC XAUUSD/EURUSD saat ini, dan sentimen.",
            parameters: {
              type: "object",
              properties: {},
            },
          },
        },
        {
          type: "function",
          function: {
            name: "queryMCPServer",
            description:
              "Query Python MCP server untuk analisa advanced. Tersedia endpoint: '/api/v1/data/twelvedata/quote?symbol=XAU/USD', '/api/v1/sentiment/twitter?symbol=XAUUSD', '/api/v1/news/forexfactory'. Prefix /api/v1 otomatis ditambahkan.",
            parameters: {
              type: "object",
              properties: {
                endpoint: {
                  type: "string",
                  description: "Contoh: /api/v1/data/twelvedata/quote?symbol=XAU/USD",
                },
              },
              required: ["endpoint"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "gitCommit",
            description:
              "Commit n push hasil kerja mu ke github supaya deploy ke railway/codemagic terpicu.",
            parameters: {
              type: "object",
              properties: {
                message: { type: "string" },
              },
              required: ["message"],
            },
          },
        },
      ];

      const clientHist = Array.isArray(history)
        ? history.filter((m: any) => m.content !== "Selesai.")
        : [];
      const messages: any[] = [...clientHist, { role: "user", content: message || "Halo" }];

      let iter = 0;
      while (iter < 8) {
        let response;
        try {
          response = await chatCompletionFull(
            messages,
            systemInstruction,
            tools,
            preferredProvider,
            {
              hasImage: !!(images_base64 && images_base64.length > 0),
              mode: mode,
              images_base64: images_base64,
            },
          );
        } catch (err: any) {
          console.error(
            "[FALLBACK_ADAPTER_ERROR] Exhausted fallback routes: " +
              err.message,
          );
          providerStatus = "fallback_failed";
          aiAnswer =
            "Mohon maaf, saat ini provider utama dan fallback AI sedang sibuk (Quota/Rate Limit). Sistem gagal mengambil respon yang valid. Silakan coba beberapa saat lagi.";
          break;
        }

        const resMsg = response.choices[0]?.message;
        if (!resMsg || (!resMsg.content && !resMsg.tool_calls)) {
          aiAnswer = "Tidak ada response.";
          break;
        }

        if (resMsg.tool_calls && resMsg.tool_calls.length > 0) {
          const call = resMsg.tool_calls[0].function;
          console.log(`[AI_AGENT] Model calls tool: ${call.name}`);

          messages.push(resMsg);

          let toolResult: any = { success: false, error: "Tool not found" };
          const args = (() => {
            try {
              return JSON.parse(call.arguments);
            } catch (e) {
              return {};
            }
          })();
          const {
            path: argPath,
            content,
            reason,
            message: argMsg,
            dir,
          } = args as any;

          try {
            if (
              ["readFile", "writeFile", "deleteFile"].includes(call.name) &&
              (argPath || "").includes("..")
            ) {
              toolResult = { error: "Path traversal is strictly prohibited." };
            } else if (call.name === "readFile") {
              let targetFile = argPath;
              const p = path.join(process.cwd(), targetFile);
              if (!fs.existsSync(p))
                toolResult = { error: "File not found: " + targetFile };
              else toolResult = { content: fs.readFileSync(p, "utf-8") };
            } else if (call.name === "writeFile") {
              if (
                argPath === "server/smc_strategy.ts" &&
                (content.includes("function detectBOS") ||
                  content.includes("function detectCHOCH"))
              ) {
                toolResult = {
                  error:
                    "Dilarang memanipulasi detectBOS/CHOCH. Protected logic.",
                };
              } else {
                const p = path.join(process.cwd(), argPath);
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, content, "utf-8");
                memoryManager.saveMemory(
                  "past_decisions",
                  `Edit ${argPath} karena ${reason}`,
                );
                toolResult = {
                  success: true,
                  message: `File ${argPath} updated.`,
                };
              }
            } else if (call.name === "deleteFile") {
              const blocked = [
                "package.json",
                ".env",
                "PRD.md",
                "server/smc_strategy.ts",
                "data/ai_memory.json",
              ];
              if (blocked.some((f) => argPath === f || argPath.endsWith(f)))
                toolResult = { error: "File system kritikal gaboleh dihapus!" };
              else {
                const p = path.join(process.cwd(), argPath);
                if (!fs.existsSync(p)) toolResult = { error: "Not found" };
                else {
                  fs.unlinkSync(p);
                  memoryManager.saveMemory(
                    "past_decisions",
                    `Hapus ${argPath} krn ${reason}`,
                  );
                  toolResult = { success: true };
                }
              }
            } else if (call.name === "listFiles") {
              const targetPath =
                dir && dir !== "."
                  ? path.join(process.cwd(), dir)
                  : process.cwd();
              if (!targetPath.startsWith(process.cwd()))
                toolResult = { error: "Access denied." };
              else {
                const files = fs.readdirSync(targetPath);
                toolResult = { files };
              }
            } else if (call.name === "gitCommit") {
              const res = gitAgent.commitAll(argMsg || "AI Auto Commit");
              memoryManager.saveMemory("past_decisions", `Commit: ${argMsg}`);
              toolResult = res;
            } else if (call.name === "getSystemState") {
              toolResult = systemState;
            } else if (call.name === "queryMCPServer") {
              try {
                const baseUrl = process.env.MCP_SERVER_URL || "http://127.0.0.1:8000";
                const baseUrlClean = baseUrl.replace(/\/+$/, "");

                // Ensure endpoint starts with /api/v1
                let sanitizedEndpoint = args.endpoint.startsWith("/")
                  ? args.endpoint
                  : `/${args.endpoint}`;
                if (!sanitizedEndpoint.startsWith("/api/v1")) {
                  sanitizedEndpoint = `/api/v1${sanitizedEndpoint}`;
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                const fetchRes = await fetch(`${baseUrlClean}${sanitizedEndpoint}`, {
                  signal: controller.signal,
                  headers: {
                    "x-admin-token": process.env.ADMIN_SECRET || ""
                  }
                });
                clearTimeout(timeoutId);
                const data = await fetchRes.json();

                if (!fetchRes.ok) {
                  toolResult = {
                    error: `MCP Server Error (${fetchRes.status})`,
                    details: data,
                  };
                } else {
                  toolResult = { success: true, data };
                }
              } catch (err: any) {
                console.error("MCP Fetch Error:", err);
                toolResult = {
                  error: "MCP Server offline / unreachable: " + err.message,
                };
              }
            }
          } catch (e: any) {
            console.error("Tool exec error:", e);
            toolResult = { error: e.message };
          }

          const toolResponsePart = {
            role: "tool",
            tool_call_id: resMsg.tool_calls[0].id,
            content: JSON.stringify(toolResult),
          };

          messages.push(toolResponsePart);
          iter++;
        } else {
          // No more tool calls, we have the text
          aiAnswer = resMsg.content || "Selesai.";
          break;
        }
      }
      memoryManager.saveMemory(
        "user_preferences",
        `Chat: User bertanya "${message?.substring(0, 50)}..." - Dijawab oleh AI: ${aiAnswer?.substring(0, 50)}...`,
      );

      const finalFormattedAnswer = responseFormatter(aiAnswer);

      res.json({
        success: true,
        response: finalFormattedAnswer,
        provider_status: providerStatus,
      });
    } catch (err: any) {
      console.error("[AI Chat Error]:", err);
      res.status(500).json({
        error: "Terjadi kesalahan internal. Gagal mengakses AI.",
        provider_status: "fallback_failed",
      });
    }
  },
);

// 6. GET /api/agent/rollback
apiRouter.get("/agent/rollback", requireAdminAuth, (req, res) => {
  try {
    console.log(`[AI_AGENT] User minta ROLLBACK`);
    const result = gitAgent.rollbackTo("HEAD~1");
    memoryManager.saveMemory(
      "past_decisions",
      "Emergency Rollback executed to HEAD~1",
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Keep Original Endpoints
apiRouter.post("/system/errors/clear", requireAdminAuth, (req, res) => {
  systemState.errors = [];
  res.json({ success: true, message: "Errors cleared", data: [] });
});

apiRouter.post("/ai/rollback", requireAdminAuth, (req, res) => {
  try {
    const result = gitAgent.rollbackTo("HEAD~1");
    memoryManager.saveMemory(
      "past_decisions",
      "Emergency Rollback executed to HEAD~1",
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get("/health", (req, res) => {
  res.json({
    server: "online",
    database: process.env.FIREBASE_PROJECT_ID ? "online" : "offline",
    twelvedata: process.env.TWELVEDATA_API_KEY ? "online" : "offline",
    openrouter: process.env.OPENROUTER_API_KEY ? "online" : "offline",
    xai: process.env.XAI_API_KEY ? "online" : "offline",
  });
});

apiRouter.get("/mcp/status", async (req, res) => {
  const baseUrl = process.env.MCP_SERVER_URL || "http://127.0.0.1:8000";
  const baseUrlClean = baseUrl.replace(/\/+$/, "");
  let pythonData: any = null;
  let pythonReachable = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const healthRes = await fetch(`${baseUrlClean}/api/v1/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (healthRes.ok) {
      pythonData = await healthRes.json();
      pythonReachable = true;
    }
  } catch (err) {
    console.log("[MCP Status] Python backend not reachable:", (err as any).message);
  }

  const envs = process.env;

  const nodeRegistry = [
    { id: "node-core", name: "AI Core Router (Node)", domain: "Infrastructure", status: "ONLINE", version: process.version },
    { id: "node-sqlite", name: "Local SQLite DB", domain: "Database", status: fs.existsSync(path.join(process.cwd(), "data", "trading.db")) ? "ONLINE" : "UNAVAILABLE", version: "1.0" },
    { id: "firebase-db", name: "Firebase Firestore DB", domain: "Database", status: envs.FIREBASE_PROJECT_ID ? "ONLINE" : "NOT_CONFIGURED", version: "1.0" },
    { id: "supabase-db", name: "Supabase DB", domain: "Database", status: (envs.SUPABASE_URL && (envs.SUPABASE_SERVICE_ROLE_KEY || envs.SUPABASE_ANON_KEY)) ? "ONLINE" : "NOT_CONFIGURED", version: "1.0" },
    { id: "twelvedata-engine", name: "TwelveData Market Data", domain: "Market Data", status: envs.TWELVEDATA_API_KEY ? "ONLINE" : "NOT_CONFIGURED", version: "1.0" },
    { id: "yahoo-finance", name: "Yahoo Finance Primary/Fallback", domain: "Market Data", status: "ONLINE", version: "1.0" },
    { id: "news-engine", name: "News Calendar Engine", domain: "News & Sentiment", status: "ONLINE", version: "1.0" },
    { id: "node-smc-master", name: "SMC Strategy Master", domain: "SMC", status: Object.keys(systemState.strategies).length > 0 ? "ONLINE" : "AWAITING", version: "1.0" },
    { id: "node-ai", name: "AI Validator (Node)", domain: "AI", status: envs.OPENROUTER_API_KEY || envs.GEMINI_API_KEY || envs.GROQ_API_KEY || envs.XAI_API_KEY ? "ONLINE" : "NOT_CONFIGURED", version: "1.0" },
    { id: "node-telegram", name: "Telegram Action Bot", domain: "Observability", status: envs.TELEGRAM_BOT_TOKEN ? "ONLINE" : "NOT_CONFIGURED", version: "1.0" },
    { id: "position-manager", name: "MT5 Position Manager", domain: "Execution", status: "ONLINE", version: "1.0" },
    { id: "execution-engine", name: "Execution Dispatcher", domain: "Execution", status: envs.META_API_TOKEN || envs.MT5_USER ? "READY" : "NOT_CONFIGURED", version: "1.0" },
    { id: "infra-sched", name: "Cron Pulse Scheduler", domain: "Infrastructure", status: "ONLINE", version: "1.0" },
    { id: "deploy-railway", name: "Railway Runtime", domain: "Deployment", status: envs.RAILWAY_ENVIRONMENT ? "ONLINE" : "UNAVAILABLE", version: "1.0" },
  ];

  const mcpRegistry = [...nodeRegistry];

  // Handle Python MCP status based on actual backend response
  if (pythonReachable && pythonData) {
    // If backend M sends an engines/mcps array, use it
    if (Array.isArray(pythonData.engines)) {
      for (const pyMcp of pythonData.engines) {
        mcpRegistry.push({
          id: pyMcp.id || pyMcp.name?.toLowerCase().replace(/\s+/g, "-"),
          name: pyMcp.name || "Unknown Engine",
          domain: pyMcp.domain || "MCP Backend",
          status: pyMcp.status || "ONLINE",
          version: pyMcp.version || "1.0",
        });
      }
    } else if (Array.isArray(pythonData.mcps)) {
      // Legacy format support
      for (const pyMcp of pythonData.mcps) {
        mcpRegistry.push({
          id: pyMcp.id,
          name: pyMcp.name,
          domain: pyMcp.domain,
          status: pyMcp.status,
          version: "1.0",
        });
      }
    } else {
      // Backend M is reachable but doesn't send engine list — show a generic entry
      // with REACHABLE status (not UNAVAILABLE, because the server IS responding)
      mcpRegistry.push({
        id: "python-core",
        name: "Python MCP Backend",
        domain: "Infrastructure",
        status: "REACHABLE",
        version: "1.0",
      });
    }
  } else {
    // Backend M is not reachable at all
    mcpRegistry.push({
      id: "python-core",
      name: "Python MCP Backend",
      domain: "Infrastructure",
      status: "UNAVAILABLE",
      version: "0.0",
    });
  }

  res.json({
    success: true,
    engines: mcpRegistry,
  });
});

apiRouter.get("/system/status", (req, res) => {
  res.json({
    success: true,
    message: "Status fetched",
    data: {
      status: "ONLINE",
      connections: {
        market_feed: process.env.TWELVEDATA_API_KEY ? "ONLINE (TwelveData)" : "YAHOO_FINANCE",
        firestore: process.env.FIREBASE_PROJECT_ID ? "ONLINE" : "OFFLINE",
        telegram: process.env.TELEGRAM_BOT_TOKEN ? "ONLINE" : "OFFLINE",
        openrouter: process.env.OPENROUTER_API_KEY ? "ONLINE" : "OFFLINE",
        xai: process.env.XAI_API_KEY ? "ONLINE" : "OFFLINE",
        metaapi: process.env.META_API_TOKEN ? "ONLINE" : "OFFLINE",
        scheduler: "ONLINE",
      },
      lastScan: systemState.lastScan,
      isNewsBlocked: systemState.isNewsBlocked,
      engineMode: systemState.engineMode,
      robotStatus: systemState.robotStatus,
      autotrade: systemState.autotrade,
      settings: systemState.settings,
      errors: systemState.errors,
      prices: systemState.prices,
      setup: systemState.setup,
      strategies: systemState.strategies,
    },
  });
});

apiRouter.post("/system/settings", requireAdminAuth, express.json(), (req, res) => {
  const { atrThreshold } = req.body;
  if (atrThreshold && typeof atrThreshold === "number") {
    systemState.settings.atrThreshold = atrThreshold;
  }
  res.json({
    success: true,
    message: "Settings updated",
    data: systemState.settings,
  });
});

apiRouter.post("/system/autotrade", requireAdminAuth, express.json(), (req, res) => {
  const data = req.body;
  if (data) {
    systemState.autotrade = { ...systemState.autotrade, ...data };
    res.json({
      success: true,
      message: "AutoTrade settings updated",
      data: systemState.autotrade,
    });
  } else {
    res.status(400).json({ success: false, message: "Invalid payload" });
  }
});

apiRouter.post("/system/robot", requireAdminAuth, express.json(), (req, res) => {
  const { status } = req.body;
  const validStatus = ["ON", "OFF", "PAUSE", "EMERGENCY_STOP"];
  if (validStatus.includes(status)) {
    systemState.robotStatus = status;
    res.json({
      success: true,
      message: `Robot status updated to ${status}`,
      data: status,
    });
  } else {
    res.status(400).json({ success: false, message: "Invalid status" });
  }
});

// ------------------------------------
// (MT5 UI / Execute routes removed - execution handled natively by Python MCP Bridge or MetaAPI)
// ------------------------------------

import { db } from "./server/db.js";
import { executeTrade } from "./server/execution.js";
import { metaApiBridge } from "./server/execution/metaapi_bridge.js";

apiRouter.post("/webhooks/tradingview", express.json(), async (req, res) => {
  try {
    const data = req.body;
    
    // Security check: require a webhook token
    const expectedToken = process.env.WEBHOOK_SECRET_TOKEN;
    const providedToken = req.headers["x-webhook-token"] || data.token;
    
    if (expectedToken && providedToken !== expectedToken) {
      console.warn(`[WEBHOOK] Unauthorized access attempt: ${providedToken}`);
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!data.symbol || !data.action) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Invalid payload format. Needs symbol and action.",
        });
    }

    console.log(
      `[WEBHOOK] TradingView Signal Received: ${JSON.stringify(data)}`,
    );

    const signalPayload = {
      symbol: data.symbol,
      type: data.action.toUpperCase() as "BUY" | "SELL",
      entry: data.price || 0,
      sl: data.sl || 0,
      tp1: data.tp || 0,
      source: "TRADINGVIEW",
    };

    const autotradeParams = systemState.autotrade;

    await executeTrade(signalPayload, autotradeParams);

    res.json({
      success: true,
      message: "Webhook processed and forwarded to execution engine.",
    });
  } catch (err: any) {
    console.error(`[WEBHOOK] TradingView Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get("/signals", async (req, res) => {
  try {
    const localSignals = db
      .prepare(`SELECT * FROM signals ORDER BY timestamp DESC LIMIT 50`)
      .all();

    const formattedLocalSignals = localSignals.map((s: any) => ({
      ...s,
      currentPips: s.currentPips || 0,
      peakPips: s.peakPips || 0,
      rrRatio: s.rrRatio || 0,
      confidence: s.confidence || 0,
    }));

    const merged = [...formattedLocalSignals];
    systemState.signalsHistory.forEach((sig: any) => {
      if (!merged.find((m: any) => m.id === sig.id)) {
        merged.unshift(sig);
      } else {
        const idx = merged.findIndex((m: any) => m.id === sig.id);
        if (idx !== -1) merged[idx] = sig;
      }
    });

    merged.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    res.json({
      success: true,
      message: "Signals fetched from SQLite & Memory",
      data: merged.slice(0, 50),
    });
  } catch (err) {
    console.error("Fetch Signals Error", err);
    res.status(500).json({
      success: false,
      message: "DB Error",
      data: systemState.signalsHistory,
    });
  }
});

apiRouter.get("/latest-signal", async (req, res) => {
  if (systemState.activeSignal) {
    return res.json({
      success: true,
      message: "Latest signal fetched from memory",
      data: systemState.activeSignal,
    });
  }

  try {
    const latest = db
      .prepare(`SELECT * FROM signals ORDER BY timestamp DESC LIMIT 1`)
      .get();
    res.json({
      success: true,
      message: "Signal fetched from SQLite DB",
      data: latest || null,
    });
  } catch (err) {
    console.error("DB Error latest signal", err);
    res.status(500).json({ success: false, message: "DB Error", data: null });
  }
});

apiRouter.post("/scan", requireAdminAuth, async (req, res) => {
  try {
    await runTradingPipeline(
      "GC=F",
      "XAUUSD",
      "H1",
      "M5",
      "M1",
      "Scalping",
      true,
    );
    res.json({
      success: true,
      message: "Manual scan triggered successfully",
      data: systemState.activeSignal,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
