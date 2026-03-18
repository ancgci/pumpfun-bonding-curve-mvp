import dotenv from "dotenv";
dotenv.config({ path: require("path").resolve(__dirname, "../.env") });

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { getRecentPostMortemTrades, getSimulationMetrics, isSimulationReadyForLive } from "../utils/simulationEngine";
import { CONFIG } from "../utils/config";
import http from "http";
import { Server } from "socket.io";
import db from "../utils/db";
import cookieParser from "cookie-parser";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
    buildClientUser,
    ensureBootstrapAdminUser,
    getUserByEmail,
    getUserById,
    listAllWalletsWithOwners,
    listUserWallets,
    listUsersWithWalletCounts,
    touchUserLogin,
    createUser,
    updateUserStatus,
    updateUserRole,
} from "../utils/userAccess";
import {
    getScopedPositions,
    getScopedTrades,
    getScopedTradingConfig,
    replaceScopedPositions,
    replaceScopedTrades,
    resolvePrimaryWalletId,
    upsertScopedTradingConfig,
} from "../utils/userScopedData";

// ── Auth Config ──────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL || "sr.antoniocarlos@gmail.com";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5174";
const BOT_WALLET_FILE = path.join(__dirname, "../bot-wallet.json");
const WALLET_ADDRESS_ENV = process.env.WALLET_PUBLIC_ADDRESS || process.env.WALLET_ADDRESS || null;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const connection = new Connection(CONFIG.RPC_URL, "confirmed");

function signAccessToken(payload: object) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}
function signRefreshToken(payload: object) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function loadBotWallet() {
    try {
        if (!fs.existsSync(BOT_WALLET_FILE)) return null;
        const raw = JSON.parse(fs.readFileSync(BOT_WALLET_FILE, "utf-8"));
        const secretKey = Uint8Array.from(raw);
        const kp = Keypair.fromSecretKey(secretKey);
        return { publicKey: kp.publicKey.toBase58(), secretKey };
    } catch (err) {
        console.error("Erro ao carregar bot-wallet.json", err);
        return null;
    }
}

function loadSimTradesFallback(limit: number) {
    try {
        const file = path.join(__dirname, "../data/simulation/trades.json");
        if (!fs.existsSync(file)) return [];
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        return Array.isArray(raw) ? raw.slice(0, limit) : [];
    } catch (e) {
        console.error("Erro ao carregar trades de simulação (fallback JSON)", e);
        return [];
    }
}

function getBootstrapWalletAddress() {
    return WALLET_ADDRESS_ENV || loadBotWallet()?.publicKey || null;
}

function syncBootstrapAdminUser(profile?: { name?: string | null; picture?: string | null }) {
    return ensureBootstrapAdminUser({
        email: ALLOWED_EMAIL,
        name: profile?.name || "Admin",
        picture: profile?.picture || null,
        walletPublicKey: getBootstrapWalletAddress(),
    });
}

function buildAuthSession(userRecord: ReturnType<typeof syncBootstrapAdminUser>) {
    const user = buildClientUser(userRecord);
    const tokenPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture || null,
        role: user.role,
        accessStatus: user.accessStatus,
        accessOrigin: user.accessOrigin,
        billingStatus: user.billingStatus,
    };

    return {
        user,
        accessToken: signAccessToken(tokenPayload),
        refreshToken: signRefreshToken(tokenPayload),
    };
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 1000): Promise<T> {
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i < attempts - 1) {
                const delay = baseDelayMs * Math.pow(2, i) + Math.random() * 100;
                console.warn(`Attempt ${i + 1} failed. Retrying in ${delay.toFixed(0)}ms...`, error);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
    // This line should theoretically not be reached if attempts > 0
    // but TypeScript needs a return here.
    throw new Error("withRetry failed after all attempts.");
}

function setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
    });
}

function resolveUserFromTokenPayload(decoded: any) {
    const userId = Number(decoded?.userId || decoded?.id || 0);
    let user = userId ? getUserById(userId) : null;
    const email = typeof decoded?.email === "string" ? decoded.email.trim().toLowerCase() : null;

    if (!user && email) {
        if (email === ALLOWED_EMAIL.trim().toLowerCase()) {
            syncBootstrapAdminUser({ name: decoded?.name, picture: decoded?.picture });
        }
        user = getUserByEmail(email);
    }

    return user;
}

function getRequestUser(req: Request) {
    const decoded = (req as any).user;
    if (!decoded) return null;
    return resolveUserFromTokenPayload(decoded);
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const user = getRequestUser(req);
    if (!user) {
        return res.status(401).json({ error: "Account not found" });
    }
    if (user.role !== "ADMIN") {
        return res.status(403).json({ error: "Admin access required" });
    }
    (req as any).dbUser = user;
    next();
}

const LEGACY_SCOPE_SYNC_INTERVAL_MS = 5000;
const legacyScopeLastSync = new Map<string, number>();

function getScopedRequestContext(req: Request) {
    const user = getRequestUser(req);
    if (!user) return null;
    const wallets = listUserWallets(user.id);
    const defaultWallet = wallets.find((wallet) => wallet.isDefault) || wallets[0] || null;
    const walletId = defaultWallet?.id || resolvePrimaryWalletId(user.id) || 0;
    return {
        user,
        walletId,
        wallet: defaultWallet,
    };
}

function shouldSyncLegacyScope(context: { user: any; wallet: any | null }) {
    if (!context.wallet) return false;
    const bootstrapWalletAddress = getBootstrapWalletAddress();
    if (!bootstrapWalletAddress) return false;
    return context.wallet.publicKey === bootstrapWalletAddress;
}

function syncLegacyScopeDataIfNeeded(context: { user: any; walletId: number; wallet: any | null }) {
    if (!shouldSyncLegacyScope(context)) return;

    const scopeKey = `${context.user.id}:${context.walletId}`;
    const now = Date.now();
    const lastSyncAt = legacyScopeLastSync.get(scopeKey) || 0;
    if (now - lastSyncAt < LEGACY_SCOPE_SYNC_INTERVAL_MS) return;
    legacyScopeLastSync.set(scopeKey, now);

    try {
        replaceScopedPositions({
            userId: context.user.id,
            walletId: context.walletId,
            positions: loadPositions(),
        });

        replaceScopedTrades({
            userId: context.user.id,
            walletId: context.walletId,
            trades: loadAgentTrades(),
        });

        const configFromFile = fs.existsSync(TRADING_CONFIG_FILE)
            ? JSON.parse(fs.readFileSync(TRADING_CONFIG_FILE, "utf-8"))
            : {};
        upsertScopedTradingConfig({
            userId: context.user.id,
            walletId: context.walletId,
            config: configFromFile,
        });
    } catch (error) {
        console.error("Failed to sync legacy scope data:", error);
    }
}

syncBootstrapAdminUser();

// ── Auth Middleware ───────────────────────────────────────────
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        (req as any).user = decoded;
        next();
    } catch {
        return res.status(401).json({ error: "Token expired or invalid" });
    }
}

export const app = express();
const httpServer = http.createServer(app);
const PORT = 3001;
const BIND_HOST = process.env.API_BIND_HOST || "127.0.0.1";

const io = new Server(httpServer, {
    cors: { origin: [FRONTEND_ORIGIN, "http://meu.listadecompras.shop", "https://meu.listadecompras.shop", "http://localhost:5174", "http://localhost:3001"], credentials: true }
});

// ── Custom CORS Middleware ────────────────────────────────────
const ALLOWED_ORIGINS = [
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://meu.listadecompras.shop",
    "https://meu.listadecompras.shop",
    FRONTEND_ORIGIN,
];

