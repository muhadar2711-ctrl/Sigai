
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

// --- Tool Definitions untuk Gemini ---
const tradeSignalTool: Tool = {
  functionDeclarations: [
    {
      name: 'execute_trade_signal',
      description: 'Mengeksekusi sinyal perdagangan untuk tindakan BUY atau SELL.',
      parameters: {
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING', description: "Aksi perdagangan, 'BUY' atau 'SELL'." },
          symbol: { type: 'STRING', description: "Simbol instrumen keuangan, misal, 'XAUUSD'." },
          stopLoss: { type: 'NUMBER', description: 'Harga untuk menutup posisi saat rugi.' },
          takeProfit: { type: 'NUMBER', description: 'Harga untuk menutup posisi saat untung.' },
          risk: { type: 'NUMBER', description: 'Persentase saldo akun yang dipertaruhkan.' },
        },
        required: ['action', 'symbol', 'stopLoss', 'takeProfit', 'risk'],
      },
    },
  ],
};

// --- Gemini Provider (FIXED) ---

/**
 * Membangun payload yang valid untuk Google Gemini API.
 * Mengkonversi riwayat obrolan sederhana dan gambar base64 menjadi format Content[] yang benar.
 */
const buildGeminiPayload = (history: any[], newMessage: string, images: string[] | null): Content[] => {
  const contents: Content[] = history.map(msg => {
    // Frontend mengirim role 'assistant', backend Sigai perlu 'model'
    const role = msg.role === 'user' ? 'user' : 'model';
    return { role, parts: [{ text: msg.content }] };
  });

  // Buat bagian untuk pesan baru dari pengguna
  const userParts: Part[] = [{ text: newMessage }];
  
  // Tambahkan gambar jika ada
  if (images && images.length > 0) {
    for (const imageBase64 of images) {
      // Asumsikan gambar adalah JPEG jika tidak ada header, ini lebih aman
      const mimeType = 'image/jpeg'; 
      userParts.push({
        inlineData: {
          mimeType,
          data: imageBase64, // Frontend sudah mengirim base64 murni
        },
      });
    }
  }

  // Tambahkan pesan baru dari pengguna ke dalam history
  contents.push({ role: 'user', parts: userParts });

  return contents;
};

class GoogleGeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateContent(history: any[], newMessage: string, images: string[] | null, temperature: number, modelName: string): Promise<any> {
    try {
      const model = this.genAI.getGenerativeModel({ model: modelName, tools: [tradeSignalTool] });
      
      // Gunakan fungsi build payload yang sudah diperbaiki
      const contents = buildGeminiPayload(history, newMessage, images);
      
      const result = await model.generateContentStream({ 
        contents: contents,
        generationConfig: {
          temperature,
        }
      });

      let aggregatedResponse = '';
      let toolCalls: any[] = [];

      for await (const chunk of result.stream) {
        // Deteksi dan kumpulkan panggilan tool
        if (chunk.functionCalls) {
          toolCalls.push(...chunk.functionCalls);
        }
        
        // Kumpulkan teks respons
        const chunkText = chunk.text();
        if(chunkText) {
          aggregatedResponse += chunkText;
        }
      }
      
      // Jika ada panggilan tool, kembalikan dalam format yang diharapkan
      if (toolCalls.length > 0) {
        return { tool_calls: toolCalls };
      }

      // Kembalikan respons teks biasa
      return { response: aggregatedResponse };

    } catch (error: any) {
      console.error('Error saat generate content dengan Google Gemini:', error);
      // Berikan pesan error yang lebih spesifik untuk debugging
      if (error.message.includes('invalid') || error.message.includes('payload')) {
        throw new Error(`Payload request tidak valid untuk Gemini. Cek format data. Error asli: ${error.message}`);
      }
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

// --- Inisialisasi Provider Default ---
let defaultProvider: AIProvider;

if (process.env.GEMINI_API_KEY) {
  defaultProvider = new GoogleGeminiProvider(process.env.GEMINI_API_KEY);
} else {
  // Fallback jika tidak ada API key
  class FallbackProvider implements AIProvider {
    async generateContent(history: any[], newMessage: string, images: string[] | null, temperature: number, model: string): Promise<any> {
      console.warn('API Key AI tidak ditemukan. Menggunakan fallback provider.');
      return Promise.resolve({ response: "Ini adalah respons fallback karena tidak ada provider AI yang dikonfigurasi." });
    }
  }
  defaultProvider = new FallbackProvider();
}

export const aiAdapter = new AIAdapter(defaultProvider);

// Ekspor fungsi pembantu jika diperlukan di tempat lain
export { buildGeminiPayload };

