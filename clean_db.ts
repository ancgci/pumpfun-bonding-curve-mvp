import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, 'dashboard/db/pnl_history.db');

if (!fs.existsSync(DB_PATH)) {
    console.error("Database file not found at:", DB_PATH);
    process.exit(1);
}

const db = new Database(DB_PATH);

try {
    console.log("Cleaning corrupted simulation trades with 0 or extremely low entry prices...");

    // Delete trades with entry price less than a reasonable minimum (e.g., 1 lamport in SOL = 0.000000001)
    // To be safe, let's delete anything with entry_price < 0.00000001
    const stmt = db.prepare(`DELETE FROM simulated_trades WHERE entry_price < 0.00000001`);
    const info = stmt.run();

    console.log(`✅ Successfully deleted ${info.changes} corrupted simulation trades.`);

    // Also log how many are left
    const count = db.prepare(`SELECT COUNT(*) as count FROM simulated_trades`).get() as { count: number };
    console.log(`📊 Valid simulation trades remaining: ${count.count}`);

} catch (error) {
    console.error("❌ Error cleaning database:", error);
} finally {
    db.close();
}
