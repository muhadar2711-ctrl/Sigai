import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock3,
  RefreshCcw,
  Send,
  Shield,
  Sparkles,
  Trash2,
  MessageSquare,
  Paperclip,
  X,
  Image as ImageIcon
} from "lucide-react";
import Markdown from "react-markdown";
import { Card } from "./ui";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/utils";

type Role = "user" | "model" | "system";

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  images?: string[]; // base64 images
  meta?: {
    provider_status?: string;
    context_summary?: string;
    intermediate_steps?: { agent: string; content: string }[];
  };
}

interface SystemStatusPayload {
  status?: string;
  summary?: Record<string, number>;
  mcps?: Array<{ id: string; name: string; domain: string; status: string }>;
  errors?: string[];
  prices?: Record<string, any>;
  setup?: any;
}

const HISTORY_KEY = "sigai_ai_chat_history_v2"; // updated version for images support
const PREFILL_KEY = "sigai_ai_chat_prefill";

function makeId() {
  return crypto.randomUUID();
}

function loadHistory(): ChatMessage[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Classify error into user-friendly message with accurate severity
 */
function classifyError(err: any): { message: string; severity: "error" | "warning" | "info" } {
  const msg = (err?.message || "").toLowerCase();
  const status = err?.status || err?.response?.status;

  // Network errors (no response from server)
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("econnrefused") || msg.includes("enotfound")) {
    return {
      message: "Tidak dapat terhubung ke server. Pastikan backend berjalan dan MCP_SERVER_URL benar.",
      severity: "error",
    };
  }

  // Auth errors
  if (status === 401 || status === 403 || msg.includes("unauthorized") || msg.includes("admin_secret")) {
    return {
      message: "Otentikasi gagal. Periksa admin_secret di environment.",
      severity: "warning",
    };
  }

  // Rate limit
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many requests")) {
    return {
      message: "Terlalu banyak request. Tunggu sebentar lalu coba lagi.",
      severity: "warning",
    };
  }

  // Server errors
  if (status === 500 || msg.includes("internal server error") || msg.includes("kesalahan internal")) {
    return {
      message: "Server AI mengalami error internal. Coba beberapa saat lagi.",
      severity: "error",
    };
  }

  // API key errors
  if (msg.includes("api key") || msg.includes("api_key") || msg.includes("belum ada api key")) {
    return {
      message: "API Key AI belum dikonfigurasi. Set GEMINI_API_KEY atau provider lain di environment.",
      severity: "warning",
    };
  }

  // Provider exhausted
  if (msg.includes("fallback") || msg.includes("exhausted") || msg.includes("quota") || msg.includes("rate limit")) {
    return {
      message: "Semua provider AI sedang sibuk atau kuota habis. Coba beberapa saat lagi.",
      severity: "warning",
    };
  }

  // MCP server errors
  if (msg.includes("mcp") || msg.includes("python mcp") || msg.includes("offline")) {
    return {
      message: "MCP Server tidak reachable. Pastikan MCP_SERVER_URL mengarah ke backend M yang benar.",
      severity: "warning",
    };
  }

  // Gemini-specific errors
  if (msg.includes("gemini") || msg.includes("google") || msg.includes("genai")) {
    return {
      message: "Gemini API error. Periksa GEMINI_API_KEY dan format payload.",
      severity: "error",
    };
  }

  // Malformed response (parsing error)
  if (msg.includes("invalid json") || msg.includes("malformed") || msg.includes("parse")) {
    return {
      message: "Response dari server tidak valid. Backend mungkin mengembalikan format yang salah.",
      severity: "error",
    };
  }

  // Default
  return {
    message: err?.message || "Permintaan gagal diproses. Periksa koneksi backend dan konfigurasi env.",
    severity: "error",
  };
}

/**
 * Extract clean base64 data from a base64 string or data URL
 * Returns pure base64 without data URL prefix
 */
function extractBase64(img: string): string {
  if (!img) return "";
  if (img.includes(",")) {
    return img.split(",")[1];
  }
  return img;
}

