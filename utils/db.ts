import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const defaultDbPath = process.env.NODE_ENV === 'test'
    ? path.join('/tmp', 'pumpfun-pnl_history.test.db')
    : path.join(__dirname, '../dashboard-api/db', 'pnl_history.db');
const DB_PATH = process.env.SQLITE_DB_PATH || defaultDbPath;
const DB_DIR = path.dirname(DB_PATH);

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
        entry_amount REAL DEFAULT 0.01,
        exit_time INTEGER,
        exit_price REAL,
        pnl_sol REAL DEFAULT 0,
        pnl_percent REAL DEFAULT 0,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        token_holders INTEGER,
        market_cap_entry REAL,
        market_cap_exit REAL,
        decision_context TEXT,
        entry_snapshot TEXT,
        exit_snapshot TEXT,
        monitoring_trace TEXT,
        entry_feed_audit TEXT,
        exit_feed_audit TEXT,
        anomaly_flag INTEGER DEFAULT 0,
        anomaly_reason TEXT,
        anomaly_context TEXT,
        exit_type TEXT,
        net_sell_value REAL,
        net_ata_close_value REAL,
        decision_reason TEXT,
        realized_exit_value_sol REAL,
        postmortem_status TEXT DEFAULT 'PENDING',
        postmortem_summary TEXT,
        postmortem_report TEXT,
        postmortem_analyzed_at INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        picture TEXT,
        role TEXT NOT NULL DEFAULT 'USER',
        status TEXT NOT NULL DEFAULT 'PENDING',
        access_origin TEXT NOT NULL DEFAULT 'ALLOWLIST',
        billing_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
        invited_by_user_id INTEGER,
        last_login_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(invited_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT 'Primary Wallet',
        public_key TEXT NOT NULL,
        secret_ref TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        is_default INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, public_key),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        wallet_id INTEGER NOT NULL DEFAULT 0,
        position_key TEXT NOT NULL,
        mint TEXT,
        symbol TEXT,
        buy_sol_amount REAL DEFAULT 0,
        buy_timestamp INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1,
        data_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, wallet_id, position_key)
    );

    CREATE TABLE IF NOT EXISTS user_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        wallet_id INTEGER NOT NULL DEFAULT 0,
        trade_key TEXT NOT NULL,
        mint TEXT,
        symbol TEXT,
        side TEXT,
        status TEXT,
        pnl_sol REAL DEFAULT 0,
        event_timestamp INTEGER,
        data_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, wallet_id, trade_key)
    );

    CREATE TABLE IF NOT EXISTS user_trading_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        wallet_id INTEGER NOT NULL DEFAULT 0,
        config_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, wallet_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sim_trades_mint ON simulated_trades(token_mint);
    CREATE INDEX IF NOT EXISTS idx_sim_trades_status ON simulated_trades(status);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_wallets_public_key ON user_wallets(public_key);
    CREATE INDEX IF NOT EXISTS idx_user_positions_scope ON user_positions(user_id, wallet_id);
    CREATE INDEX IF NOT EXISTS idx_user_positions_active ON user_positions(user_id, wallet_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_user_trades_scope ON user_trades(user_id, wallet_id);
    CREATE INDEX IF NOT EXISTS idx_user_trades_event_ts ON user_trades(user_id, wallet_id, event_timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_user_trading_configs_scope ON user_trading_configs(user_id, wallet_id);
`);

// Add entry_amount column if it doesn't exist (migration for existing DBs)
try {
    const tableInfo = db.prepare("PRAGMA table_info(simulated_trades)").all() as any[];
    const hasEntryAmount = tableInfo.some(col => col.name === 'entry_amount');

    if (!hasEntryAmount) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN entry_amount REAL DEFAULT 0.01");
        console.log("Database migration: Added entry_amount to simulated_trades");
    }

    const hasTokenHolders = tableInfo.some(col => col.name === 'token_holders');
    if (!hasTokenHolders) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN token_holders INTEGER");
        console.log("Database migration: Added token_holders to simulated_trades");
    }

    const hasMcapEntry = tableInfo.some(col => col.name === 'market_cap_entry');
    if (!hasMcapEntry) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN market_cap_entry REAL");
        console.log("Database migration: Added market_cap_entry to simulated_trades");
    }

    const hasMcapExit = tableInfo.some(col => col.name === 'market_cap_exit');
    if (!hasMcapExit) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN market_cap_exit REAL");
        console.log("Database migration: Added market_cap_exit to simulated_trades");
    }

    const hasDecisionContext = tableInfo.some(col => col.name === 'decision_context');
    if (!hasDecisionContext) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN decision_context TEXT");
        console.log("Database migration: Added decision_context to simulated_trades");
    }

    const hasEntrySnapshot = tableInfo.some(col => col.name === 'entry_snapshot');
    if (!hasEntrySnapshot) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN entry_snapshot TEXT");
        console.log("Database migration: Added entry_snapshot to simulated_trades");
    }

    const hasExitSnapshot = tableInfo.some(col => col.name === 'exit_snapshot');
    if (!hasExitSnapshot) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN exit_snapshot TEXT");
        console.log("Database migration: Added exit_snapshot to simulated_trades");
    }

    const hasMonitoringTrace = tableInfo.some(col => col.name === 'monitoring_trace');
    if (!hasMonitoringTrace) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN monitoring_trace TEXT");
        console.log("Database migration: Added monitoring_trace to simulated_trades");
    }

    const hasEntryFeedAudit = tableInfo.some(col => col.name === 'entry_feed_audit');
    if (!hasEntryFeedAudit) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN entry_feed_audit TEXT");
        console.log("Database migration: Added entry_feed_audit to simulated_trades");
    }

    const hasExitFeedAudit = tableInfo.some(col => col.name === 'exit_feed_audit');
    if (!hasExitFeedAudit) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN exit_feed_audit TEXT");
        console.log("Database migration: Added exit_feed_audit to simulated_trades");
    }

    const hasAnomalyFlag = tableInfo.some(col => col.name === 'anomaly_flag');
    if (!hasAnomalyFlag) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN anomaly_flag INTEGER DEFAULT 0");
        console.log("Database migration: Added anomaly_flag to simulated_trades");
    }

    const hasAnomalyReason = tableInfo.some(col => col.name === 'anomaly_reason');
    if (!hasAnomalyReason) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN anomaly_reason TEXT");
        console.log("Database migration: Added anomaly_reason to simulated_trades");
    }

    const hasAnomalyContext = tableInfo.some(col => col.name === 'anomaly_context');
    if (!hasAnomalyContext) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN anomaly_context TEXT");
        console.log("Database migration: Added anomaly_context to simulated_trades");
    }

    const hasExitType = tableInfo.some(col => col.name === 'exit_type');
    if (!hasExitType) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN exit_type TEXT");
        console.log("Database migration: Added exit_type to simulated_trades");
    }

    const hasNetSellValue = tableInfo.some(col => col.name === 'net_sell_value');
    if (!hasNetSellValue) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN net_sell_value REAL");
        console.log("Database migration: Added net_sell_value to simulated_trades");
    }

    const hasNetAtaCloseValue = tableInfo.some(col => col.name === 'net_ata_close_value');
    if (!hasNetAtaCloseValue) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN net_ata_close_value REAL");
        console.log("Database migration: Added net_ata_close_value to simulated_trades");
    }

    const hasDecisionReason = tableInfo.some(col => col.name === 'decision_reason');
    if (!hasDecisionReason) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN decision_reason TEXT");
        console.log("Database migration: Added decision_reason to simulated_trades");
    }

    const hasRealizedExitValueSol = tableInfo.some(col => col.name === 'realized_exit_value_sol');
    if (!hasRealizedExitValueSol) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN realized_exit_value_sol REAL");
        console.log("Database migration: Added realized_exit_value_sol to simulated_trades");
    }

    const hasPostMortemStatus = tableInfo.some(col => col.name === 'postmortem_status');
    if (!hasPostMortemStatus) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN postmortem_status TEXT DEFAULT 'PENDING'");
        console.log("Database migration: Added postmortem_status to simulated_trades");
    }

    const hasPostMortemSummary = tableInfo.some(col => col.name === 'postmortem_summary');
    if (!hasPostMortemSummary) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN postmortem_summary TEXT");
        console.log("Database migration: Added postmortem_summary to simulated_trades");
    }

    const hasPostMortemReport = tableInfo.some(col => col.name === 'postmortem_report');
    if (!hasPostMortemReport) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN postmortem_report TEXT");
        console.log("Database migration: Added postmortem_report to simulated_trades");
    }

    const hasPostMortemAnalyzedAt = tableInfo.some(col => col.name === 'postmortem_analyzed_at');
    if (!hasPostMortemAnalyzedAt) {
        db.exec("ALTER TABLE simulated_trades ADD COLUMN postmortem_analyzed_at INTEGER");
        console.log("Database migration: Added postmortem_analyzed_at to simulated_trades");
    }
} catch (e) {
    console.error("Error checking/running database migrations:", e);
}

export default db;
