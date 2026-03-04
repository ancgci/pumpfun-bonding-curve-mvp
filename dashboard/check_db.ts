import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, 'db', 'pnl_history.db');
try {
    const db = new Database(dbPath);
    const rows = db.prepare('SELECT * FROM pnl_history LIMIT 5').all();
    console.log('--- PnL History Rows ---');
    console.log(JSON.stringify(rows, null, 2));
    const count = db.prepare('SELECT COUNT(*) as total FROM pnl_history').get();
    console.log('Total points:', count);
} catch (e) {
    console.error('Error reading DB:', e);
}