export function AIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadHistory();
    if (saved.length) return saved;
    return [
      {
        id: makeId(),
        role: "system",
        content:
          "Sigai 6 Chat siap. Semua jawaban harus grounded pada data, RAG, dan status sistem yang benar-benar tersedia.",
        timestamp: Date.now(),
      },
    ];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatusPayload | null>(
    null,
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  
  // Image handling
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-60)));
  }, [messages]);

  useEffect(() => {
    const prefill = sessionStorage.getItem(PREFILL_KEY);
    if (prefill) {
      setInput(prefill);
      sessionStorage.removeItem(PREFILL_KEY);
    }
  }, []);

  const fetchSystemStatus = async () => {
    try {
      const [sysRes, mcpRes] = await Promise.all([
        apiFetch("/system/status"),
        apiFetch("/mcp/status"),
      ]);
      const payload = (sysRes?.data ?? sysRes) as SystemStatusPayload;

      // Calculate summary manually from real engines array
      const engines = mcpRes?.engines || [];
      const stats = {
        ONLINE: engines.filter(
          (e: any) => e.status === "ONLINE" || e.status === "READY",
        ).length,
        NOT_CONFIGURED: engines.filter(
          (e: any) => e.status === "NOT_CONFIGURED",
        ).length,
        UNAVAILABLE: engines.filter((e: any) => e.status === "UNAVAILABLE")
          .length,
        TOTAL: engines.length,
      };

      setSystemStatus({ ...payload, summary: stats, mcps: engines });
    } catch (err: any) {
      console.error("[AIChat] fetchSystemStatus error:", err);
      setSystemStatus(null);
      // Don't show network errors to UI for background polling
    }
  };

  useEffect(() => {
    fetchSystemStatus();
    const iv = window.setInterval(fetchSystemStatus, 10_000);
    return () => window.clearInterval(iv);
  }, []);

  const summary = useMemo(() => {
    const counts = systemStatus?.summary || {};
    return {
      online: counts.ONLINE || 0,
      notConfigured: counts.NOT_CONFIGURED || 0,
      unavailable: counts.UNAVAILABLE || 0,
      total: counts.TOTAL || 0,
    };
  }, [systemStatus]);

  const quickPrompts = [
    "Jelaskan signal terakhir dengan risk dan invalidation.",
    "Analisis chart berikut dan temukan FVG/OB yang valid.",
    "Bantu saya memeriksa dan mengaudit setup ini.",
    "Ringkaskan bias makro/news untuk sesi ini.",
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
         setErrorText("Hanya file gambar yang diizinkan.");
         return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImages((prev) => [...prev, base64String]);
      };
      reader.readAsDataURL(file);
    });
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0) || loading) return;

    setErrorText(null);
    setLoading(true);
    setInput("");
    
    const currentImages = [...images];
    setImages([]); // clear images immediately for UI

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        id: makeId(),
        role: "user",
        content: trimmed || "Tolong analisis chart yang disertakan ini.",
        images: currentImages.length > 0 ? currentImages : undefined,
        timestamp: Date.now(),
      },
    ];
    setMessages(nextMessages);

    try {
      const historyPayload = nextMessages
        .filter((m) => m.role === "user" || m.role === "model")
        .map((m) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: m.content,
        }));

      // CRITICAL FIX: Send full base64 data URL — the backend will strip the prefix
      // This ensures compatibility with both Gemini (needs pure base64) and OpenAI (needs data URL)
      const imagesBase64 = currentImages.length > 0 
        ? currentImages.map(img => extractBase64(img)) 
        : undefined;

      const response = await apiFetch("/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed || "Tolong analisis chart yang disertakan ini.",
          images_base64: imagesBase64,
          history: historyPayload,
          mode: "trading",
          session_id: localStorage.getItem("sigai_ai_session_id") || undefined,
        }),
      });

      if (response?.session_id) {
        localStorage.setItem("sigai_ai_session_id", response.session_id);
      }

      // Check if response indicates an error
      if (response?.error) {
        const errInfo = classifyError({ message: response.error });
        setErrorText(errInfo.message);
        const aiMessage: ChatMessage = {
          id: makeId(),
          role: "model",
          content: `⚠️ **Error**: ${errInfo.message}`,
          timestamp: Date.now(),
          meta: {
            provider_status: response?.provider_status || "error",
          },
        };
        setMessages((prev) => [...prev, aiMessage]);
        return;
      }

      // CRITICAL FIX: Check for valid response with better error handling
      const responseContent = response?.response;
      const providerStatus = response?.provider_status;
      
      if (!responseContent && !response?.success) {
        // Server returned success: false without error message
        const errMsg = "Server mengembalikan response kosong tanpa status error. Kemungkinan routing atau parsing error di backend.";
        console.error("[AIChat] Empty response:", response);
        setErrorText(errMsg);
        const aiMessage: ChatMessage = {
          id: makeId(),
          role: "model",
          content: `⚠️ **Error**: ${errMsg}`,
          timestamp: Date.now(),
          meta: { provider_status: providerStatus || "error" },
        };
        setMessages((prev) => [...prev, aiMessage]);
        return;
      }

      if (!responseContent && response?.success) {
        // Success but no content — this is a malformed response
        console.warn("[AIChat] Success but no response content:", response);
      }

      const aiMessage: ChatMessage = {
        id: makeId(),
        role: "model",
        content: responseContent || "AI merespons tetapi tidak mengembalikan teks. Kemungkinan model hanya memanggil tool internal.",
        timestamp: Date.now(),
        meta: {
          provider_status: providerStatus,
          context_summary: response?.context_summary,
          intermediate_steps: response?.intermediate_steps,
        },
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err: any) {
      console.error("[AIChat] sendMessage error:", err);
      const errInfo = classifyError(err);
      const fallback: ChatMessage = {
        id: makeId(),
        role: "model",
        content: `⚠️ **Error**: ${errInfo.message}`,
        timestamp: Date.now(),
        meta: { provider_status: "OFFLINE" },
      };
      setMessages((prev) => [...prev, fallback]);
      setErrorText(errInfo.message);
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = () => {
    const starter: ChatMessage[] = [
      {
        id: makeId(),
        role: "system",
        content:
          "Riwayat dibersihkan. Kirim perintah baru untuk analisis trading, RAG, atau audit MCP.",
        timestamp: Date.now(),
      },
    ];
    setMessages(starter);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem("sigai_ai_session_id");
  };

  const statusLabel = systemStatus?.status || "UNKNOWN";
  const isHealthy = statusLabel === "ONLINE" || summary.online > 0;

  return (
    <Card className="h-full flex flex-col overflow-hidden border border-brand-border/60 bg-brand-bg-sec/30 backdrop-blur-xl">
      <div className="border-b border-brand-border/40 p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-brand-bg-sec/50">
        <div className="space-y-1 w-full sm:w-auto">
          <div className="flex items-center justify-between sm:justify-start gap-2">
             <div className="flex items-center gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-widest text-brand-text">
               <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                 <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", isHealthy ? "animate-ping bg-brand-success" : "bg-brand-danger")}></span>
                 <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", isHealthy ? "bg-brand-success" : "bg-brand-danger")}></span>
               </span>
               <span className="text-brand-accent">Sigai</span> Sniper AI Terminal
             </div>
             <div className="flex items-center gap-2 sm:hidden text-[9px] font-mono">
               <span
                 className={cn(
                   "font-bold flex items-center gap-1 border px-1.5 py-0.5 rounded",
                   isHealthy ? "text-brand-success border-brand-success/30 bg-brand-success/10" : "text-brand-warning border-brand-warning/30 bg-brand-warning/10",
                 )}
               >
                 {statusLabel}
               </span>
             </div>
          </div>
          
          <div className="hidden sm:flex flex-wrap gap-2 pt-1 text-[10px] font-mono opacity-80 uppercase">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded border flex items-center gap-1",
                isHealthy ? "border-brand-success/30 bg-brand-success/10 text-brand-success" : "border-brand-warning/30 bg-brand-warning/10 text-brand-warning"
              )}
            >
              {isHealthy ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {statusLabel}
            </span>
            <span className="px-1.5 py-0.5 rounded border border-brand-border/50 text-brand-text-sec bg-black/20">
              SYS_ON: {summary.online}
            </span>
            <span className="px-1.5 py-0.5 rounded border border-brand-border/30 text-brand-text-sec/70 bg-black/20">
              SYS_PENDING: {summary.notConfigured + summary.unavailable}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={fetchSystemStatus}
            className="px-2 py-1.5 font-mono text-[10px] uppercase border border-brand-border/40 bg-black/20 hover:bg-brand-border/30 rounded text-brand-text-sec transition-colors flex items-center gap-1"
            title="Refresh Status"
          >
            <RefreshCcw className="w-3 h-3" />
            Ping
          </button>
          <button
            onClick={clearHistory}
            className="px-2 py-1.5 font-mono text-[10px] uppercase border border-brand-danger/20 bg-brand-danger/10 hover:bg-brand-danger/20 hover:text-brand-danger rounded text-brand-text-sec transition-colors flex items-center gap-1"
            title="Clear History"
          >
            <Trash2 className="w-3 h-3" />
            Wipe
          </button>
        </div>
      </div>

      <div className="p-2 sm:p-3 border-b border-brand-border/40 overflow-x-auto whitespace-nowrap scrollbar-hide bg-black/10">
        <div className="flex gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => setInput(prompt)}
              className="px-3 py-1.5 rounded text-[9px] sm:text-[10px] font-mono border border-brand-border/30 bg-black/40 text-brand-text-sec hover:border-brand-accent/50 hover:text-brand-accent transition-all whitespace-nowrap shrink-0 group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-brand-accent/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              {">"} {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-5 min-h-[300px] bg-gradient-to-b from-transparent to-brand-bg-sec/10">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[95%] sm:max-w-[85%] rounded border px-4 py-3 sm:py-4 ${
                message.role === "user"
                  ? "border-brand-border/50 bg-brand-bg-sec/80 text-brand-text backdrop-blur"
                  : message.role === "system"
                    ? "border-none bg-transparent text-brand-text-sec/60 text-center font-mono text-[10px] uppercase tracking-[0.2em] w-full"
                    : "border-brand-accent/20 bg-black/40 text-brand-text backdrop-blur shadow-[0_0_15px_rgba(var(--brand-accent),0.02)]"
              }`}
            >
              {message.role !== "system" && (
                <div className={cn("flex items-center gap-2 text-[10px] sm:text-[11px] uppercase tracking-widest font-mono opacity-80 mb-3 border-b border-brand-border/30 pb-2", message.role === "user" ? "text-brand-text-sec" : "text-brand-accent")}>
                  {message.role === "user" ? (
                    <>
                      <span>USER_OPERATOR</span>
                      <span className="mx-1 opacity-30">|</span>
                      <Clock3 className="w-3 h-3" />
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="font-bold">SIGAI SNIPER AI</span>
                      <span className="mx-1 opacity-30">|</span>
                      <Clock3 className="w-3 h-3" />
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      {message.meta?.provider_status && (
                        <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-accent/10 border border-brand-accent/20 text-[9px] text-brand-accent">
                          <Activity className="w-2.5 h-2.5" />
                          {message.meta.provider_status}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Render Images if any */}
              {message.images && message.images.length > 0 && (
                <div className="flex flex-wrap gap-2 animate-in fade-in zoom-in duration-300 mb-3">
                  {message.images.map((img, idx) => (
                    <div key={idx} className="relative group rounded-md overflow-hidden border border-brand-border/50 max-w-[200px] max-h-[200px]">
                      <img src={img} alt={`Attached ${idx}`} className="object-cover w-full h-full" />
                    </div>
                  ))}
                </div>
              )}

              <div className={cn("prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/60 prose-pre:border prose-pre:border-brand-border/50 prose-a:text-brand-accent", message.role === "system" && "text-center mb-0")}>
                <Markdown>{message.content}</Markdown>
              </div>

              {message.meta?.context_summary && (
                <div className="mt-4 pt-3 border-t border-brand-border/40 text-[10px] sm:text-[11px] text-brand-text-sec">
                  <div className="font-mono text-brand-accent/70 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Activity className="w-3 h-3" />
                    [Execution Context]
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed bg-black/40 p-3 rounded border border-brand-border/30 text-brand-text-sec/80">
                    {message.meta.context_summary}
                  </pre>
                </div>
              )}

              {message.meta?.intermediate_steps?.length ? (
                <details className="mt-3 text-[10px] sm:text-xs text-brand-text-sec/80 group">
                  <summary className="cursor-pointer select-none inline-flex items-center gap-1.5 hover:text-brand-text transition-colors font-mono uppercase tracking-widest border border-brand-border/30 px-2 py-1 rounded bg-black/20">
                    <Activity className="w-3 h-3 group-open:text-brand-accent transition-colors" />
                    [View Trace Logs]
                  </summary>
                  <div className="mt-3 space-y-2 pl-3 border-l-2 border-brand-accent/30">
                    {message.meta.intermediate_steps.map((step, index) => (
                      <div
                        key={`${step.agent}-${index}`}
                        className="rounded border border-brand-border/30 bg-black/40 px-3 py-2.5"
                      >
                        <div className="font-mono text-[9px] uppercase tracking-widest text-brand-accent/80 mb-1 flex items-center gap-1.5">
                           {">"} {step.agent}
                        </div>
                        <div className="text-[10px] sm:text-[11px] leading-relaxed opacity-90">{step.content}</div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded border border-brand-accent/20 bg-black/40 px-4 py-3 font-mono text-[10px] sm:text-[11px] text-brand-accent/80 flex items-center gap-3 shadow-[0_0_15px_rgba(var(--brand-accent),0.02)]">
              <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing market structure...</span>
            </div>
          </div>
        )}

        {errorText && (
          <div className="flex items-center justify-center gap-2 text-[10px] sm:text-xs font-mono text-brand-danger bg-brand-danger/10 border border-brand-danger/20 rounded p-3 mx-auto max-w-[90%] text-center">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{errorText}</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="border-t border-brand-border/40 p-3 sm:p-4 bg-black/20 flex flex-col gap-2">
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {images.map((img, idx) => (
              <div key={idx} className="relative group w-16 h-16 rounded border border-brand-accent/40 overflow-hidden shadow-md">
                 <img src={img} alt="upload preview" className="object-cover w-full h-full opacity-80 group-hover:opacity-100 transition-opacity" />
                 <button 
                   onClick={() => removeImage(idx)}
                   className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-brand-danger"
                 >
                   <X className="w-3 h-3" />
                 </button>
              </div>
            ))}
          </div>
        )}
        
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input);
          }}
        >
          <div className="relative flex items-center shrink-0">
             <input 
               type="file" 
               accept="image/*" 
               multiple 
               className="hidden" 
               ref={fileInputRef} 
               onChange={handleFileChange} 
             />
             <button
               type="button"
               disabled={loading}
               onClick={() => fileInputRef.current?.click()}
               title="Upload Chart/Image"
               className="p-2 sm:p-3 border border-brand-border/50 text-brand-text-sec bg-black/40 hover:bg-black/60 hover:text-brand-accent hover:border-brand-accent/50 rounded transition-colors"
             >
               <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
             </button>
          </div>
          
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-accent/50 font-mono text-sm opacity-50 select-none">{">"}</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about market conditions, auditing, or attach a chart..."
              className="w-full rounded border border-brand-border/50 bg-black/40 pl-8 pr-4 py-2.5 sm:py-3 text-[11px] sm:text-xs text-brand-text outline-none placeholder:text-brand-text-sec/50 focus:border-brand-accent/60 focus:bg-black/60 transition-all font-mono shadow-inner"
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || (!input.trim() && images.length === 0)}
            className="inline-flex items-center justify-center gap-2 rounded bg-brand-accent/90 hover:bg-brand-accent px-5 py-2.5 sm:py-3 text-[10px] sm:text-[11px] font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest transition-all whitespace-nowrap shadow-[0_0_10px_rgba(var(--brand-accent),0.3)] hover:shadow-[0_0_15px_rgba(var(--brand-accent),0.5)]"
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Execute</span>
          </button>
        </form>
      </div>
    </Card>
  );
}
