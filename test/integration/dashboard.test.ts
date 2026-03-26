import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../dashboard-api/server';

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
