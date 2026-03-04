import { rpcPool } from '../utils/rpcPool';
import { circuitBreaker } from '../utils/circuitBreaker';
import axios from 'axios';

async function runSmokeTest() {
    console.log('🧪 Smoke Test QA iniciado...');

    try {
        // 1. Check RPC
        const connection = await rpcPool.getBestConnection();
        console.log('✅ RPC Pool carregado:', connection.rpcEndpoint);

        // 2. Check Circuit Breaker
        const canTrade = circuitBreaker.canTrade();
        console.log('✅ Circuit Breaker OK. Can trade:', canTrade);

        // 3. Check Dashboard API (Internal Broadcast test)
        try {
            const res = await axios.get('http://localhost:3001/api/bot-health', { timeout: 2000 });
            console.log('✅ Dashboard API respondendo:', res.status);
        } catch (e) {
            console.log('⚠️  Dashboard offline (esperado se não iniciado), prosseguindo...');
        }

        console.log('✅ Smoke Test PASSED');
    } catch (e: any) {
        console.error('❌ Smoke Test FAILED:', e.message);
        process.exit(1);
    }
}

runSmokeTest();