app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
    } else if (!origin) {
        // Same-origin requests (served from the same server) have no origin header
        res.header("Access-Control-Allow-Origin", "*");
    } else {
        res.header("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    }

    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

    // Preflight request
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }
    next();
});

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
// ── Serve dashboard-new built files (React SPA) ──────────────
const DASHBOARD_DIST = path.join(__dirname, "../dashboard/dist");
app.use(express.static(DASHBOARD_DIST));

// ── Rate limit on auth routes ─────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 20,
    message: { error: "Too many login attempts. Try again later." },
});

// ── Auth Routes ───────────────────────────────────────────────

// POST /api/auth/google — validate Google ID token, return JWT + set refresh cookie
app.post("/api/auth/google", authLimiter, async (req: Request, res: Response) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Missing credential" });
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload?.email) return res.status(401).json({ error: "Invalid token" });
        const normalizedEmail = payload.email.trim().toLowerCase();

        if (normalizedEmail === ALLOWED_EMAIL.trim().toLowerCase()) {
            syncBootstrapAdminUser({ name: payload.name, picture: payload.picture });
        }

        const existingUser = getUserByEmail(normalizedEmail);
        if (!existingUser) {
            return res.status(403).json({ error: `Email not authorized: ${payload.email}` });
        }
        if (existingUser.status !== "ACTIVE") {
            return res.status(403).json({ error: `Account is ${existingUser.status.toLowerCase()}` });
        }

        const updatedUser = touchUserLogin({
            email: normalizedEmail,
            name: payload.name,
            picture: payload.picture,
        });

        if (!updatedUser) {
            return res.status(500).json({ error: "Failed to update account session" });
        }

        const session = buildAuthSession(updatedUser);
        setRefreshCookie(res, session.refreshToken);

        return res.json({ accessToken: session.accessToken, user: session.user });
    } catch (err: any) {
        return res.status(401).json({ error: err.message || "Authentication failed" });
    }
});

// POST /api/auth/refresh — issue new access token from httpOnly cookie
app.post("/api/auth/refresh", (req: Request, res: Response) => {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: "No refresh token" });
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const user = resolveUserFromTokenPayload(decoded);
        if (!user) return res.status(401).json({ error: "Account not found" });
        if (user.status !== "ACTIVE") {
            return res.status(403).json({ error: `Account is ${user.status.toLowerCase()}` });
        }

        const session = buildAuthSession(user);
        setRefreshCookie(res, session.refreshToken);
        return res.json({ accessToken: session.accessToken, user: session.user });
    } catch {
        return res.status(401).json({ error: "Refresh token expired" });
    }
});

// GET /api/auth/me — restore session (used on app mount)
app.get("/api/auth/me", (req: Request, res: Response) => {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: "No session" });
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const user = resolveUserFromTokenPayload(decoded);
        if (!user) return res.status(401).json({ error: "Account not found" });
        if (user.status !== "ACTIVE") {
            return res.status(403).json({ error: `Account is ${user.status.toLowerCase()}` });
        }

        const session = buildAuthSession(user);
        setRefreshCookie(res, session.refreshToken);
        return res.json({ accessToken: session.accessToken, user: session.user });
    } catch {
        return res.status(401).json({ error: "Session expired" });
    }
});

// POST /api/auth/logout — clear refresh cookie
app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie("refreshToken", { path: "/" });
    return res.json({ ok: true });
});

// ── Protect all other API routes ──────────────────────────────
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    // Skip protection for auth routes and public assets if any under /api
    if (req.path.startsWith("/auth")) return next();
    return authMiddleware(req, res, next);
});

