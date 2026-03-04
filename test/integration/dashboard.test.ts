import request from 'supertest';
import { app } from '../../dashboard/server';

describe('Dashboard API Integration Tests', () => {
    it('GET /api/stats should return basic stats', async () => {
        const res = await request(app).get('/api/stats');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('totalPositions');
        expect(res.body).toHaveProperty('activePositions');
    });

    it('GET /api/simulation/trades should return trade history', async () => {
        const res = await request(app).get('/api/simulation/trades');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/agent/stats should return agent configuration', async () => {
        const res = await request(app).get('/api/agent/stats');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('mode');
    });

    it('GET /api/bot-health should return health status', async () => {
        const res = await request(app).get('/api/bot-health');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status');
    });
});
