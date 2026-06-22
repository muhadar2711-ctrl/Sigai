import { GoogleGenerativeAI, Content, Part, Tool } from '@google/generative-ai';
import { promises as fs } from 'fs';
import path from 'path';

// Interfaces
export interface TradeSignal {
  action: 'BUY' | 'SELL';
  symbol: string;
  stopLoss: number;
  takeProfit: number;
  risk: number; 
}

export interface AIProvider {
  generateContent(history: any[], newMessage: string, image: string | null, temperature: number, model: string): Promise<any>;
}

// --- Tool Definitions ---
const tradeSignalTool: Tool = {
  functionDeclarations: [
    {
      name: 'execute_trade_signal',
      description: 'Executes a trade signal for BUY or SELL actions.',
      parameters: {
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING', description: "The trade action, either 'BUY' or 'SELL'." },
          symbol: { type: 'STRING', description: "The financial instrument symbol, e.g., 'XAUUSD'." },
          stopLoss: { type: 'NUMBER', description: 'The price at which to close the position at a loss.' },
          takeProfit: { type: 'NUMBER', description: 'The price at which to close the position at a profit.' },
          risk: { type: 'NUMBER', description: 'The percentage of account balance to risk.' },
        },
        required: ['action', 'symbol', 'stopLoss', 'takeProfit', 'risk'],
      },
    },
  ],
};

// --- Gemini Provider ---

const transformToGoogleMessages = (history: any[], newMessage: string, image: string | null): Content[] => {
  const googleHistory: Content[] = history.map((msg) => {
    const role = msg.role === 'user' ? 'user' : 'model';
    
    // Handle cases where content is a simple string or a structured object
    if (typeof msg.content === 'string') {
      return { role, parts: [{ text: msg.content }] };
    } else if (Array.isArray(msg.content)) { // OpenAI-style content array
      const parts: Part[] = msg.content.map((item: any) => {
        if (item.type === 'text') {
          return { text: item.text };
        }
        if (item.type === 'image_url' && item.image_url?.url) {
            const [header, data] = item.image_url.url.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
            return {
                inlineData: {
                    mimeType,
                    data,
                },
            };
        }
        return { text: '' }; // Should not happen with valid inputs
      }).filter(part => part.text !== '');
      return { role, parts };
    }
    return { role, parts: [{ text: '' }] }; // Fallback for unexpected format
  });

  // Add the new user message
  const newParts: Part[] = [{ text: newMessage }];
  if (image) {
    const [header, data] = image.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
    newParts.push({ inlineData: { mimeType, data } });
  }
  googleHistory.push({ role: 'user', parts: newParts });

  return googleHistory;
};


class GoogleGeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async generateContent(history: any[], newMessage: string, image: string | null, temperature: number, modelName: string): Promise<any> {
    try {
      const model = this.genAI.getGenerativeModel({ model: modelName, tools: [tradeSignalTool] });
      
      const chatHistory = transformToGoogleMessages(history, newMessage, image);
      
      const result = await model.generateContentStream({ 
        contents: chatHistory,
        generationConfig: {
          temperature,
        }
      });

      // For simplicity, we will aggregate the streamed response here.
      // A production implementation should stream this back to the client.
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
        return { tool_calls: toolCalls };
      }

      return { response: aggregatedResponse };

    } catch (error: any) {
      console.error('Error generating content with Google Gemini:', error);
      // Check for specific proto-related errors if possible
      if (error.message.includes('Request payload is invalid')) {
        throw new Error(`Invalid request payload for Gemini. Check data format. Original Error: ${error.message}`);
      }
      throw new Error(`Gemini API Error: ${error.message}`);
    }
  }
}

// --- AI Adapter ---

class AIAdapter {
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  async generateContent(history: any[], newMessage: string, image: string | null, temperature: number, model: string) {
    return this.provider.generateContent(history, newMessage, image, temperature, model);
  }
}

let defaultProvider: AIProvider;

if (process.env.GEMINI_API_KEY) {
  defaultProvider = new GoogleGeminiProvider(process.env.GEMINI_API_KEY);
} else {
  // Fallback provider if no API key is present
  class FallbackProvider implements AIProvider {
    async generateContent(history: any[], newMessage: string, image: string | null, temperature: number, model: string): Promise<any> {
      console.warn('No AI provider API key found. Using fallback provider.');
      return Promise.resolve({ response: "This is a fallback response as no AI provider is configured." });
    }
  }
  defaultProvider = new FallbackProvider();
}

export const aiAdapter = new AIAdapter(defaultProvider);
