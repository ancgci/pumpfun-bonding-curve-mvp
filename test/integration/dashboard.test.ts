import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../dashboard-api/server';
import db from '../../utils/db';

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const adminEmail = process.env.ALLOWED_EMAIL || "sr.antoniocarlos@gmail.com";
const mockToken = jwt.sign(
    {
        userId: 1,
        email: adminEmail,
        name: "Admin User",
        role: "ADMIN",
        accessStatus: "active",
        accessOrigin: "allowlist",
        billingStatus: "not-required",
    },
    JWT_SECRET
);

describe('Dashboard API Integration Tests', () => {
    const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${Math.floor(Math.random() * 100000)}@example.com`;

    it('GET /api/stats should return basic stats', async () => {
        const res = await request(app)
            .get('/api/stats')
            .set('Authorization', `Bearer ${mockToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('totalPositions');
        expect(res.body).toHaveProperty('activePositions');
    });

    it('GET /api/simulation/trades should return trade history', async () => {
        const res = await request(app)
            .get('/api/simulation/trades')
            .set('Authorization', `Bearer ${mockToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/simulation/trades should expose anomaly forensics', async () => {
        const mint = `ANOMALY_API_${Date.now()}`;
        db.prepare('DELETE FROM simulated_trades WHERE token_mint = ?').run(mint);

        try {
            db.prepare(`
                INSERT INTO simulated_trades (
                    token_mint,
                    token_symbol,
                    entry_time,
                    entry_price,
                    entry_amount,
                    confidence,
                    status,
                    reason,
                    entry_feed_audit,
                    exit_feed_audit,
                    anomaly_flag,
                    anomaly_reason,
                    anomaly_context,
                    postmortem_status,
                    postmortem_summary,
                    postmortem_analyzed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                mint,
                'AN2',
                Date.now(),
                0.00000005,
                0.005,
                87,
                'CLOSED_TP',
                'Take Profit hit [ANOMALY]',
                JSON.stringify({ pairAddress: 'PAIR_ENTRY_123456', selectedBy: 'FIRST_AVAILABLE' }),
                JSON.stringify({ pairAddress: 'PAIR_EXIT_654321', selectedBy: 'PREFERRED_PAIR' }),
                1,
                'PAIR_MISMATCH',
                JSON.stringify({ reasons: ['PAIR_MISMATCH'], coherenceRatio: 4.2 }),
                'DONE',
                'Pair mismatch confirmed by post-mortem',
                Date.now()
            );

            const res = await request(app)
                .get('/api/simulation/trades?limit=50')
                .set('Authorization', `Bearer ${mockToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);

            const trade = res.body.find((row: any) => row.tokenMint === mint);
            expect(trade).toBeDefined();
            expect(trade.anomalyFlag).toBe(true);
            expect(trade.anomalyReason).toBe('PAIR_MISMATCH');
            expect(trade.anomalyContext).toMatchObject({ coherenceRatio: 4.2 });
            expect(trade.entryFeedAudit).toMatchObject({ pairAddress: 'PAIR_ENTRY_123456' });
            expect(trade.exitFeedAudit).toMatchObject({ pairAddress: 'PAIR_EXIT_654321' });
            expect(trade.postMortemStatus).toBe('DONE');
            expect(trade.postMortemSummary).toBe('Pair mismatch confirmed by post-mortem');
            expect(typeof trade.postMortemAnalyzedAt).toBe('number');
        } finally {
            db.prepare('DELETE FROM simulated_trades WHERE token_mint = ?').run(mint);
        }
    });

    it('GET /api/agent/postmortem-summary should aggregate queue state and recent autopsies', async () => {
        const doneMint = `POSTMORTEM_DONE_${Date.now()}`;
        const pendingMint = `POSTMORTEM_PENDING_${Date.now()}`;
        const uniqueRootCause = `API_SUMMARY_CAUSE_${Date.now()}`;

        db.prepare('DELETE FROM simulated_trades WHERE token_mint IN (?, ?)').run(doneMint, pendingMint);

        try {
            db.prepare(`
                INSERT INTO simulated_trades (
                    token_mint,
                    token_symbol,
                    entry_time,
                    entry_price,
                    entry_amount,
                    exit_time,
                    exit_price,
                    pnl_sol,
                    pnl_percent,
                    confidence,
                    status,
                    reason,
                    anomaly_flag,
                    postmortem_status,
                    postmortem_summary,
                    postmortem_report,
                    postmortem_analyzed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                doneMint,
                'PMD',
                Date.now() - 60_000,
                0.00000005,
                0.005,
                Date.now() - 30_000,
                0.00000003,
                -0.001,
                -20,
                72,
                'CLOSED_SL',
                'Stop triggered',
                1,
                'DONE',
                'Synthetic summary for API integration test',
                JSON.stringify({
                    analyzedAt: Date.now() - 20_000,
                    mode: 'DETERMINISTIC',
                    summary: 'Synthetic summary for API integration test',
                    rootCause: {
                        code: uniqueRootCause,
                        label: 'Synthetic Root Cause',
                        confidence: 91,
                    },
                    betterEntry: {
                        verdict: 'WAIT',
                        suggestedAction: 'Wait for confirmation',
                        waitSeconds: 12,
                    },
                    evidence: ['Synthetic evidence'],
                    findings: ['Synthetic finding'],
                    recommendations: ['Synthetic recommendation'],
                    candidateRules: ['Synthetic rule'],
                    maxFavorableExcursionPct: 3.1,
                    maxAdverseExcursionPct: -8.4,
                }),
                Date.now() - 20_000
            );

            db.prepare(`
                INSERT INTO simulated_trades (
                    token_mint,
                    token_symbol,
                    entry_time,
                    entry_price,
                    entry_amount,
                    exit_time,
                    exit_price,
                    pnl_sol,
                    pnl_percent,
                    confidence,
                    status,
                    reason,
                    postmortem_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                pendingMint,
                'PMP',
                Date.now() - 15_000,
                0.00000004,
                0.005,
                Date.now() - 5_000,
                0.00000002,
                -0.0015,
                -30,
                68,
                'CLOSED_SL',
                'Stop triggered',
                'PENDING'
            );

            const [summaryRes, listRes] = await Promise.all([
                request(app)
                    .get('/api/agent/postmortem-summary')
                    .set('Authorization', `Bearer ${mockToken}`),
                request(app)
                    .get('/api/agent/postmortems?limit=50')
                    .set('Authorization', `Bearer ${mockToken}`),
            ]);

            expect(summaryRes.status).toBe(200);
            expect(summaryRes.body.eligibleTrades).toBeGreaterThanOrEqual(2);
            expect(summaryRes.body.pending).toBeGreaterThanOrEqual(1);
            expect(summaryRes.body.done).toBeGreaterThanOrEqual(1);
            expect(summaryRes.body.anomalousEligible).toBeGreaterThanOrEqual(1);
            expect(Array.isArray(summaryRes.body.rootCauses)).toBe(true);
            expect(summaryRes.body.rootCauses.some((cause: any) => cause.code === uniqueRootCause)).toBe(true);

            expect(listRes.status).toBe(200);
            expect(Array.isArray(listRes.body)).toBe(true);
            const autopsy = listRes.body.find((row: any) => row.tokenMint === doneMint);
            expect(autopsy).toBeDefined();
            expect(autopsy.postMortemStatus).toBe('DONE');
            expect(autopsy.postMortemSummary).toBe('Synthetic summary for API integration test');
            expect(autopsy.postMortemReport?.rootCause?.code).toBe(uniqueRootCause);
        } finally {
            db.prepare('DELETE FROM simulated_trades WHERE token_mint IN (?, ?)').run(doneMint, pendingMint);
        }
    });

    it('GET /api/pl-history should stay aligned with simulation metrics in simulation mode', async () => {
        const [historyRes, simStatusRes] = await Promise.all([
            request(app)
                .get('/api/pl-history')
                .set('Authorization', `Bearer ${mockToken}`),
            request(app)
                .get('/api/simulation/status')
                .set('Authorization', `Bearer ${mockToken}`),
        ]);

        expect(historyRes.status).toBe(200);
        expect(simStatusRes.status).toBe(200);
        expect(Array.isArray(historyRes.body.plValues)).toBe(true);

        const expectedTotalPnL = Number(simStatusRes.body?.metrics?.totalPnL || 0);
        const historyValues = historyRes.body.plValues as number[];

        if (historyValues.length === 0) {
            expect(expectedTotalPnL).toBe(0);
            return;
        }

        const lastHistoryPoint = Number(historyValues[historyValues.length - 1] || 0);
        expect(lastHistoryPoint).toBeCloseTo(expectedTotalPnL, 4);
    });

    it('GET /api/agent/stats should return agent configuration', async () => {
        const res = await request(app)
            .get('/api/agent/stats')
            .set('Authorization', `Bearer ${mockToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('mode');
    });

    it('GET /api/bot-health should return health status', async () => {
        const res = await request(app)
            .get('/api/bot-health')
            .set('Authorization', `Bearer ${mockToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('grpcTransfers');
        expect(res.body).toHaveProperty('runtimeWarnings');
    });

    it('GET /api/me/account should return account info and wallets', async () => {
        const res = await request(app)
            .get('/api/me/account')
            .set('Authorization', `Bearer ${mockToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('user');
        expect(res.body.user).toHaveProperty('email', adminEmail);
        expect(res.body).toHaveProperty('wallets');
        expect(Array.isArray(res.body.wallets)).toBe(true);
        expect(res.body).toHaveProperty('permissions');
    });

    it('GET /api/me/* endpoints should return scoped payloads', async () => {
        const [statsRes, positionsRes, tradesRes, configRes] = await Promise.all([
            request(app).get('/api/me/stats').set('Authorization', `Bearer ${mockToken}`),
            request(app).get('/api/me/positions').set('Authorization', `Bearer ${mockToken}`),
            request(app).get('/api/me/trades').set('Authorization', `Bearer ${mockToken}`),
            request(app).get('/api/me/trading-config').set('Authorization', `Bearer ${mockToken}`),
        ]);

        expect(statsRes.status).toBe(200);
        expect(statsRes.body).toHaveProperty('totalPositions');

        expect(positionsRes.status).toBe(200);
        expect(Array.isArray(positionsRes.body)).toBe(true);

        expect(tradesRes.status).toBe(200);
        expect(Array.isArray(tradesRes.body)).toBe(true);

        expect(configRes.status).toBe(200);
        expect(configRes.body).toHaveProperty('buyAmountSol');
    });

    it('GET /api/admin/overview should return admin summary', async () => {
        const res = await request(app)
            .get('/api/admin/overview')
            .set('Authorization', `Bearer ${mockToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('summary');
        expect(res.body.summary).toHaveProperty('totalUsers');
        expect(res.body).toHaveProperty('users');
        expect(res.body).toHaveProperty('wallets');
        expect(Array.isArray(res.body.users)).toBe(true);
        expect(Array.isArray(res.body.wallets)).toBe(true);
    });

    it('POST /api/admin/users should create a user allowlist entry', async () => {
        const email = uniqueEmail("new.user");
        const res = await request(app)
            .post('/api/admin/users')
            .set('Authorization', `Bearer ${mockToken}`)
            .send({ email, name: "New User", role: "USER", status: "ACTIVE" });
        expect([200, 201]).toContain(res.status);
        expect(res.body).toHaveProperty('email', email);
    });

    it('PATCH /api/admin/users/:id/status should update status', async () => {
        const email = uniqueEmail("status.user");
        const created = await request(app)
            .post('/api/admin/users')
            .set('Authorization', `Bearer ${mockToken}`)
            .send({ email, name: "Status User" });
        const userId = created.body?.id;
        const res = await request(app)
            .patch(`/api/admin/users/${userId}/status`)
            .set('Authorization', `Bearer ${mockToken}`)
            .send({ status: "SUSPENDED" });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'SUSPENDED');
    });

    it('DELETE /api/admin/users/:id should remove a managed user', async () => {
        const email = uniqueEmail("delete.user");
        const created = await request(app)
            .post('/api/admin/users')
            .set('Authorization', `Bearer ${mockToken}`)
            .send({ email, name: "Delete User" });

        const userId = created.body?.id;
        expect(userId).toBeTruthy();

        const deleted = await request(app)
            .delete(`/api/admin/users/${userId}`)
            .set('Authorization', `Bearer ${mockToken}`);

        expect(deleted.status).toBe(200);
        expect(deleted.body).toHaveProperty('success', true);
        expect(deleted.body.user).toHaveProperty('email', email);

        const users = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${mockToken}`);

        expect(users.status).toBe(200);
        expect(users.body.find((user: any) => user.id === userId)).toBeUndefined();
    });

    it('POST /api/wallet/new and POST /api/wallet/select/:id should manage admin wallets', async () => {
        const created = await request(app)
            .post('/api/wallet/new')
            .set('Authorization', `Bearer ${mockToken}`)
            .send({ label: 'Ops Wallet' });

        expect(created.status).toBe(201);
        expect(created.body).toHaveProperty('label', 'Ops Wallet');
        expect(created.body).toHaveProperty('publicKey');
        expect(created.body).toHaveProperty('secretBase58');

        const walletId = created.body?.id;
        expect(walletId).toBeTruthy();

        const accountAfterCreate = await request(app)
            .get('/api/me/account')
            .set('Authorization', `Bearer ${mockToken}`);

        expect(accountAfterCreate.status).toBe(200);
        expect(accountAfterCreate.body.wallets.some((wallet: any) => wallet.id === walletId)).toBe(true);

        const selected = await request(app)
            .post(`/api/wallet/select/${walletId}`)
            .set('Authorization', `Bearer ${mockToken}`);

        expect(selected.status).toBe(200);
        expect(selected.body.wallet).toHaveProperty('id', walletId);
        expect(selected.body.wallet).toHaveProperty('isDefault', true);

        const exported = await request(app)
            .get(`/api/wallet/export?walletId=${walletId}`)
            .set('Authorization', `Bearer ${mockToken}`);

        expect(exported.status).toBe(200);
        expect(exported.body).toHaveProperty('publicKey', created.body.publicKey);
        expect(exported.body).toHaveProperty('secretBase58');
    });
});
