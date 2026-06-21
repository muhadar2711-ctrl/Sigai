import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(path.join(dataDir, "trading.db"));

// Prevent Database Locked errors / Concurrency issues
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000'); // Wait up to 5 seconds if locked

// Initialize tables
export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      symbol TEXT,
      type TEXT,
      entry REAL,
      sl REAL,
      tp1 REAL,
      tp2 REAL,
      tp3 REAL,
      status TEXT,
      confidence REAL,
      strategy TEXT,
      timestamp TEXT,
      ai_verdict TEXT,
      ai_reason TEXT,
      currentPips REAL,
      peakPips REAL,
      rrRatio REAL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT,
      content TEXT,
      timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS system_config (
      id TEXT PRIMARY KEY,
      config_json TEXT
    );
  `);
}
