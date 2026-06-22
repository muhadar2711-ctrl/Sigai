import { GoogleGenerativeAI, Content, Part, Tool } from '@google/generative-ai';

// --- Interfaces ---
export interface TradeSignal {
  action: 'BUY' | 'SELL';
  symbol: string;
  stopLoss: number;
  takeProfit: number;
  risk: number; 
}

export interface AIProvider {
  generateContent(history: any[], newMessage: string, images: string[] | null, temperature: number, model: string): Promise<any>;
}

// --- Tool Definitions untuk Gemini (Strict Validation) ---
const tradeSignalTool: Tool = {
  functionDeclarations: [
    {
      name: 'execute_trade_signal',
      description: 'Mengeksekusi sinyal perdagangan ke terminal MT5 dengan parameter numerik ketat.',
      parameters: {
        type: 'OBJECT',
        properties: {
          action: { 
            type: 'STRING', 
            enum: ['BUY', 'SELL'],
            description: "Aksi perdagangan wajib 'BUY' atau 'SELL' (Uppercase)." 
          },
          symbol: { 
            type: 'STRING', 
            description: "Simbol instrumen keuangan valid, misal: 'XAUUSD'." 
          },
          stopLoss: { 
            type: 'NUMBER', 
            description: 'Level harga Stop Loss (SL). Wajib angka positif > 0.' 
          },
          takeProfit: { 
            type: 'NUMBER', 
            description: 'Level harga Take Profit (TP). Wajib angka positif > 0.' 
          },
          risk: { 
            type: 'NUMBER', 
            description: 'Persentase risiko (0.1 - 5.0). Wajib angka.' 
          },
        },
        required: ['action', 'symbol', 'stopLoss', 'takeProfit', 'risk'],
      },
    },
  ],
};

// --- Data Integrity & Hallucination Prevention ---

/**
 * Verifikasi Integritas Data (Anti-Dummy/Anti-Hallucination)
 * Memastikan data harga masuk akal sebelum diproses AI.
 */
const verifyDataIntegrity = (history: any[], newMessage: string): boolean => {
  const fullContext = (JSON.stringify(history) + newMessage).toLowerCase();
  
  // Jika konteks mengandung indikasi trading tapi tidak ada angka valid
  const hasTradingKeywords = /buy|sell|signal|entry|setup|xauusd|gold/.test(fullContext);
  if (hasTradingKeywords) {
    const pricePattern = /\d{1,5}\.\d{1,5}/;
    const hasPriceData = pricePattern.test(fullContext);
    
    if (!hasPriceData) {
      console.error("[DATA_INTEGRITY] Gagal: Kata kunci trading ditemukan tetapi data harga (OHLC) hilang atau tidak valid.");
      return false;
    }
  }
  return true;
};

/**
 * Membangun payload yang valid untuk Google Gemini API.
 */
const buildGeminiPayload = (history: any[], newMessage: string, images: string[] | null): Content[] => {
  const contents: Content[] = history.map(msg => {
    const role = msg.role === 'user' ? 'user' : 'model';
    return { role, parts: [{ text: msg.content }] };
  });

  // Instruksi Auditor Senior & Critical Audit Protocol
  const auditorInstruction = `
[CRITICAL_AUDIT_PROTOCOL]: Bertindaklah sebagai Senior Trading Auditor yang bertugas mencari KESALAHAN pada analisis teknikal.
- Cari klaim yang tidak didukung data nyata (Contoh: Klaim Trend Bullish tanpa Higher High yang jelas di data OHLC).
- Jika terdeteksi klaim tanpa bukti (Data Hallucination), wajib berikan verdict: 'REJECTED: HALLUCINATION_DETECTED'.
- Audit kesesuaian Risk:Reward secara matematis. Jika RR < 1:1.5, wajib 'REJECTED: BAD_RR_RATIO'.
- Cari kontradiksi antar indikator atau timeframe.
- Jawaban harus rapi, bersih, terstruktur, dan hanya berisi FAKTA.

[CONFIDENCE_FILTER]: Wajib sertakan skor 'Confidence: [0-100]'.
[EVIDENCE_LEVEL]: Wajib tentukan 'Evidence Level: [HIGH|MEDIUM|LOW]' berdasarkan ketersediaan bukti numerik.
- HIGH: Data OHLC lengkap + Bukti Structure/Volume sinkron.
- LOW: Klaim tanpa koordinat harga atau volume yang mendukung.

Output format: [VERDICT], [REASON], [CONFIDENCE], [EVIDENCE_LEVEL]. No small talk.`;

  const userParts: Part[] = [{ text: newMessage + auditorInstruction }];
  
  if (images && images.length > 0) {
    for (const imageBase64 of images) {
      const mimeType = 'image/jpeg'; 
      userParts.push({
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      });
    }
  }

  contents.push({ role: 'user', parts: userParts });
  return contents;
};

