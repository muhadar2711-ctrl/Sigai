import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// Use verbose mode for more detailed logs
const sqlite = sqlite3.verbose();

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'trading.db');

// Initialize the database connection
// The database object will be exported and used by other modules
export const db = new sqlite.Database(dbPath, (err) => {
  if (err) {
    console.error('[DB] Error connecting to database:', err.message);
  } else {
    console.log('[DB] Successfully connected to the SQLite database.');
    // After connecting, set PRAGMAs and initialize tables
    setupDatabase();
  }
});

function setupDatabase() {
  db.serialize(() => {
    // Prevent Database Locked errors / Concurrency issues
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA busy_timeout = 5000'); // Wait up to 5 seconds if locked

    // Initialize tables
    initDB();
  });
}

// Initialize tables
export function initDB() {
  const createTablesSQL = `
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
  `;
  
  db.exec(createTablesSQL, (err) => {
    if (err) {
      console.error('[DB] Error creating tables:', err.message);
    } else {
      console.log('[DB] Tables initialized successfully.');
    }
  });
}