app.get("/api/me/account", (req: Request, res: Response) => {
    try {
        const user = getRequestUser(req);
        if (!user) return res.status(401).json({ error: "Account not found" });

        const wallets = listUserWallets(user.id).map((wallet) => ({
            id: wallet.id,
            label: wallet.label,
            publicKey: wallet.publicKey,
            status: wallet.status,
            isDefault: wallet.isDefault,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt,
        }));

        res.json({
            user: buildClientUser(user),
            wallets,
            permissions: {
                isAdmin: user.role === "ADMIN",
                canViewAdmin: user.role === "ADMIN",
                canManageUsers: user.role === "ADMIN",
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/me/stats", (req: Request, res: Response) => {
    try {
        const context = getScopedRequestContext(req);
        if (!context) return res.status(401).json({ error: "Account not found" });
        syncLegacyScopeDataIfNeeded(context);

        const positions = getScopedPositions({
            userId: context.user.id,
            walletId: context.walletId,
            activeOnly: false,
        });
        const active = positions.filter((position: any) => position.isActive);
        const closed = positions.filter((position: any) => !position.isActive);
        const totalInvested = active.reduce((sum: number, position: any) => sum + Number(position.buySolAmount || 0), 0);

        const trades = getScopedTrades({
            userId: context.user.id,
            walletId: context.walletId,
            limit: 500,
        });

        const totalPnl = trades.reduce((sum: number, trade: any) => {
            return sum + Number(trade.pnl ?? trade.pnl_sol ?? 0);
        }, 0);

        const wins = trades.filter((trade: any) => Number(trade.pnl ?? trade.pnl_sol ?? 0) > 0).length;
        const losses = trades.filter((trade: any) => Number(trade.pnl ?? trade.pnl_sol ?? 0) < 0).length;
        const closedCount = wins + losses;

        res.json({
            totalPositions: positions.length,
            activePositions: active.length,
            closedPositions: closed.length,
            totalInvested: parseFloat(totalInvested.toFixed(4)),
            totalPnL: parseFloat(totalPnl.toFixed(4)),
            walletSol: parseFloat(totalPnl.toFixed(4)),
            walletAddress: context.wallet?.publicKey || null,
            wins,
            losses,
            winRate: closedCount > 0 ? ((wins / closedCount) * 100).toFixed(1) : "0.0",
            circuitBreaker: loadCBState(),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/me/positions", (req: Request, res: Response) => {
    try {
        const context = getScopedRequestContext(req);
        if (!context) return res.status(401).json({ error: "Account not found" });
        syncLegacyScopeDataIfNeeded(context);

        const positions = getScopedPositions({
            userId: context.user.id,
            walletId: context.walletId,
            activeOnly: true,
        });

        const enriched = positions.map((position: any) => {
            const buyTimestamp = Number(position.buyTimestamp || position.entryTime || position.timestamp || Date.now());
            const age = Date.now() - buyTimestamp;
            return {
                ...position,
                age,
                ageFormatted: formatAge(age),
            };
        });

        res.json(enriched);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/me/trades", (req: Request, res: Response) => {
    try {
        const context = getScopedRequestContext(req);
        if (!context) return res.status(401).json({ error: "Account not found" });
        syncLegacyScopeDataIfNeeded(context);

        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || "20")));
        const trades = getScopedTrades({
            userId: context.user.id,
            walletId: context.walletId,
            limit,
        });

        res.json(trades.map((trade: any) => ({
            token: trade.token || trade.tokenSymbol || trade.symbol || "Unknown",
            timestamp: formatTimestamp(trade.timestamp || trade.exitTime || trade.entryTime || Date.now()),
            entryTime: trade.entryTime || trade.timestamp || null,
            exitTime: trade.exitTime || null,
            entryPrice: trade.entryPrice || 0,
            exitPrice: trade.exitPrice || 0,
            pnl: Number(trade.pnl ?? trade.pnl_sol ?? 0),
            pnlPercent: Number(trade.pnlPercent ?? trade.pnl_percent ?? 0),
            confidence: Number(trade.confidence || 0),
            status: trade.status || "closed",
            tokenMint: trade.mint || trade.tokenMint || null,
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/me/trading-config", (req: Request, res: Response) => {
    try {
        const context = getScopedRequestContext(req);
        if (!context) return res.status(401).json({ error: "Account not found" });
        syncLegacyScopeDataIfNeeded(context);

        const defaults = getTradingConfigDefaults();
        const scoped = getScopedTradingConfig({
            userId: context.user.id,
            walletId: context.walletId,
        }) || {};

        res.json({ ...defaults, ...scoped });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/me/trading-config", (req: Request, res: Response) => {
    try {
        const context = getScopedRequestContext(req);
        if (!context) return res.status(401).json({ error: "Account not found" });

        const existing = getScopedTradingConfig({
            userId: context.user.id,
            walletId: context.walletId,
        }) || {};

        const updated = {
            ...existing,
            ...req.body,
            updatedAt: new Date().toISOString(),
        };

        upsertScopedTradingConfig({
            userId: context.user.id,
            walletId: context.walletId,
            config: updated,
        });

        res.json({ success: true, config: updated });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/admin/overview", requireAdmin, (req: Request, res: Response) => {
    try {
        const stats = getStats();
        const botHealth = {
            cbState: loadCBState(),
            agentStatus: loadAgentStatus(),
        };
        const trades = loadAgentTrades();
        const totalPnl = trades.reduce((sum: number, trade: any) => sum + Number(trade.pnl || trade.pnl_sol || 0), 0);
        const currentWalletAddress = getBootstrapWalletAddress();

        const users = listUsersWithWalletCounts().map((row) => ({
            id: Number(row.id),
            email: row.email,
            name: row.name || row.email.split("@")[0],
            role: row.role,
            status: row.status,
            accessOrigin: row.accessOrigin,
            billingStatus: row.billingStatus,
            walletCount: Number(row.walletCount || 0),
            lastLoginAt: row.lastLoginAt,
            createdAt: row.createdAt,
        }));

        const wallets = listAllWalletsWithOwners().map((wallet) => {
            const isLiveWallet = Boolean(currentWalletAddress && wallet.publicKey === currentWalletAddress);

            return {
                id: wallet.id,
                userId: wallet.userId,
                ownerEmail: wallet.ownerEmail,
                ownerName: wallet.ownerName || wallet.ownerEmail.split("@")[0],
                ownerRole: wallet.ownerRole,
                ownerStatus: wallet.ownerStatus,
                label: wallet.label,
                publicKey: wallet.publicKey,
                status: wallet.status,
                isDefault: wallet.isDefault,
                trackingStatus: isLiveWallet ? "LIVE" : "PENDING_WALLET_ISOLATION",
                performance: {
                    totalPnlSol: isLiveWallet ? parseFloat(totalPnl.toFixed(4)) : 0,
                    totalPositions: isLiveWallet ? stats.totalPositions : 0,
                    activePositions: isLiveWallet ? stats.activePositions : 0,
                    winRate: isLiveWallet ? stats.winRate : "0.0",
                },
            };
        });

        res.json({
            summary: {
                totalUsers: users.length,
                activeUsers: users.filter((user) => user.status === "ACTIVE").length,
                suspendedUsers: users.filter((user) => user.status === "SUSPENDED").length,
                adminUsers: users.filter((user) => user.role === "ADMIN").length,
                totalWallets: wallets.length,
                activeWallets: wallets.filter((wallet) => wallet.status === "ACTIVE").length,
                totalPnlSol: parseFloat(totalPnl.toFixed(4)),
                activePositions: stats.activePositions,
                botMode: stats.agent.mode,
                botRateLimited: botHealth.agentStatus.rateLimited || false,
                circuitBreakerTripped: botHealth.cbState.isTripped || false,
            },
            users,
            wallets,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/admin/users", requireAdmin, (req: Request, res: Response) => {
    try {
        const users = listUsersWithWalletCounts().map((row) => ({
            id: Number(row.id),
            email: row.email,
            name: row.name || row.email.split("@")[0],
            role: row.role,
            status: row.status,
            accessOrigin: row.accessOrigin,
            billingStatus: row.billingStatus,
            walletCount: Number(row.walletCount || 0),
            lastLoginAt: row.lastLoginAt,
            createdAt: row.createdAt,
        }));
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/admin/users", requireAdmin, (req: Request, res: Response) => {
    try {
        const { email, name, role, status, accessOrigin, billingStatus, invitedByUserId } = req.body || {};
        if (!email) return res.status(400).json({ error: "email is required" });
        const user = createUser({
            email,
            name,
            role,
            status,
            accessOrigin,
            billingStatus,
            invitedByUserId,
        });
        return res.status(201).json(user);
    } catch (error: any) {
        return res.status(400).json({ error: error.message });
    }
});

app.patch("/api/admin/users/:id/status", requireAdmin, (req: Request, res: Response) => {
    try {
        const userId = Number(req.params.id);
        const { status } = req.body || {};
        if (!["ACTIVE", "PENDING", "SUSPENDED"].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }
        const updated = updateUserStatus(userId, status);
        return res.json(updated);
    } catch (error: any) {
        return res.status(400).json({ error: error.message });
    }
});

app.patch("/api/admin/users/:id/role", requireAdmin, (req: Request, res: Response) => {
    try {
        const userId = Number(req.params.id);
        const { role } = req.body || {};
        if (!["ADMIN", "USER", "SUPPORT"].includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
        }

        const authUser = getRequestUser(req);
        if (authUser && authUser.id === userId && role !== "ADMIN") {
            return res.status(400).json({ error: "Cannot remove admin role from yourself" });
        }

        const updated = updateUserRole(userId, role);
        return res.json(updated);
    } catch (error: any) {
        return res.status(400).json({ error: error.message });
    }
});

app.get("/api/admin/users/:id/wallets", requireAdmin, (req: Request, res: Response) => {
    try {
        const userId = Number(req.params.id);
        const user = getUserById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        const wallets = listUserWallets(userId);
        return res.json(wallets);
    } catch (error: any) {
        return res.status(400).json({ error: error.message });
    }
});

// Paths dos arquivos de dados
const POSITIONS_FILE = path.join(__dirname, "../data/positions.json");
const CB_STATE_FILE = path.join(__dirname, "../circuit_breaker_state.json");
const AGENT_CONFIG_FILE = path.join(__dirname, "../data/agent/config.json");
const LEARNING_METRICS_FILE = path.join(__dirname, "../data/agent/learning-metrics.json");
const MAINNET_METRICS_FILE = path.join(__dirname, "../data/agent/learning-metrics-mainnet.json");
const AGENT_TRADES_FILE = path.join(__dirname, "../data/agent/trades.json");
const PATTERNS_FILE = path.join(__dirname, "../data/agent/patterns.json");
const SENT_ADDRESSES_FILE = path.join(__dirname, "../sent_addresses.json");
const AGENT_STATUS_FILE = path.join(__dirname, "../data/agent/status.json");
const TRADING_CONFIG_FILE = path.join(__dirname, "../data/trading-config.json");
const EMERGENCY_STOP_FILE = path.join(__dirname, "../data/emergency-stop.json");
const PROTOCOL_CONFIG_FILE = path.join(__dirname, "../data/protocol-config.json");

/**
 * GET /api/stats - Estatísticas gerais
 */
app.get("/api/stats", (req, res) => {
    try {
        const positions = loadPositions();
        const cbState = loadCBState();

        const active = positions.filter(p => p.isActive);
        const closed = positions.filter(p => !p.isActive);

        const totalInvested = active.reduce((sum, p) => sum + p.buySolAmount, 0);
        const trades = loadAgentTrades();
        const totalPnlTrades = trades.reduce((sum: number, t: any) => sum + Number(t.pnl || t.pnl_sol || 0), 0);
        const plHistory = getPnLHistory(30);
        const pnlFromHistory = plHistory?.plValues?.length ? plHistory.plValues[plHistory.plValues.length - 1] : 0;
        const totalPnL = parseFloat((totalPnlTrades || pnlFromHistory || 0).toFixed(4));

        const wins = closed.filter(p => {
            // Simplificado: assumir que posição fechada = lucro se durou menos de 1h
            return p.buyTimestamp && Date.now() - p.buyTimestamp < 3600000;
        }).length;
        const losses = closed.length - wins;
        const walletInfo = loadBotWallet();
        const walletAddress = WALLET_ADDRESS_ENV || walletInfo?.publicKey || null;

        res.json({
            totalPositions: positions.length,
            activePositions: active.length,
            closedPositions: closed.length,
            totalInvested: parseFloat(totalInvested.toFixed(4)),
            totalPnL,
            walletSol: totalPnL,
            walletAddress,
            wins,
            losses,
            winRate: closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) : "0.0",
            circuitBreaker: {
                isTripped: cbState.isTripped,
                tripReason: cbState.tripReason,
                dailyLoss: cbState.dailyLossSol,
                consecutiveFailures: cbState.consecutiveFailures,
            },
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/positions - Lista de posições ativas
 */
app.get("/api/positions", (req, res) => {
    try {
        const positions = loadPositions();
        const active = positions.filter(p => p.isActive);

        const enriched = active.map(p => ({
            ...p,
            age: Date.now() - p.buyTimestamp,
            ageFormatted: formatAge(Date.now() - p.buyTimestamp),
        }));

        res.json(enriched);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cb-status - Status do Circuit Breaker
 */
app.get("/api/cb-status", (req, res) => {
    try {
        const cbState = loadCBState();
        res.json(cbState);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/agent/stats - Estatísticas do AI Agent
 */
app.get("/api/agent/stats", (req, res) => {
    try {
        const agentConfig = loadAgentConfig();
        const learningMetrics = loadLearningMetrics();
        const mainnetMetrics = loadMainnetLearningMetrics();
        const agentStatus = loadAgentStatus();

        res.json({
            enabled: agentConfig.enabled || false,
            mode: agentConfig.mode || "SIMULATION",
            confidence: agentConfig.confidence || 0,
            learningEnabled: agentConfig.learningEnabled || false,
            simulation: {
                tradesAnalyzed: learningMetrics.tradesAnalyzed || 0,
                tradesRequired: learningMetrics.tradesRequired || 50,
                winRateImprovement: learningMetrics.winRateImprovement || 0,
                nextOptimization: learningMetrics.nextOptimization || null,
            },
            mainnet: {
                tradesAnalyzed: mainnetMetrics.tradesAnalyzed || 0,
                tradesRequired: mainnetMetrics.tradesRequired || 50,
                winRateImprovement: mainnetMetrics.winRateImprovement || 0,
                nextOptimization: mainnetMetrics.nextOptimization || null,
            },
            rateLimited: agentStatus.rateLimited || false,
            rateLimitAt: agentStatus.at || null,
            rateLimitReason: agentStatus.reason || null,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/agent/trades - Histórico de trades do agente
 */
app.get("/api/agent/trades", (req, res) => {
    try {
        const trades = loadAgentTrades();

        res.json(trades.slice(0, 20).map(trade => ({
            token: trade.token || "Unknown",
            timestamp: formatTimestamp(trade.timestamp),
            entryTime: trade.entryTime || trade.timestamp || null,
            exitTime: trade.exitTime || null,
            entryPrice: trade.entryPrice || 0,
            exitPrice: trade.exitPrice || 0,
            pnl: trade.pnl || 0,
            pnlPercent: trade.pnlPercent || trade.pnl_percent || 0,
            confidence: trade.confidence || 0,
            status: trade.status || "closed",
            tokenMint: trade.mint || trade.tokenMint || null,
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/wallet/new - Gera uma nova carteira (sobrescreve bot-wallet.json)
 */
app.post("/api/wallet/new", (req, res) => {
    try {
        const kp = Keypair.generate();
        const secretArray = Array.from(kp.secretKey);
        fs.writeFileSync(BOT_WALLET_FILE, JSON.stringify(secretArray, null, 2));
        res.json({
            publicKey: kp.publicKey.toBase58(),
            secretBase58: bs58.encode(kp.secretKey),
            savedAt: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/wallet/export - Exporta carteira atual (pública + privada base58)
 */
app.get("/api/wallet/export", (req, res) => {
    try {
        const wallet = loadBotWallet();
        if (!wallet) return res.status(404).json({ error: "Wallet not found" });
        return res.json({
            publicKey: wallet.publicKey,
            secretBase58: bs58.encode(wallet.secretKey),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/wallet/balances - Retorna saldo de SOL e tokens SPL reais (Cachê de 60s)
 */
let cachedBalances: any = null;
let lastBalanceFetch = 0;
const BALANCE_CACHE_TTL = 60_000;

app.get("/api/wallet/balances", async (req, res) => {
    try {
        if (cachedBalances && Date.now() - lastBalanceFetch < BALANCE_CACHE_TTL) {
            return res.json(cachedBalances);
        }

        const walletInfo = loadBotWallet();
        const address = WALLET_ADDRESS_ENV || walletInfo?.publicKey;
        if (!address) return res.status(400).json({ error: "Wallet address not configured" });

        const owner = new PublicKey(address);
        const solLamports = await connection.getBalance(owner);
        const solBalance = solLamports / LAMPORTS_PER_SOL;

        const tokensResp = await connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID });
        const tokens = tokensResp.value
            .map((acc: any) => {
                const info = acc.account.data?.parsed?.info;
                if (!info?.tokenAmount) return null;
                const t = info.tokenAmount;
                if (Number(t.amount) <= 0) return null;
                const mint = info.mint;
                return {
                    mint,
                    amount: t.amount,
                    decimals: t.decimals,
                    uiAmount: t.uiAmount,
                    symbol: t.symbol || (mint ? mint.slice(0, 4) : 'TOK'),
                };
            })
            .filter(Boolean);

        cachedBalances = { address, solBalance, tokens, cachedAt: new Date().toISOString() };
        lastBalanceFetch = Date.now();

        res.json(cachedBalances);
    } catch (error: any) {
        // If it fails (e.g. 429), return cached if available, else error
        if (cachedBalances) return res.json(cachedBalances);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/agent/logs - Live agent console logs  
 */
app.get("/api/agent/logs", (req, res) => {
    try {
        const logsDir = path.join(__dirname, "../logs");
        // Versão segura: Evita usar Shell $(ls ...) que permite injeção de comando.
        // Listamos os arquivos manualmente e passamos para o grep.
        fs.readdir(logsDir, (err, files) => {
            if (err) return res.status(500).json({ error: "Failed to read logs directory" });

            const logFiles = files
                .filter(f => f.startsWith('combined') && f.endsWith('.log'))
                .sort((a, b) => {
                    const statA = fs.statSync(path.join(logsDir, a));
                    const statB = fs.statSync(path.join(logsDir, b));
                    return statA.mtime.getTime() - statB.mtime.getTime();
                })
                .map(f => path.join(logsDir, f))
                .slice(-3); // Limit to the 3 most recent files to save CPU/Banda

            if (logFiles.length === 0) return res.json([]);

            try {
                const includePatterns = [
                    /\[Agent\]/,
                    /\[RiskEngine\]/,
                    /\[WHALE ALERT\]/,
                    /\[Pipeline/,
                    /\[SIMULATION\]/,
                    /TYPE\s*:/i,
                    /\bBUY\b/i,
                    /\bSELL\b/i,
                    /Meteora DBC/i,
                ];
                const excludePattern = /ALLOW_TRADE/;
                let filteredLines: string[] = [];
                let recentLines: string[] = [];
                const { execSync } = require('child_process');

                for (const filePath of logFiles) {
                    try {
                        // Read only the most recent chunk from each file to keep response fast.
                        const lastLinesBuffer = execSync(`tail -n 500 "${filePath}"`);
                        const content = lastLinesBuffer.toString("utf-8");
                        const lines = content
                            .split("\n")
                            .map((line: string) => line.trim())
                            .filter(Boolean);

                        recentLines = recentLines.concat(lines);

                        const matched = lines.filter((line: string) =>
                            includePatterns.some((pattern) => pattern.test(line)) &&
                            !excludePattern.test(line)
                        );
                        filteredLines = filteredLines.concat(matched);
                    } catch (readErr) {
                        console.error(`Error tailing ${filePath}:`, readErr);
                    }
                }

                // If specialized filters produce no rows, fall back to recent lines so the terminal never stays empty.
                const sourceLines = filteredLines.length > 0 ? filteredLines : recentLines;
                const tailLines = sourceLines.slice(-120);

                const parsedLogs = tailLines.map((line: string) => {
                    try {
                        const parsed = JSON.parse(line);
                        return {
                            timestamp: parsed.timestamp || new Date().toISOString(),
                            level: parsed.level || "info",
                            message: parsed.message || line,
                        };
                    } catch {
                        return { timestamp: new Date().toISOString(), level: "info", message: line };
                    }
                });

                res.json(parsedLogs);
            } catch (err: any) {
                res.status(500).json({ error: "Failed to read logs: " + err.message });
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/agent/patterns - Padrões estatísticos calculados dos trades simulados
 */
app.get("/api/agent/patterns", (req, res) => {
    try {
        const SIM_TRADES_FILE = path.join(__dirname, "../data/simulation/trades.json");
        if (!fs.existsSync(SIM_TRADES_FILE)) {
            return res.json([]);
        }

        const rawTrades: any[] = JSON.parse(fs.readFileSync(SIM_TRADES_FILE, "utf-8"));
        const closed = rawTrades.filter((t: any) => t.status && t.status !== "OPEN");

        if (closed.length < 5) {
            return res.json([]); // Not enough data for patterns
        }

        // ── Pattern 1: Confidence Buckets ──────────────────────────
        const buckets: Record<string, any[]> = {};
        for (const t of closed) {
            const conf = Math.floor((t.confidence || 80) / 10) * 10;
            const key = `Confidence ${conf}–${conf + 9}%`;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(t);
        }

        const patterns = Object.entries(buckets)
            .filter(([, trades]) => trades.length >= 2)
            .map(([name, trades]) => {
                const wins = trades.filter((t: any) => t.pnl > 0);
                const avgProfit = trades.reduce((s: number, t: any) => s + (t.pnlPercent || 0), 0) / trades.length / 100;
                return {
                    name,
                    accuracy: wins.length / trades.length,
                    count: trades.length,
                    avgProfit,
                    confidence: wins.length / trades.length,
                };
            });

        // ── Pattern 2: Status breakdown ────────────────────────────
        const statusGroups: Record<string, any[]> = {};
        for (const t of closed) {
            const key = t.status as string;
            if (!statusGroups[key]) statusGroups[key] = [];
            statusGroups[key].push(t);
        }

        for (const [status, trades] of Object.entries(statusGroups)) {
            if (trades.length < 2) continue;
            const wins = trades.filter((t: any) => t.pnl > 0);
            const avgProfit = trades.reduce((s: number, t: any) => s + (t.pnlPercent || 0), 0) / trades.length / 100;
            patterns.push({
                name: `Status: ${status}`,
                accuracy: wins.length / trades.length,
                count: trades.length,
                avgProfit,
                confidence: wins.length / trades.length,
            });
        }

        res.json(patterns.sort((a, b) => b.count - a.count));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/agent/learned-rules - Regras aprendidas pelo LearnerAgent (LLM)
 */
app.get("/api/agent/learned-rules", (req, res) => {
    try {
        const rules = loadLearnedPatterns();
        res.json(rules);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/agent/postmortems - Ultimas autopsias de trades perdedores
 */
app.get("/api/agent/postmortems", (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || "20")));
        res.json(getRecentPostMortemTrades(limit));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/ta/config - Configuração atual de Technical Analysis
 */
app.get("/api/ta/config", (req, res) => {
    try {
        const TA_CONFIG_FILE = path.join(__dirname, "../data/ta-config.json");
        if (!fs.existsSync(TA_CONFIG_FILE)) {
            return res.json({ error: "ta-config.json not found", usingDefaults: true });
        }
        const config = JSON.parse(fs.readFileSync(TA_CONFIG_FILE, "utf-8"));
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/ta/fallback-state - Estado do fallback automático
 */
app.get("/api/ta/fallback-state", (req, res) => {
    try {
        const FALLBACK_STATE_FILE = path.join(__dirname, "../data/.ta-fallback-state.json");
        if (!fs.existsSync(FALLBACK_STATE_FILE)) {
            return res.json({
                isActive: false,
                lastTradeTimestamp: null,
                timeSinceLastTradeMin: null,
                message: "No fallback state available",
            });
        }
        const state = JSON.parse(fs.readFileSync(FALLBACK_STATE_FILE, "utf-8"));
        res.json(state);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/blocks/last-checked - Últimos tokens verificados e seus bloqueios
 */
app.get("/api/blocks/last-checked", (req, res) => {
    try {
        const BLOCKS_LOG_FILE = path.join(__dirname, "../data/.blocks-log.json");
        if (!fs.existsSync(BLOCKS_LOG_FILE)) {
            return res.json([]);
        }
        const blocks = JSON.parse(fs.readFileSync(BLOCKS_LOG_FILE, "utf-8"));
        // Return last 50 entries
        res.json(blocks.slice(-50));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/pl-history - Histórico de P&L acumulado (Persistente via SQLite)
 */
app.get("/api/pl-history", (req, res) => {
    try {
        const history = getPnLHistory(30);
        res.json(history);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/pnl-history/csv - Exportação de histórico em CSV
 */
app.get("/api/pnl-history/csv", (req, res) => {
    try {
        const history = getPnLHistory(30);
        let csv = 'Timestamp,P&L (SOL),Positions\n';
        history.timestamps.forEach((ts, i) => {
            csv += `${ts},${history.plValues[i]},${history.positions[i]}\n`;
        });
        res.header('Content-Type', 'text/csv');
        res.attachment('pnl_history.csv');
        res.send(csv);
    } catch (error: any) {
        res.status(500).send(error.message);
    }
});
app.post("/api/agent/toggle", (req, res) => {
    try {
        const cfg = loadAgentConfig();
        cfg.enabled = !cfg.enabled;
        fs.writeFileSync(AGENT_CONFIG_FILE, JSON.stringify(cfg, null, 2));
        res.json({ enabled: cfg.enabled });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/agent/mode - Alterna SIM/LIVE
 */
app.post("/api/agent/mode", (req, res) => {
    try {
        const cfg = loadAgentConfig();
        cfg.mode = cfg.mode === "LIVE" ? "SIMULATION" : "LIVE";
        fs.writeFileSync(AGENT_CONFIG_FILE, JSON.stringify(cfg, null, 2));
        res.json({ mode: cfg.mode });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/simulation/status - Métricas e prontidão da simulação
 */
app.get("/api/simulation/status", (req, res) => {
    try {
        const metrics = getSimulationMetrics();
        const readiness = isSimulationReadyForLive();

        res.json({
            mode: process.env.AGENT_MODE || "SIMULATION",
            metrics,
            readyForLive: readiness.ready,
            readinessScore: readiness.score,
            reasons: readiness.reasons,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/simulation/trades - Últimos trades simulados (from SQLite)
 */
app.get("/api/simulation/trades", (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string || "20")));
        const rows = db.prepare(`
            SELECT 
                token_mint as tokenMint,
                token_symbol as tokenSymbol,
                entry_time as entryTime,
                entry_price as entryPrice,
                entry_amount as entryAmount,
                exit_time as exitTime,
                exit_price as exitPrice,
                pnl_sol as pnl,
                pnl_percent as pnlPercent,
                confidence,
                status,
                reason,
                token_holders as tokenHolders,
                market_cap_entry as marketCapEntry,
                market_cap_exit as marketCapExit
            FROM simulated_trades
            ORDER BY entry_time DESC
            LIMIT ?
        `).all(limit);
        if (rows.length === 0) {
            return res.json(loadSimTradesFallback(limit));
        }
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Funções auxiliares
function loadPositions() {
    try {
        if (!fs.existsSync(POSITIONS_FILE)) {
            return [];
        }
        const data = fs.readFileSync(POSITIONS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar posições:", error);
        return [];
    }
}

function loadCBState() {
    try {
        if (!fs.existsSync(CB_STATE_FILE)) {
            return {
                isTripped: false,
                dailyLossSol: 0,
                consecutiveFailures: 0,
                lastResetTime: Date.now(),
            };
        }
        const data = fs.readFileSync(CB_STATE_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar CB state:", error);
        return {
            isTripped: false,
            dailyLossSol: 0,
            consecutiveFailures: 0,
            lastResetTime: Date.now(),
        };
    }
}

function formatAge(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function formatTimestamp(timestamp: number | string): string {
    try {
        const date = new Date(typeof timestamp === 'number' ? timestamp : parseInt(timestamp));
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    } catch {
        return 'Unknown';
    }
}

function loadAgentConfig() {
    try {
        if (!fs.existsSync(AGENT_CONFIG_FILE)) {
            return {
                enabled: false,
                mode: "SIMULATION",
                confidence: 0,
                learningEnabled: false,
            };
        }
        const data = fs.readFileSync(AGENT_CONFIG_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar config do agente:", error);
        return {
            enabled: false,
            mode: "SIMULATION",
            confidence: 0,
            learningEnabled: false,
        };
    }
}

function loadLearningMetrics() {
    try {
        if (!fs.existsSync(LEARNING_METRICS_FILE)) {
            return {
                tradesAnalyzed: 0,
                tradesRequired: 50,
                winRateImprovement: 0,
                nextOptimization: null,
            };
        }
        const data = fs.readFileSync(LEARNING_METRICS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar métricas de learning:", error);
        return {
            tradesAnalyzed: 0,
            tradesRequired: 50,
            winRateImprovement: 0,
            nextOptimization: null,
        };
    }
}

function loadMainnetLearningMetrics() {
    try {
        if (!fs.existsSync(MAINNET_METRICS_FILE)) {
            return {
                tradesAnalyzed: 0,
                tradesRequired: 50,
                winRateImprovement: 0,
                nextOptimization: null,
            };
        }
        const data = fs.readFileSync(MAINNET_METRICS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar métricas de learning mainnet:", error);
        return {
            tradesAnalyzed: 0,
            tradesRequired: 50,
            winRateImprovement: 0,
            nextOptimization: null,
        };
    }
}

function loadAgentTrades() {
    try {
        if (!fs.existsSync(AGENT_TRADES_FILE)) {
            return [];
        }
        const data = fs.readFileSync(AGENT_TRADES_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar trades do agente:", error);
        return [];
    }
}

function loadLearnedPatterns() {
    try {
        if (!fs.existsSync(PATTERNS_FILE)) {
            return [];
        }
        const data = fs.readFileSync(PATTERNS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar padrões aprendidos:", error);
        return [];
    }
}

function loadAgentStatus() {
    try {
        if (!fs.existsSync(AGENT_STATUS_FILE)) {
            return { rateLimited: false };
        }
        const data = fs.readFileSync(AGENT_STATUS_FILE, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar status do agente:", error);
        return { rateLimited: false };
    }
}

function getTradingConfigDefaults() {
    return {
        buyAmountSol: parseFloat(process.env.BUY_AMOUNT_SOL || "0.01"),
        takeProfitPercent: parseFloat(process.env.TAKE_PROFIT_PERCENT || "100"),
        stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || "30"),
        stopLossEnabled: true,
        slippageBps: parseInt(process.env.SLIPPAGE_BPS || "300"),
        agentMinConfidence: parseInt(process.env.AGENT_MIN_CONFIDENCE || "70"),
        jitoTipAmount: parseFloat(process.env.JITO_TIP_AMOUNT || "0.0001"),
        autoBuyEnabled: process.env.AUTO_BUY_ENABLED === "true",
        singleTradeMode: process.env.SINGLE_TRADE_MODE === "true",
        copyTradeEnabled: process.env.COPY_TRADE_ENABLED === "true",
        copyTradeAmountSol: parseFloat(process.env.COPY_TRADE_AMOUNT_SOL || "0.1"),
        followWallets: (process.env.FOLLOW_WALLETS || "").split(",").filter((wallet: string) => wallet.length > 30),
        volatilityAdjustedTpSl: process.env.VOLATILITY_ADJUSTED_TP_SL === "true",
        atrMultiplierTp: parseFloat(process.env.ATR_MULTIPLIER_TP || "3.0"),
        atrMultiplierSl: parseFloat(process.env.ATR_MULTIPLIER_SL || "1.5"),
    };
}

// ══════════════════════════════════════════════════════════════
// NEW CONTROL ENDPOINTS
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/trading-config - Ler configurações de trading atuais
 */
app.get("/api/trading-config", (req, res) => {
    try {
        const defaults = getTradingConfigDefaults();

        let saved: any = {};
        if (fs.existsSync(TRADING_CONFIG_FILE)) {
            saved = JSON.parse(fs.readFileSync(TRADING_CONFIG_FILE, "utf-8"));
        }
        res.json({ ...defaults, ...saved });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/trading-config - Salvar configurações de trading
 */
app.post("/api/trading-config", (req, res) => {
    try {
        const {
            buyAmountSol,
            takeProfitPercent,
            stopLossPercent,
            slippageBps,
            agentMinConfidence,
            jitoTipAmount,
            autoBuyEnabled,
            singleTradeMode,
            autoSellTakeProfit,
            autoSellStopLoss,
            sellPercentOnTp,
            copyTradeEnabled,
            copyTradeAmountSol,
            followWallets,
            stopLossEnabled,
            volatilityAdjustedTpSl,
            atrMultiplierTp,
            atrMultiplierSl,
            autoTrackCreator,
            autoSellOnCreatorExit,
            huggingfaceApiKey,
            senseAiEnabled,
        } = req.body;

        // Validações de segurança
        if (buyAmountSol !== undefined && (buyAmountSol < 0.001 || buyAmountSol > 10)) {
            return res.status(400).json({ error: "buyAmountSol must be between 0.001 and 10 SOL" });
        }
        if (agentMinConfidence !== undefined && (agentMinConfidence < 50 || agentMinConfidence > 99)) {
            return res.status(400).json({ error: "agentMinConfidence must be between 50 and 99" });
        }

        const existing = fs.existsSync(TRADING_CONFIG_FILE)
            ? JSON.parse(fs.readFileSync(TRADING_CONFIG_FILE, "utf-8"))
            : {};

        const updated = {
            ...existing,
            ...(buyAmountSol !== undefined && { buyAmountSol }),
            ...(takeProfitPercent !== undefined && { takeProfitPercent }),
            ...(stopLossPercent !== undefined && { stopLossPercent }),
            ...(stopLossEnabled !== undefined && { stopLossEnabled }),
            ...(slippageBps !== undefined && { slippageBps }),
            ...(agentMinConfidence !== undefined && { agentMinConfidence }),
            ...(jitoTipAmount !== undefined && { jitoTipAmount }),
            ...(autoBuyEnabled !== undefined && { autoBuyEnabled }),
            ...(singleTradeMode !== undefined && { singleTradeMode }),
            ...(autoSellTakeProfit !== undefined && { autoSellTakeProfit }),
            ...(autoSellStopLoss !== undefined && { autoSellStopLoss }),
            ...(sellPercentOnTp !== undefined && { sellPercentOnTp }),
            ...(copyTradeEnabled !== undefined && { copyTradeEnabled }),
            ...(copyTradeAmountSol !== undefined && { copyTradeAmountSol }),
            ...(followWallets !== undefined && { followWallets }),
            ...(volatilityAdjustedTpSl !== undefined && { volatilityAdjustedTpSl }),
            ...(atrMultiplierTp !== undefined && { atrMultiplierTp }),
            ...(atrMultiplierSl !== undefined && { atrMultiplierSl }),
            ...(autoTrackCreator !== undefined && { autoTrackCreator }),
            ...(autoSellOnCreatorExit !== undefined && { autoSellOnCreatorExit }),
            ...(huggingfaceApiKey !== undefined && { huggingfaceApiKey }),
            ...(senseAiEnabled !== undefined && { senseAiEnabled }),
            updatedAt: new Date().toISOString(),
        };

        // Garantir que o diretório existe
        const dir = path.dirname(TRADING_CONFIG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(TRADING_CONFIG_FILE, JSON.stringify(updated, null, 2));
        res.json({ success: true, config: updated });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/cb-reset - Resetar Circuit Breaker manualmente
 */
app.post("/api/cb-reset", (req, res) => {
    try {
        const resetState = {
            isTripped: false,
            tripReason: null,
            dailyLossSol: 0,
            consecutiveFailures: 0,
            lastResetTime: Date.now(),
            manualReset: true,
            manualResetAt: new Date().toISOString(),
        };
        fs.writeFileSync(CB_STATE_FILE, JSON.stringify(resetState, null, 2));
        res.json({ success: true, message: "Circuit Breaker reset successfully" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/emergency-stop - Parada de emergência total
 */
app.post("/api/emergency-stop", (req, res) => {
    try {
        const { active } = req.body;
        const stopState = {
            active: active !== false, // default: ativar
            triggeredAt: new Date().toISOString(),
            reason: req.body.reason || "Manual emergency stop from dashboard",
        };

        const dir = path.dirname(EMERGENCY_STOP_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(EMERGENCY_STOP_FILE, JSON.stringify(stopState, null, 2));

        // Também tripa o circuit breaker
        if (stopState.active) {
            const cbState = {
                isTripped: true,
                tripReason: "EMERGENCY_STOP: Manual stop via dashboard",
                dailyLossSol: 0,
                consecutiveFailures: 0,
                lastResetTime: Date.now(),
            };
            fs.writeFileSync(CB_STATE_FILE, JSON.stringify(cbState, null, 2));
        }

        res.json({ success: true, emergencyStop: stopState });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/emergency-stop - Status da parada de emergência
 */
app.get("/api/emergency-stop", (req, res) => {
    try {
        if (!fs.existsSync(EMERGENCY_STOP_FILE)) {
            return res.json({ active: false });
        }
        const data = JSON.parse(fs.readFileSync(EMERGENCY_STOP_FILE, "utf-8"));
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/protocol-config - Configuração de protocolos ativos
 */
app.get("/api/protocol-config", (req, res) => {
    try {
        const defaults = {
            PUMPFUN: true,
            METEORA_DBC: process.env.METEORA_DBC_MONITORING_ENABLED !== "false",
            BONK_FUN: process.env.BONK_FUN_MONITORING_ENABLED !== "false",
            DAOS_FUN: process.env.DAOS_FUN_MONITORING_ENABLED !== "false",
            MOONSHOT: process.env.MOONSHOT_MONITORING_ENABLED !== "false",
        };

        if (fs.existsSync(PROTOCOL_CONFIG_FILE)) {
            const saved = JSON.parse(fs.readFileSync(PROTOCOL_CONFIG_FILE, "utf-8"));
            return res.json({ ...defaults, ...saved });
        }
        res.json(defaults);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/protocol-config - Atualizar protocolos ativos
 * MERGE with existing saved state — does NOT overwrite other protocols
 */
app.post("/api/protocol-config", (req, res) => {
    try {
        const dir = path.dirname(PROTOCOL_CONFIG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Read EXISTING saved state first (so we don't lose other protocol settings)
        let existing: any = {};
        if (fs.existsSync(PROTOCOL_CONFIG_FILE)) {
            try {
                existing = JSON.parse(fs.readFileSync(PROTOCOL_CONFIG_FILE, "utf-8"));
            } catch { existing = {}; }
        }

        const allowed = ["PUMPFUN", "METEORA_DBC", "BONK_FUN", "DAOS_FUN", "MOONSHOT"];
        // Only update the keys that were explicitly sent in this request
        const update: any = { ...existing };
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                update[key] = Boolean(req.body[key]);
            }
        }
        update.updatedAt = new Date().toISOString();

        fs.writeFileSync(PROTOCOL_CONFIG_FILE, JSON.stringify(update, null, 2));
        res.json({ success: true, config: update });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/agent/patterns/:index - Remover regra aprendida específica
 */
app.delete("/api/agent/patterns/:index", (req, res) => {
    try {
        const idx = parseInt(req.params.index);
        if (!fs.existsSync(PATTERNS_FILE)) {
            return res.status(404).json({ error: "Patterns file not found" });
        }
        const patterns = JSON.parse(fs.readFileSync(PATTERNS_FILE, "utf-8"));
        if (idx < 0 || idx >= patterns.length) {
            return res.status(400).json({ error: "Invalid pattern index" });
        }
        const removed = patterns.splice(idx, 1);
        fs.writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2));
        res.json({ success: true, removed: removed[0], remaining: patterns.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/agent/patterns - Limpar todas as regras aprendidas
 */
app.delete("/api/agent/patterns", (req, res) => {
    try {
        fs.writeFileSync(PATTERNS_FILE, JSON.stringify([], null, 2));
        res.json({ success: true, message: "All learned patterns cleared" });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/internal/broadcast - Forçar broadcast via WebSocket (para processos internos)
 */
app.post("/api/internal/broadcast", (req, res) => {
    broadcastDashboardUpdate();
    res.json({ success: true });
});

/**
 * GET /api/bot-health - Status de saúde geral do bot
 */
app.get("/api/bot-health", (req, res) => {
    try {
        const cbState = loadCBState();
        const agentStatus = loadAgentStatus();
        const emergencyStop = fs.existsSync(EMERGENCY_STOP_FILE)
            ? JSON.parse(fs.readFileSync(EMERGENCY_STOP_FILE, "utf-8"))
            : { active: false };

        const positions = loadPositions();
        const activePositions = positions.filter((p: any) => p.isActive);

        res.json({
            status: (
                emergencyStop.active ? "EMERGENCY_STOP" :
                    cbState.isTripped ? "CIRCUIT_BREAKER_TRIPPED" :
                        agentStatus.rateLimited ? "RATE_LIMITED" :
                            "OPERATIONAL"
            ),
            emergencyStop: emergencyStop.active || false,
            circuitBreakerTripped: cbState.isTripped || false,
            rateLimited: agentStatus.rateLimited || false,
            activePositions: activePositions.length,
            uptimeSince: process.uptime(),
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Helper to get stats for broadcast
function getStats() {
    const positions = loadPositions();
    const cbState = loadCBState();
    const active = positions.filter((p: any) => p.isActive);
    const closed = positions.filter((p: any) => !p.isActive);
    const totalInvested = active.reduce((sum: number, p: any) => sum + p.buySolAmount, 0);
    const wins = closed.filter((p: any) => p.buyTimestamp && Date.now() - p.buyTimestamp < 3600000).length;
    const losses = closed.length - wins;

    // Agent Stats
    const agentConfig = loadAgentConfig();
    const learningMetrics = loadLearningMetrics();
    const agentStatus = loadAgentStatus();

    // Simulation Stats
    const simMetrics = getSimulationMetrics();

    return {
        totalPositions: positions.length,
        activePositions: active.length,
        closedPositions: closed.length,
        totalInvested: parseFloat(totalInvested.toFixed(4)),
        wins,
        losses,
        winRate: closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) : "0.0",
        circuitBreaker: {
            isTripped: cbState.isTripped,
            tripReason: cbState.tripReason,
            dailyLoss: cbState.dailyLossSol,
            consecutiveFailures: cbState.consecutiveFailures,
        },
        positions: active.map((p: any) => ({
            ...p,
            ageFormatted: formatAge(Date.now() - p.buyTimestamp)
        })),
        agent: {
            enabled: agentConfig.enabled || false,
            mode: agentConfig.mode || "SIMULATION",
            rateLimited: agentStatus.rateLimited || false,
            simulation: simMetrics
        }
    };
}

// WebSocket Broadcast with Debounce
let broadcastTimeout: NodeJS.Timeout | null = null;

export function broadcastDashboardUpdate() {
    if (broadcastTimeout) clearTimeout(broadcastTimeout);

    broadcastTimeout = setTimeout(() => {
        const stats = getStats();
        const trades = loadAgentTrades();

        // Prevent recording corrupted P&L points if stats are temporarily empty due to race conditions
        if (stats.activePositions === 0 && stats.totalPositions === 0) {
            // Check if it's really empty or just a read error
            const rawData = fs.readFileSync(POSITIONS_FILE, "utf-8");
            if (rawData.length > 10 && rawData.includes('"mint"')) {
                // Suspiciously empty but file has content, retry once in 200ms
                setTimeout(broadcastDashboardUpdate, 200);
                return;
            }
        }

        const totalPnl = trades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
        recordPnLPoint(totalPnl, stats.activePositions);

        const plHistory = getPnLHistory(30);

        // Recent simulation trades
        const simTrades = db.prepare(`SELECT * FROM simulated_trades ORDER BY entry_time DESC LIMIT 20`).all();

        io.emit("dashboardUpdate", {
            stats,
            plHistory,
            simTrades,
            timestamp: Date.now()
        });

        broadcastTimeout = null;
    }, 2000); // Optimized: 2000ms debounce to save bandwidth and CPU
}

// Persistência de P&L
function recordPnLPoint(pnlSol: number, positionsCount: number) {
    try {
        const stmt = db.prepare(`
            INSERT INTO pnl_history (timestamp, pnl_sol, positions_count)
            VALUES (?, ?, ?)
        `);
        stmt.run(Date.now(), pnlSol, positionsCount);
    } catch (error) {
        console.error("Erro ao registrar ponto P&L no SQLite:", error);
    }
}

function getPnLHistory(days: number = 30) {
    try {
        const since = Date.now() - (days * 24 * 60 * 60 * 1000);
        const rows: any[] = db.prepare(`
            SELECT timestamp, pnl_sol, positions_count
            FROM pnl_history
            WHERE timestamp >= ?
            ORDER BY timestamp ASC
        `).all(since);

        if (rows.length === 0) {
            // Se vazio, gerar a partir dos trades simulados (JSON) ou agent trades
            const simTrades = loadSimTradesFallback(200).filter((t: any) => t.status !== "OPEN" && t.pnl !== undefined);
            const trades = simTrades.length > 0 ? simTrades : loadAgentTrades();
            let cumulative = 0;
            const series = trades
                .filter((t: any) => t.exitTime || t.entryTime)
                .sort((a: any, b: any) => (a.exitTime || a.entryTime) - (b.exitTime || b.entryTime))
                .map((t: any) => {
                    cumulative += Number(t.pnl || 0);
                    return { ts: t.exitTime || t.entryTime, pnl: parseFloat(cumulative.toFixed(4)) };
                });

            const timestamps = series.length ? series.map(s => s.ts) : [Date.now()];
            const values = series.length ? series.map(s => s.pnl) : [0];
            return {
                timestamps: timestamps.map(t => formatTimestamp(t)),
                rawTimestamps: timestamps,
                plValues: values,
                positions: values.map(() => 0)
            };
        }

        return {
            timestamps: rows.map(r => formatTimestamp(r.timestamp)),
            rawTimestamps: rows.map(r => Number(r.timestamp)),
            plValues: rows.map(r => parseFloat(r.pnl_sol.toFixed(4))),
            positions: rows.map(r => r.positions_count)
        };
    } catch (error) {
        console.error("Erro ao ler histórico P&L do SQLite:", error);
        return { timestamps: [], rawTimestamps: [], plValues: [], positions: [] };
    }
}

// Socket connection
io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Send initial data
    socket.emit("pnl-update", { stats: getStats(), plHistory: getPnLHistory() });

    // Handle bot notification (if bot connects as client)
    socket.on("bot-event-update", () => {
        broadcastDashboardUpdate();
    });
});

// Watch positions file as a fallback for cross-process updates
if (require.main === module) {
    fs.watch(POSITIONS_FILE, (event) => {
        if (event === 'change') {
            broadcastDashboardUpdate();
        }
    });

    fs.watch(AGENT_TRADES_FILE, (event) => {
        if (event === 'change') {
            broadcastDashboardUpdate();
        }
    });
}

// Snapshots horários e limpeza
if (require.main === module) {
    setInterval(() => {
        const trades = loadAgentTrades();
        const totalPnl = trades.reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
        const activeCount = loadPositions().filter(p => p.isActive).length;
        recordPnLPoint(totalPnl, activeCount);
    }, 60 * 60 * 1000);

    setInterval(() => {
        const tooOld = Date.now() - (90 * 24 * 60 * 60 * 1000);
        db.prepare('DELETE FROM pnl_history WHERE timestamp < ?').run(tooOld);
    }, 24 * 60 * 60 * 1000);
}

// ── SPA Fallback: serve index.html for all non-API routes ────
app.get(['/', '/login', '/dashboard', '/settings', '/positions', '/trades', '/premium', '/classic'], (req, res) => {
    const indexPath = path.join(DASHBOARD_DIST, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    res.status(404).send('Dashboard not built. Run: cd dashboard && npm run build');
});

// Final catch-all for anything else (including API 404s)
app.use((req: Request, res: Response) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: "API route not found" });
    }
    const indexPath = path.join(DASHBOARD_DIST, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    res.status(404).send('Page not found');
});

// Iniciar servidor apenas se o script for executado diretamente
if (require.main === module) {
    httpServer.listen(PORT, BIND_HOST, () => {
        console.log(`✅ Dashboard + WebSocket + SQLite rodando em http://${BIND_HOST}:${PORT}`);
        console.log(`✅ SQLite P&L History inicializado`);
        console.log(`✅ Serving frontend from: ${DASHBOARD_DIST}`);
    });
}
