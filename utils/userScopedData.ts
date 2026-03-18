import db from './db';
import { listUserWallets } from './userAccess';

function normalizeWalletId(walletId?: number | null) {
    return Number.isFinite(walletId) && Number(walletId) > 0 ? Number(walletId) : 0;
}

function safeJsonParse<T = any>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function toNumber(value: any, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toTimestamp(value: any) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : Date.now();
}

function derivePositionKey(position: any, idx: number) {
    if (position.positionKey) return String(position.positionKey);
    if (position.id) return String(position.id);
    const mint = position.mint || position.tokenMint || position.token_mint || 'unknown-mint';
    const ts = position.buyTimestamp || position.entryTime || position.timestamp || idx;
    return `${mint}:${ts}`;
}

function deriveTradeKey(trade: any, idx: number) {
    if (trade.tradeKey) return String(trade.tradeKey);
    if (trade.id) return String(trade.id);
    if (trade.signature) return String(trade.signature);
    const mint = trade.mint || trade.tokenMint || trade.token_mint || 'unknown-mint';
    const ts = trade.exitTime || trade.entryTime || trade.timestamp || idx;
    return `${mint}:${ts}`;
}

export function resolvePrimaryWalletId(userId: number) {
    const wallets = listUserWallets(userId);
    if (!wallets.length) return 0;
    const preferred = wallets.find((wallet) => wallet.isDefault) || wallets[0];
    return preferred ? preferred.id : 0;
}

export function replaceScopedPositions(params: {
    userId: number;
    walletId?: number | null;
    positions: any[];
}) {
    const walletId = normalizeWalletId(params.walletId);
    const positions = Array.isArray(params.positions) ? params.positions : [];

    const deleteStmt = db.prepare(`
        DELETE FROM user_positions
        WHERE user_id = ? AND wallet_id = ?
    `);

    const insertStmt = db.prepare(`
        INSERT INTO user_positions (
            user_id,
            wallet_id,
            position_key,
            mint,
            symbol,
            buy_sol_amount,
            buy_timestamp,
            is_active,
            data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
        deleteStmt.run(params.userId, walletId);

        positions.forEach((position, idx) => {
            const positionKey = derivePositionKey(position, idx);
            const mint = String(position.mint || position.tokenMint || position.token_mint || '');
            const symbol = String(position.symbol || position.tokenSymbol || position.token_symbol || '');
            const buySolAmount = toNumber(
                position.buySolAmount ?? position.buyAmountSol ?? position.entryAmount ?? position.amount,
                0
            );
            const buyTimestamp = toTimestamp(position.buyTimestamp ?? position.entryTime ?? position.timestamp);
            const isActive = position.isActive === false ? 0 : 1;
            const dataJson = JSON.stringify(position || {});

            insertStmt.run(
                params.userId,
                walletId,
                positionKey,
                mint,
                symbol,
                buySolAmount,
                buyTimestamp,
                isActive,
                dataJson
            );
        });
    });

    tx();
}

export function replaceScopedTrades(params: {
    userId: number;
    walletId?: number | null;
    trades: any[];
}) {
    const walletId = normalizeWalletId(params.walletId);
    const trades = Array.isArray(params.trades) ? params.trades : [];

    const deleteStmt = db.prepare(`
        DELETE FROM user_trades
        WHERE user_id = ? AND wallet_id = ?
    `);

    const insertStmt = db.prepare(`
        INSERT INTO user_trades (
            user_id,
            wallet_id,
            trade_key,
            mint,
            symbol,
            side,
            status,
            pnl_sol,
            event_timestamp,
            data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
        deleteStmt.run(params.userId, walletId);

        trades.forEach((trade, idx) => {
            const tradeKey = deriveTradeKey(trade, idx);
            const mint = String(trade.mint || trade.tokenMint || trade.token_mint || '');
            const symbol = String(trade.symbol || trade.tokenSymbol || trade.token_symbol || '');
            const side = String(trade.side || '').toUpperCase();
            const status = String(trade.status || '');
            const pnlSol = toNumber(trade.pnl ?? trade.pnl_sol, 0);
            const eventTimestamp = toTimestamp(trade.exitTime ?? trade.entryTime ?? trade.timestamp);
            const dataJson = JSON.stringify(trade || {});

            insertStmt.run(
                params.userId,
                walletId,
                tradeKey,
                mint,
                symbol,
                side,
                status,
                pnlSol,
                eventTimestamp,
                dataJson
            );
        });
    });

    tx();
}

export function upsertScopedTradingConfig(params: {
    userId: number;
    walletId?: number | null;
    config: Record<string, any>;
}) {
    const walletId = normalizeWalletId(params.walletId);
    const configJson = JSON.stringify(params.config || {});

    db.prepare(`
        INSERT INTO user_trading_configs (
            user_id,
            wallet_id,
            config_json
        ) VALUES (?, ?, ?)
        ON CONFLICT(user_id, wallet_id)
        DO UPDATE SET
            config_json = excluded.config_json,
            updated_at = CURRENT_TIMESTAMP
    `).run(params.userId, walletId, configJson);
}

export function getScopedPositions(params: {
    userId: number;
    walletId?: number | null;
    activeOnly?: boolean;
}) {
    const walletId = normalizeWalletId(params.walletId);
    const activeOnly = params.activeOnly === true;
    const rows = db.prepare(`
        SELECT
            data_json as dataJson,
            is_active as isActive
        FROM user_positions
        WHERE user_id = ? AND wallet_id = ?
        ${activeOnly ? 'AND is_active = 1' : ''}
        ORDER BY buy_timestamp DESC, id DESC
    `).all(params.userId, walletId) as Array<{ dataJson: string; isActive: number }>;

    return rows.map((row) => {
        const parsed = safeJsonParse<any>(row.dataJson, {});
        return {
            ...parsed,
            isActive: Boolean(row.isActive),
        };
    });
}

export function getScopedTrades(params: {
    userId: number;
    walletId?: number | null;
    limit?: number;
}) {
    const walletId = normalizeWalletId(params.walletId);
    const limit = Math.max(1, Math.min(500, Number(params.limit || 50)));
    const rows = db.prepare(`
        SELECT data_json as dataJson
        FROM user_trades
        WHERE user_id = ? AND wallet_id = ?
        ORDER BY event_timestamp DESC, id DESC
        LIMIT ?
    `).all(params.userId, walletId, limit) as Array<{ dataJson: string }>;

    return rows.map((row) => safeJsonParse<any>(row.dataJson, {}));
}

export function getScopedTradingConfig(params: {
    userId: number;
    walletId?: number | null;
}) {
    const walletId = normalizeWalletId(params.walletId);
    const row = db.prepare(`
        SELECT config_json as configJson
        FROM user_trading_configs
        WHERE user_id = ? AND wallet_id = ?
        LIMIT 1
    `).get(params.userId, walletId) as { configJson: string } | undefined;

    if (!row) return null;
    return safeJsonParse<Record<string, any>>(row.configJson, {});
}
