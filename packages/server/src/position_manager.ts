import fs from "fs";
import path from "path";

const POSITIONS_FILE = path.join(process.cwd(), "data", "positions.json");

export interface ActivePosition {
  id: string; // generated signal ID
  symbol: string;
  type: string; // 'BUY' | 'SELL'
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rrRatio: number;
  createdAt: string;
  lastUpdateAt: string;
  status: string; // PENDING, ACTIVE, TP1_HIT, BREAKEVEN, TP2_HIT, TP3_HIT, SL_HIT, INVALIDATED, EXPIRED, CLOSED
  lastPrice?: number;
  runningPips?: number;
  result?: string;
  ticketId?: string; // MT5/Execution system ticket ID
  [key: string]: any;
}

export class PositionManager {
  private activeSignals: ActivePosition[] = [];

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const dir = path.dirname(POSITIONS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(POSITIONS_FILE)) {
        const raw = fs.readFileSync(POSITIONS_FILE, "utf-8");
        if (!raw || raw.trim() === "") {
          fs.writeFileSync(
            POSITIONS_FILE,
            JSON.stringify(this.activeSignals, null, 2),
          );
        } else {
          try {
            this.activeSignals = JSON.parse(raw);
            if (!Array.isArray(this.activeSignals)) this.activeSignals = [];
            console.log(
              `[PositionManager] Recovered ${this.activeSignals.length} active positions.`,
            );
          } catch (parseErr) {
            console.error(
              "[PositionManager] Invalid JSON in positions file, auto-healing...",
            );
            this.activeSignals = [];
            fs.writeFileSync(
              POSITIONS_FILE,
              JSON.stringify(this.activeSignals, null, 2),
            );
          }
        }
      } else {
        fs.writeFileSync(
          POSITIONS_FILE,
          JSON.stringify(this.activeSignals, null, 2),
        );
      }
    } catch (err: any) {
      console.error("[PositionManager] Load state error:", err.message);
    }
  }

  private saveState() {
    try {
      fs.writeFileSync(
        POSITIONS_FILE,
        JSON.stringify(this.activeSignals, null, 2),
      );
    } catch (err: any) {
      console.error("[PositionManager] Save state error:", err.message);
    }
  }

  public getActiveSignals(): ActivePosition[] {
    // Return a copy to prevent unintended mutations
    return [...this.activeSignals];
  }

  public getPositionById(id: string): ActivePosition | undefined {
    return this.activeSignals.find((p) => p.id === id);
  }

  public getPositionBySymbol(symbol: string): ActivePosition | undefined {
    // To prevent duplicate signals for the same symbol
    return this.activeSignals.find((p) => p.symbol === symbol);
  }

  public registerSignal(signal: ActivePosition) {
    const existing = this.getPositionBySymbol(signal.symbol);
    if (existing) {
      console.log(
        `[PositionManager] Duplicate signal block: Active position already exists for ${signal.symbol}.`,
      );
      return false; // Prevent adding
    }
    this.activeSignals.push(signal);
    this.saveState();
    return true;
  }

  public updatePosition(id: string, updates: Partial<ActivePosition>) {
    const idx = this.activeSignals.findIndex((p) => p.id === id);
    if (idx !== -1) {
      this.activeSignals[idx] = {
        ...this.activeSignals[idx],
        ...updates,
        lastUpdateAt: new Date().toISOString(),
      };
      this.saveState();
      return this.activeSignals[idx];
    }
    return null;
  }

  public removePosition(id: string) {
    this.activeSignals = this.activeSignals.filter((p) => p.id !== id);
    this.saveState();
  }
}

export const activePositionManager = new PositionManager();