// --- Gemini Provider ---

class GoogleGeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateContent(history: any[], newMessage: string, images: string[] | null, temperature: number, modelName: string): Promise<any> {
    try {
      if (!verifyDataIntegrity(history, newMessage)) {
        return { 
          response: "⚠️ **REJECTED: CONTEXT_SYNC_FAILED**. Bukti harga (OHLC) tidak ditemukan. Auditor menolak verifikasi tanpa data nyata.",
          provider_status: "INTEGRITY_REJECTED"
        };
      }

      const model = this.genAI.getGenerativeModel({ 
        model: modelName, 
        tools: [tradeSignalTool],
        systemInstruction: "Kamu adalah Senior Audit Analyst (Pessimistic). Gunakan 'Evidence-Based Reasoning'. Fokus utamamu adalah mendeteksi halusinasi analisis dan kesalahan teknikal. Jika data tidak sinkron atau klaim tidak didukung angka, keluarkan 'REJECTED: HALLUCINATION_DETECTED'. Wajib audit Risk:Reward."
      });
      
      const contents = buildGeminiPayload(history, newMessage, images);
      
      const result = await model.generateContentStream({ 
        contents: contents,
        generationConfig: {
          temperature: 0.1, 
          topP: 0.8,
        }
      });

      let aggregatedResponse = '';
      let toolCalls: any[] = [];

      for await (const chunk of result.stream) {
        if (chunk.functionCalls) {
          toolCalls.push(...chunk.functionCalls);
        }
        const chunkText = chunk.text();
        if(chunkText) {
          aggregatedResponse += chunkText;
        }
      }

      // Confidence Filter Parsing
      const confidenceMatch = aggregatedResponse.match(/Confidence:\s*\[?(\d+)\]?/i);
      const confidenceScore = confidenceMatch ? parseInt(confidenceMatch[1], 10) : 0;

      if (toolCalls.length > 0) {
        if (confidenceScore < 80) {
           return { 
             response: `⚠️ **REJECTED: INSUFFICIENT_CONFIDENCE (${confidenceScore}%)**. Auditor menolak eksekusi otomatis karena tingkat kepercayaan rendah atau data tidak sinkron.`,
             success: false,
             provider_status: "LOW_CONFIDENCE"
           };
        }
        return { tool_calls: toolCalls, success: true };
      }

      // Hallucination & Consistency Check
      if (aggregatedResponse.toUpperCase().includes("REJECTED")) {
          return { response: aggregatedResponse, success: false, confidence: confidenceScore };
      }

      if (confidenceScore < 80) {
        aggregatedResponse = `⚠️ **WAIT: AUDIT_INCOMPLETE**. \n\n${aggregatedResponse}`;
      }

      return { response: aggregatedResponse, success: true, confidence: confidenceScore };

    } catch (error: any) {
      console.error('Error saat generate content dengan Google Gemini:', error);
      throw new Error(`Error API Gemini: ${error.message}`);
    }
  }
}

// --- AI Adapter ---

class AIAdapter {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async generateContent(history: any[], newMessage: string, images: string[] | null, temperature: number, model: string) {
    return this.provider.generateContent(history, newMessage, images, temperature, model);
  }
}

let defaultProvider: AIProvider;

if (process.env.GEMINI_API_KEY) {
  defaultProvider = new GoogleGeminiProvider(process.env.GEMINI_API_KEY);
} else {
  class FallbackProvider implements AIProvider {
    async generateContent(history: any[], newMessage: string, images: string[] | null, temperature: number, model: string): Promise<any> {
      return Promise.resolve({ response: "REJECTED: AI_OFFLINE. API Key tidak dikonfigurasi." });
    }
  }
  defaultProvider = new FallbackProvider();
}

export const aiAdapter = new AIAdapter(defaultProvider);
export { buildGeminiPayload, verifyDataIntegrity };