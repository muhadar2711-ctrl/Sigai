import fs from "fs";
import path from "path";
import { systemState } from "./engine.js";

const MEMORY_FILE = path.join(process.cwd(), "data", "ai_memory.json");

export interface AIMemory {
  project_rules: string[];
  code_style: string[];
  past_decisions: string[];
  user_preferences: string[];
  trade_journal: any[];
  signal_journal: any[];
  market_context: string[];
  knowledge_notes: string[];
}

export class MemoryManager {
  private memory: AIMemory = {
    project_rules: [],
    code_style: [],
    past_decisions: [],
    user_preferences: [],
    trade_journal: [],
    signal_journal: [],
    market_context: [],
    knowledge_notes: [],
  };

  constructor() {
    this.loadMemory();
  }

  loadMemory() {
    try {
      const dataDir = path.dirname(MEMORY_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(MEMORY_FILE)) {
        const rawData = fs.readFileSync(MEMORY_FILE, "utf-8");
        if (!rawData || rawData.trim() === "") {
          fs.writeFileSync(
            MEMORY_FILE,
            JSON.stringify(this.memory, null, 2),
            "utf-8",
          );
        } else {
          try {
            const parsed = JSON.parse(rawData);
            this.memory = { ...this.memory, ...parsed }; // ensure arrays exist
          } catch (parseErr) {
            console.error(
              "[MemoryManager] Invalid JSON in memory file, auto-healing...",
            );
            fs.writeFileSync(
              MEMORY_FILE,
              JSON.stringify(this.memory, null, 2),
              "utf-8",
            );
          }
        }
      } else {
        fs.writeFileSync(
          MEMORY_FILE,
          JSON.stringify(this.memory, null, 2),
          "utf-8",
        );
      }
    } catch (err) {
      console.error("[MemoryManager] Error loading memory:", err);
    }
  }

  getMemory<K extends keyof AIMemory>(type: K): AIMemory[K] {
    return this.memory[type] || [];
  }

  getAllMemory(): AIMemory {
    return this.memory;
  }

  saveMemory<K extends keyof AIMemory>(type: K, data: any) {
    if (!this.memory[type]) this.memory[type] = [] as any;
    this.memory[type].push(data);
    try {
      fs.writeFileSync(
        MEMORY_FILE,
        JSON.stringify(this.memory, null, 2),
        "utf-8",
      );
    } catch (err) {
      console.error("[MemoryManager] Error saving memory:", err);
    }
  }

  findSimilarTrades(bias: string, limit: number = 5): any[] {
    if (!this.memory.trade_journal) return [];
    // filter recent trades that match the bias
    const trades = this.memory.trade_journal
      .filter(
        (t) => t.bias && t.bias.toUpperCase() === (bias || "").toUpperCase(),
      )
      .slice(-limit);
    return trades;
  }

  buildMemoryContext(bias?: string): string {
    let context = "HISTORICAL MEMORY CONTEXT:\n";

    const recentSignals = systemState.signalsHistory.slice(0, 15);

    if (recentSignals.length === 0) {
      return context + "- Belum ada histori trade live scanner.\n";
    }

    const winList = recentSignals.filter((t: any) =>
      ["WIN", "TP1 HIT", "TP2 HIT", "TP3 HIT"].includes(t.result),
    );
    const lossList = recentSignals.filter((t: any) => t.result === "LOSS");
    const beList = recentSignals.filter((t: any) => t.result === "BREAKEVEN");
    const winCount = winList.length;
    const lossCount = lossList.length;

    context += `- Dari ${recentSignals.length} signal scanner terakhir: ${winCount} WIN (termasuk TP1/TP2), ${lossCount} LOSS, ${beList.length} BE.\n`;

    if (bias) {
      // filter bias matching the passed bias string
      const similar = recentSignals
        .filter(
          (t: any) =>
            (t.bias || "").toUpperCase() === bias.toUpperCase() &&
            t.result !== "PENDING",
        )
        .slice(0, 3);
      if (similar.length > 0) {
        context += `- Setup ${bias} terakhir yg di scan:\n`;
        similar.forEach((t: any, i: number) => {
          context += `   [Scan ${i + 1}] Action: ${t.type}, Outcome: ${t.result}, Filter AI: ${t.ai_verdict}\n`;
        });
      }
    }

    return context;
  }
}

export const memoryManager = new MemoryManager();
