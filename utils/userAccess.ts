import db from './db';

export type UserRole = 'ADMIN' | 'USER' | 'SUPPORT';
export type UserStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED';
export type AccessOrigin = 'ALLOWLIST' | 'INVITE' | 'PAYMENT';
export type BillingStatus = 'NOT_REQUIRED' | 'PENDING' | 'PAID' | 'OVERDUE';
export type WalletStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'PENDING_SETUP';

export interface UserRecord {
    id: number;
    email: string;
    name: string | null;
    picture: string | null;
    role: UserRole;
    status: UserStatus;
    accessOrigin: AccessOrigin;
    billingStatus: BillingStatus;
    invitedByUserId: number | null;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface UserWalletRecord {
    id: number;
    userId: number;
    label: string;
    publicKey: string;
    secretRef: string | null;
    status: WalletStatus;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
}

interface RawUserRow {
    id: number;
    email: string;
    name: string | null;
    picture: string | null;
    role: UserRole;
    status: UserStatus;
    accessOrigin: AccessOrigin;
    billingStatus: BillingStatus;
    invitedByUserId: number | null;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface RawWalletRow {
    id: number;
    userId: number;
    label: string;
    publicKey: string;
    secretRef: string | null;
    status: WalletStatus;
    isDefault: number;
    createdAt: string;
    updatedAt: string;
}

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

function mapUserRow(row?: RawUserRow): UserRecord | null {
    if (!row) return null;
    return {
        ...row,
        id: Number(row.id),
        invitedByUserId: row.invitedByUserId ? Number(row.invitedByUserId) : null,
    };
}

function mapWalletRow(row?: RawWalletRow): UserWalletRecord | null {
    if (!row) return null;
    return {
        ...row,
        id: Number(row.id),
        userId: Number(row.userId),
        isDefault: Boolean(row.isDefault),
    };
}

const selectUserColumns = [
    'id',
    'email',
    'name',
    'picture',
    'role',
    'status',
    'access_origin as accessOrigin',
    'billing_status as billingStatus',
    'invited_by_user_id as invitedByUserId',
    'last_login_at as lastLoginAt',
    'created_at as createdAt',
    'updated_at as updatedAt',
].join(', ');

const selectWalletColumns = [
    'id',
    'user_id as userId',
    'label',
    'public_key as publicKey',
    'secret_ref as secretRef',
    'status',
    'is_default as isDefault',
    'created_at as createdAt',
    'updated_at as updatedAt',
].join(', ');

function prefixUserColumns(alias: string) {
    return [
        `${alias}.id as id`,
        `${alias}.email as email`,
        `${alias}.name as name`,
        `${alias}.picture as picture`,
        `${alias}.role as role`,
        `${alias}.status as status`,
        `${alias}.access_origin as accessOrigin`,
        `${alias}.billing_status as billingStatus`,
        `${alias}.invited_by_user_id as invitedByUserId`,
        `${alias}.last_login_at as lastLoginAt`,
        `${alias}.created_at as createdAt`,
        `${alias}.updated_at as updatedAt`,
    ].join(', ');
}

export function getUserByEmail(email: string) {
    const row = db.prepare(`SELECT ${selectUserColumns} FROM users WHERE email = ?`).get(normalizeEmail(email)) as RawUserRow | undefined;
    return mapUserRow(row);
}

export function getUserById(userId: number) {
    const row = db.prepare(`SELECT ${selectUserColumns} FROM users WHERE id = ?`).get(userId) as RawUserRow | undefined;
    return mapUserRow(row);
}

export function ensureBootstrapAdminUser(params: {
    email: string;
    name?: string | null;
    picture?: string | null;
    walletPublicKey?: string | null;
    walletSecretRef?: string | null;
}) {
    const email = normalizeEmail(params.email);
    const displayName = params.name?.trim() || 'Admin';
    const picture = params.picture || null;

    const existing = getUserByEmail(email);

    if (existing) {
        db.prepare(`
            UPDATE users
            SET
                name = ?,
                picture = COALESCE(?, picture),
                role = 'ADMIN',
                status = 'ACTIVE',
                access_origin = 'ALLOWLIST',
                billing_status = 'NOT_REQUIRED',
                updated_at = CURRENT_TIMESTAMP
            WHERE email = ?
        `).run(displayName, picture, email);
    } else {
        db.prepare(`
            INSERT INTO users (
                email,
                name,
                picture,
                role,
                status,
                access_origin,
                billing_status
            ) VALUES (?, ?, ?, 'ADMIN', 'ACTIVE', 'ALLOWLIST', 'NOT_REQUIRED')
        `).run(email, displayName, picture);
    }

    const adminUser = getUserByEmail(email);
    if (!adminUser) {
        throw new Error(`Failed to bootstrap admin user for ${email}`);
    }

    if (params.walletPublicKey) {
        ensureUserWallet({
            userId: adminUser.id,
            publicKey: params.walletPublicKey,
            label: 'Primary Bot Wallet',
            status: 'ACTIVE',
            isDefault: true,
            secretRef: params.walletSecretRef || null,
        });
    }

    return adminUser;
}

export function touchUserLogin(params: {
    email: string;
    name?: string | null;
    picture?: string | null;
}) {
    const email = normalizeEmail(params.email);
    db.prepare(`
        UPDATE users
        SET
            name = ?,
            picture = ?,
            last_login_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE email = ?
    `).run(params.name?.trim() || email.split('@')[0], params.picture || null, email);

    return getUserByEmail(email);
}

export function ensureUserWallet(params: {
    userId: number;
    publicKey: string;
    label?: string;
    status?: WalletStatus;
    isDefault?: boolean;
    secretRef?: string | null;
}) {
    const normalizedPublicKey = params.publicKey.trim();
    const existing = db.prepare(`SELECT ${selectWalletColumns} FROM user_wallets WHERE user_id = ? AND public_key = ?`).get(params.userId, normalizedPublicKey) as RawWalletRow | undefined;
    const tx = db.transaction(() => {
        if (params.isDefault) {
            db.prepare(`
                UPDATE user_wallets
                SET is_default = 0, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `).run(params.userId);
        }

        if (existing) {
            db.prepare(`
                UPDATE user_wallets
                SET
                    label = ?,
                    status = ?,
                    is_default = ?,
                    secret_ref = COALESCE(?, secret_ref),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                params.label || existing.label,
                params.status || existing.status,
                params.isDefault ? 1 : existing.isDefault,
                params.secretRef || null,
                existing.id
            );
            return;
        }

        db.prepare(`
            INSERT INTO user_wallets (
                user_id,
                label,
                public_key,
                secret_ref,
                status,
                is_default
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            params.userId,
            params.label || 'Primary Wallet',
            normalizedPublicKey,
            params.secretRef || null,
            params.status || 'ACTIVE',
            params.isDefault ? 1 : 0
        );
    });

    tx();

    const row = db.prepare(`SELECT ${selectWalletColumns} FROM user_wallets WHERE user_id = ? AND public_key = ?`).get(params.userId, normalizedPublicKey) as RawWalletRow | undefined;
    const wallet = mapWalletRow(row);

    if (!wallet) {
        throw new Error(`Failed to ensure wallet ${normalizedPublicKey} for user ${params.userId}`);
    }

    return wallet;
}

export function listUserWallets(userId: number) {
    const rows = db.prepare(`
        SELECT ${selectWalletColumns}
        FROM user_wallets
        WHERE user_id = ?
        ORDER BY is_default DESC, created_at ASC
    `).all(userId) as RawWalletRow[];

    return rows.map((row) => mapWalletRow(row)).filter(Boolean) as UserWalletRecord[];
}

export function getUserWalletById(userId: number, walletId: number) {
    const row = db.prepare(`
        SELECT ${selectWalletColumns}
        FROM user_wallets
        WHERE user_id = ? AND id = ?
        LIMIT 1
    `).get(userId, walletId) as RawWalletRow | undefined;

    return mapWalletRow(row);
}

export function setUserWalletDefault(userId: number, walletId: number) {
    const wallet = getUserWalletById(userId, walletId);
    if (!wallet) throw new Error('Wallet not found');

    const tx = db.transaction(() => {
        db.prepare(`
            UPDATE user_wallets
            SET is_default = 0, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `).run(userId);

        db.prepare(`
            UPDATE user_wallets
            SET is_default = 1, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND id = ?
        `).run(userId, walletId);
    });

    tx();
    return getUserWalletById(userId, walletId);
}

export function listAllWalletsWithOwners() {
    const rows = db.prepare(`
        SELECT
            uw.id,
            uw.user_id as userId,
            uw.label,
            uw.public_key as publicKey,
            uw.secret_ref as secretRef,
            uw.status,
            uw.is_default as isDefault,
            uw.created_at as createdAt,
            uw.updated_at as updatedAt,
            u.email as ownerEmail,
            u.name as ownerName,
            u.role as ownerRole,
            u.status as ownerStatus
        FROM user_wallets uw
        INNER JOIN users u ON u.id = uw.user_id
        ORDER BY u.role DESC, u.email ASC, uw.is_default DESC, uw.created_at ASC
    `).all() as Array<UserWalletRecord & {
        ownerEmail: string;
        ownerName: string | null;
        ownerRole: UserRole;
        ownerStatus: UserStatus;
    }>;

    return rows.map((row) => ({
        ...row,
        id: Number(row.id),
        userId: Number(row.userId),
        isDefault: Boolean(row.isDefault),
    }));
}

export function listUsersWithWalletCounts() {
    return db.prepare(`
        SELECT
            ${prefixUserColumns('u')},
            COUNT(uw.id) as walletCount
        FROM users u
        LEFT JOIN user_wallets uw ON uw.user_id = u.id
        GROUP BY u.id
        ORDER BY
            CASE u.role
                WHEN 'ADMIN' THEN 0
                WHEN 'SUPPORT' THEN 1
                ELSE 2
            END,
            u.email ASC
    `).all() as Array<RawUserRow & { walletCount: number }>;
}

export function buildClientUser(user: UserRecord) {
    return {
        id: user.id,
        email: user.email,
        name: user.name || user.email.split('@')[0],
        picture: user.picture,
        role: user.role,
        provider: 'google' as const,
        accessOrigin: user.accessOrigin.toLowerCase() as 'allowlist' | 'invite' | 'payment',
        accessStatus: user.status.toLowerCase() as 'active' | 'pending' | 'suspended',
        billingStatus: user.billingStatus === 'NOT_REQUIRED'
            ? 'not-required'
            : user.billingStatus.toLowerCase() as 'pending' | 'paid' | 'overdue',
        plan: user.role === 'ADMIN' ? 'Admin Console Access' : 'Private Dashboard Access',
        invitedBy: user.invitedByUserId ? String(user.invitedByUserId) : null,
        joinedAt: user.createdAt,
    };
}

export function createUser(params: {
    email: string;
    name?: string | null;
    role?: UserRole;
    status?: UserStatus;
    accessOrigin?: AccessOrigin;
    billingStatus?: BillingStatus;
    invitedByUserId?: number | null;
}) {
    const email = normalizeEmail(params.email);
    const existing = getUserByEmail(email);
    if (existing) {
        throw new Error(`Email already registered: ${email}`);
    }

    db.prepare(`
        INSERT INTO users (
            email,
            name,
            picture,
            role,
            status,
            access_origin,
            billing_status,
            invited_by_user_id
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
    `).run(
        email,
        params.name?.trim() || null,
        params.role || 'USER',
        params.status || 'ACTIVE',
        params.accessOrigin || 'ALLOWLIST',
        params.billingStatus || 'NOT_REQUIRED',
        params.invitedByUserId || null
    );

    return getUserByEmail(email);
}

export function updateUserStatus(userId: number, status: UserStatus) {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');
    db.prepare(`UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, userId);
    return getUserById(userId);
}

export function updateUserRole(userId: number, role: UserRole) {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');

    const adminCount = db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'ADMIN'`).get() as { c: number };
    if (user.role === 'ADMIN' && role !== 'ADMIN' && adminCount.c <= 1) {
        throw new Error('Cannot remove the last admin');
    }

    db.prepare(`UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(role, userId);
    return getUserById(userId);
}

export function deleteUser(userId: number) {
    const user = getUserById(userId);
    if (!user) throw new Error('User not found');

    const adminCount = db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'ADMIN'`).get() as { c: number };
    if (user.role === 'ADMIN' && adminCount.c <= 1) {
        throw new Error('Cannot delete the last admin');
    }

    const tx = db.transaction(() => {
        db.prepare(`UPDATE users SET invited_by_user_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE invited_by_user_id = ?`).run(userId);
        db.prepare(`DELETE FROM user_trading_configs WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM user_trades WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM user_positions WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM user_wallets WHERE user_id = ?`).run(userId);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    });

    tx();

    return user;
}
