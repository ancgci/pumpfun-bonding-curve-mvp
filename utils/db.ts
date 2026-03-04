import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database path relative to the project root
const DB_DIR = path.join(__dirname, '../dashboard/db');
const DB_PATH = path.join(DB_DIR, 'pnl_history.db');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);

// Initialize tables
db.exec(`
    CREATE TABLE IF NOT EXISTS pnl_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        pnl_sol REAL NOT NULL,
        positions_count INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS simulated_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_mint TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        entry_time INTEGER NOT NULL,
        entry_price REAL NOT NULL,
        exit_time INTEGER,
        exit_price REAL,
        pnl_sol REAL DEFAULT 0,
        pnl_percent REAL DEFAULT 0,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sim_trades_mint ON simulated_trades(token_mint);
    CREATE INDEX IF NOT EXISTS idx_sim_trades_status ON simulated_trades(status);
`);

export default db;
