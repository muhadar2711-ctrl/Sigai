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
    // Regex mencari angka desimal harga tipikal
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

  // Proteksi Hallucination Prevention: Sisipkan instruksi paksa pada pesan terbaru
  const hallucinationGuard = "\n\n[SYSTEM_PROTECTION]: Wajib sertakan 'Evidence Source' (Sumber Bukti) untuk setiap angka harga atau level teknikal yang disebutkan. Dilarang keras merekayasa angka jika data tidak tersedia dalam context.";
  const userParts: Part[] = [{ text: newMessage + hallucinationGuard }];
  
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
      // 1. Verifikasi Integritas Data sebelum pemanggilan API
      if (!verifyDataIntegrity(history, newMessage)) {
        return { 
          response: "⚠️ **CONTEXT_SYNC_FAILED**: Data pasar real-time atau bukti harga tidak ditemukan dalam input. Sistem menolak pemrosesan untuk mencegah halusinasi.",
          provider_status: "INTEGRITY_REJECTED"
        };
      }

      const model = this.genAI.getGenerativeModel({ 
        model: modelName, 
        tools: [tradeSignalTool],
        systemInstruction: "Kamu adalah mesin eksekusi trading yang hanya berbicara berdasarkan data nyata. Jangan pernah memberikan saran tanpa bukti angka. Jika data harga 0 atau tidak ada, katakan 'DATA TIDAK TERSEDIA'."
      });
      
      const contents = buildGeminiPayload(history, newMessage, images);
      
      const result = await model.generateContentStream({ 
        contents: contents,
        generationConfig: {
          temperature: temperature || 0.1, // Rendah untuk presisi
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
      
      if (toolCalls.length > 0) {
        return { tool_calls: toolCalls, success: true };
      }

      return { response: aggregatedResponse, success: true };

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
      return Promise.resolve({ response: "API Key AI tidak dikonfigurasi. Sistem dalam mode OFFLINE." });
    }
  }
  defaultProvider = new FallbackProvider();
}

export const aiAdapter = new AIAdapter(defaultProvider);
export { buildGeminiPayload, verifyDataIntegrity };