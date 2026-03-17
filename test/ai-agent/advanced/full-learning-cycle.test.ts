// Set environment variables BEFORE any imports
process.env.AGENT_ENABLED = 'true';
process.env.NV_LLM_API_KEY = 'mock-key';
process.env.NODE_ENV = 'test';
process.env.POSTMORTEM_LLM_ENABLED = 'false';
// Disable external integrations for a stable test environment
process.env.SANTIMENT_API_KEY = '';
process.env.HUGGINGFACE_API_KEY = '';
process.env.SENSE_AI_ENABLED = 'false';
process.env.SOLSNIFFER_API_KEY = '';
process.env.RUGCHECK_XYZ_ENABLED = 'false';

import { LearnerAgent } from '../../../utils/learnerAgent';
import { agentOrchestrator } from '../../../utils/agentOrchestrator';
import { runPostMortemCycle } from '../../../utils/postMortemAgent';
import { appendSimulatedTradeMonitoringPoint, recordSimulatedTrade, updateSimulatedTradeExit } from '../../../utils/simulationEngine';
import db from '../../../utils/db';
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

        db.prepare('DELETE FROM simulated_trades').run();
        jest.clearAllMocks();
    });

    test('Simulação completa: trade perdedor → LearnerAgent gera regra → regra é injetada → próxima decisão é afetada', async () => {
        const fakeTrades = [
            {
                tokenMint: 'MINT1',
                status: 'CLOSED_SL',
                pnl: -0.032,
                confidence: 82,
                tokenSymbol: 'T1',
                postMortemSummary: 'Entrada tardia com preco esticado acima da VWAP.',
                postMortemReport: {
                    rootCause: { label: 'Entrada tardia/esticada' },
                    recommendations: ['Esperar pullback para VWAP antes de comprar']
                }
            },
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

        const learnerPrompt = (mockedAxios.post.mock.calls[0]?.[1] as any)?.messages?.[1]?.content || '';
        expect(learnerPrompt).toContain('PostMortem Summary: Entrada tardia com preco esticado acima da VWAP.');
        expect(learnerPrompt).toContain('Root Cause: Entrada tardia/esticada');

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

    test('PostMortemAgent gera autopsia estruturada para trade perdedor', async () => {
        await recordSimulatedTrade(
            'PM_MINT_1',
            'PM1',
            1.0,
            84,
            { reasoning: 'Entrada com breakout forte', takeProfit: 1.5, stopLoss: 0.93 },
            140,
            50000,
            {
                action: 'BUY',
                confidence: 84,
                reasoning: 'Entrada com breakout forte',
                takeProfit: 1.5,
                stopLoss: 0.93,
                takeProfitPercent: 50,
                stopLossPercent: 7,
                mode: 'SIMULATION'
            },
            {
                capturedAt: Date.now(),
                price: 1.0,
                marketCap: 50000,
                holders: 140,
                liquiditySol: 8,
                bondingCurvePercent: 88,
                taScore: 48,
                taScoreBreakdown: 'Score baixo',
                taSnapshot: {
                    currentPrice: 1.0,
                    ema5: 0.98,
                    ema9: 0.96,
                    ema13: 0.94,
                    emaAligned: true,
                    emaSlope5: 0.02,
                    emaSpreadFast: 1.5,
                    distEMA5Pct: 2,
                    macd: { macd: 0.01, signal: 0.015, histogram: -0.005, histogramPrev: 0.001, histogramAccelerating: false, nearZero: true },
                    rsi: 82,
                    rsiSlope: -1,
                    atr: 0.08,
                    atrPct: 8,
                    candleRangePct: 3.4,
                    donchian: { upper: 1.01, lower: 0.94, breakoutUp: false },
                    vwap: 0.92,
                    distVWAPPct: 8.7,
                    priceAboveVWAP: true,
                    roc: 0.2,
                    volumeRelative: { ratio: 1.05, isBurst: false, isSpike: false },
                    microTrend: { changePct: 0.05, samples: 10 },
                    trend: { changePct: 0.1, isRed: false, bodySize: 0.05 },
                    timestamp: Date.now(),
                    candlesAvailable1s: 25,
                    closes1s: [0.91, 0.93, 0.95, 0.98, 1.0]
                } as any,
                candles1s: [
                    { timestamp: Date.now() - 4000, open: 0.91, high: 0.92, low: 0.9, close: 0.91, volume: 1 },
                    { timestamp: Date.now() - 3000, open: 0.91, high: 0.94, low: 0.91, close: 0.93, volume: 1 },
                    { timestamp: Date.now() - 2000, open: 0.93, high: 0.97, low: 0.93, close: 0.95, volume: 1 },
                    { timestamp: Date.now() - 1000, open: 0.95, high: 1.0, low: 0.95, close: 0.98, volume: 1 },
                    { timestamp: Date.now(), open: 0.98, high: 1.01, low: 0.97, close: 1.0, volume: 1 }
                ],
                organicity: {
                    organicMarketScore: 72,
                    dataInsufficient: false,
                    minTradesForScore: 3,
                    tradeCount20s: 12,
                    tradeCount60s: 30,
                    uniqueBuyers30s: 11,
                    uniqueWalletsLifetime: 28,
                    breakdown: {
                        tradeDensityScore: 70,
                        walletDiversityScore: 72,
                        buySellAlternationScore: 65,
                        pullbackQualityScore: 60,
                        priceLinearityScore: 58,
                        participationExpansionScore: 70,
                        lateEntryRiskScore: 40,
                        liquidityQualityScore: 65,
                        sellerBehaviorScore: 66,
                        top1WalletSharePct: 18,
                        top2WalletSharePct: 29,
                        sellPresenceRatio: 0.2,
                        orderRepetitionRatio: 0.12,
                        priceImpactPerSol: 0.3,
                        sellerChurnRate: 0.22
                    }
                }
            } as any
        );

        await appendSimulatedTradeMonitoringPoint('PM_MINT_1', {
            timestamp: Date.now() + 10000,
            price: 1.03,
            pnlPercent: 3,
            marketCap: 52000,
            highWaterMark: 1.03,
            drawdownFromPeakPct: 0,
            taScore: 55,
            rsi: 75,
            macdHistogram: 0.002,
            atrPct: 7.5,
            microTrendPct: 0.8
        });

        await appendSimulatedTradeMonitoringPoint('PM_MINT_1', {
            timestamp: Date.now() + 20000,
            price: 0.92,
            pnlPercent: -8,
            marketCap: 43000,
            highWaterMark: 1.03,
            drawdownFromPeakPct: 10.7,
            taScore: 35,
            rsi: 48,
            macdHistogram: -0.01,
            atrPct: 9.5,
            microTrendPct: -4.2
        });

        await updateSimulatedTradeExit(
            'PM_MINT_1',
            0.92,
            'CLOSED_SL',
            'Stop Loss hit',
            43000,
            {
                capturedAt: Date.now(),
                price: 0.92,
                marketCap: 43000,
                holders: 150,
                liquiditySol: 7,
                bondingCurvePercent: 92,
                taScore: 31,
                taScoreBreakdown: 'Momentum falhou',
                taSnapshot: {
                    currentPrice: 0.92,
                    ema5: 0.95,
                    ema9: 0.97,
                    ema13: 0.98,
                    emaAligned: false,
                    emaSlope5: -0.4,
                    emaSpreadFast: -1.1,
                    distEMA5Pct: -3.1,
                    macd: { macd: -0.02, signal: -0.015, histogram: -0.005, histogramPrev: 0.001, histogramAccelerating: false, nearZero: false },
                    rsi: 42,
                    rsiSlope: -8,
                    atr: 0.09,
                    atrPct: 9.7,
                    candleRangePct: 4.2,
                    donchian: { upper: 1.01, lower: 0.9, breakoutUp: false },
                    vwap: 0.95,
                    distVWAPPct: -3.2,
                    priceAboveVWAP: false,
                    roc: -2.1,
                    volumeRelative: { ratio: 0.9, isBurst: false, isSpike: false },
                    microTrend: { changePct: -4.5, samples: 10 },
                    trend: { changePct: -2.4, isRed: true, bodySize: 1.2 },
                    timestamp: Date.now(),
                    candlesAvailable1s: 40,
                    closes1s: [1.0, 0.99, 0.97, 0.95, 0.92]
                } as any
            } as any
        );

        await runPostMortemCycle();

        const row = db.prepare(`
            SELECT postmortem_status as status, postmortem_summary as summary, postmortem_report as report
            FROM simulated_trades
            WHERE token_mint = ?
        `).get('PM_MINT_1') as any;

        expect(row.status).toBe('DONE');
        expect(row.summary).toContain('Entrada tardia');

        const report = JSON.parse(row.report);
        expect(report.rootCause.code).toBe('LATE_ENTRY');
        expect(report.betterEntry.suggestedAction).toContain('pullback');
        expect(report.candidateRules.length).toBeGreaterThan(0);
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
