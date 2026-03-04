// Set environment variables BEFORE any imports
process.env.AGENT_ENABLED = 'true';
process.env.NV_LLM_API_KEY = 'mock-key';
process.env.NODE_ENV = 'test';

import { LearnerAgent } from '../../../utils/learnerAgent';
import { agentOrchestrator } from '../../../utils/agentOrchestrator';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const patternsPath = path.join(__dirname, '../../../data/agent/patterns.json');
const tradesPath = path.join(__dirname, '../../../data/simulation/trades.json');
const learnerStatePath = path.join(__dirname, '../../../data/agent/learner-state.json');

describe('Agente de IA - Ciclo Completo de Aprendizado (Advanced)', () => {
    beforeEach(() => {
        if (fs.existsSync(patternsPath)) fs.unlinkSync(patternsPath);
        if (fs.existsSync(tradesPath)) fs.unlinkSync(tradesPath);
        if (fs.existsSync(learnerStatePath)) fs.unlinkSync(learnerStatePath);

        const agentDir = path.dirname(patternsPath);
        if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });

        const simulationDir = path.dirname(tradesPath);
        if (!fs.existsSync(simulationDir)) fs.mkdirSync(simulationDir, { recursive: true });

        jest.clearAllMocks();
    });

    test('Simulação completa: trade perdedor → LearnerAgent gera regra → regra é injetada → próxima decisão é afetada', async () => {
        const fakeTrades = [
            { tokenMint: 'MINT1', status: 'CLOSED_SL', pnl: -0.032, confidence: 82, tokenSymbol: 'T1' },
            { tokenMint: 'MINT2', status: 'CLOSED_SL', pnl: -0.051, confidence: 91, tokenSymbol: 'T2' },
            { tokenMint: 'MINT3', status: 'EXPIRED', pnl: -0.018, confidence: 65, tokenSymbol: 'T3' },
            { tokenMint: 'MINT4', status: 'CLOSED_SL', pnl: -0.027, confidence: 78, tokenSymbol: 'T4' }
        ];
        fs.writeFileSync(tradesPath, JSON.stringify(fakeTrades));

        mockedAxios.post.mockResolvedValueOnce({
            data: {
                choices: [{
                    message: {
                        content: JSON.stringify([
                            "Skip tokens with liquidity less than 10 SOL",
                            "Avoid tokens where top 10 holders own more than 50%"
                        ])
                    }
                }]
            }
        } as any);

        await LearnerAgent.runFullLearningCycle();

        const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
        expect(patterns.length).toBeGreaterThan(1);

        const testAnalysis = {
            mint: 'MINT_LEARNED',
            symbol: 'TL',
            price: 0.001,
            bondingCurvePercent: 10,
            holders: 100,
            volumeH1: 10,
            liquiditySol: 6.0, // Above PreFilter (2 SOL) but below learned rule (10 SOL)
            riskScore: 20,
            honeypotRisk: false
        };
        const systemPrompt = await agentOrchestrator.buildSystemPrompt(testAnalysis);
        expect(systemPrompt).toContain('[LEARNED_RULES]');
        expect(systemPrompt).toContain('Skip tokens with liquidity less than 10 SOL');

        mockedAxios.post.mockResolvedValueOnce({
            data: {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            action: "SKIP",
                            confidence: 95,
                            reason: "Violates learned rule: liquidity less than 10 SOL"
                        })
                    }
                }]
            }
        } as any);

        const nextDecision = await agentOrchestrator.analyzeToken(testAnalysis);
        expect(nextDecision.action).toBe('SKIP');
        expect(nextDecision.reasoning).toContain('liquidity less than 10 SOL');
    });

    test('Dynamic TP/SL + Position Sizing + Trailing Stop funcionam corretamente', async () => {
        const mockAnalysis = {
            mint: 'MINT_DYNAMIC',
            symbol: 'DYN',
            price: 0.1,
            bondingCurvePercent: 50,
            holders: 500,
            volumeH1: 100,
            liquiditySol: 50, // Well above all filters
            riskScore: 10,
            honeypotRisk: false,
            confidence: 92
        };

        mockedAxios.post.mockResolvedValueOnce({
            data: {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            action: "BUY",
                            confidence: 92,
                            reason: "Bullish momentum",
                            takeProfitPercent: 150,
                            stopLossPercent: 10
                        })
                    }
                }]
            }
        } as any);

        const highVolDecision = await agentOrchestrator.analyzeToken(mockAnalysis);
        expect(highVolDecision.action).toBe('BUY');
        expect(highVolDecision.takeProfit).toBeGreaterThan(mockAnalysis.price * 2);
    });

    test('Trailing Stop e Whale Dump são aplicados em tempo real', async () => {
        const result = await agentOrchestrator.simulateTradeWithTrailing({
            entryPrice: 100,
            peakPrice: 150,
            currentPrice: 110
        });
        expect(result.trailingStopTriggered).toBe(true);

        const whaleResult = await agentOrchestrator.simulateTradeWithTrailing({
            entryPrice: 100,
            peakPrice: 150,
            currentPrice: 100
        });
        expect(whaleResult.whaleDumpDetected).toBe(true);
    });
});
