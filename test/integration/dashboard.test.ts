import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../dashboard-api/server';

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const mockToken = jwt.sign({ email: "test@example.com", name: "Test User" }, JWT_SECRET);

describe('Dashboard API Integration Tests', () => {
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
    });
});
