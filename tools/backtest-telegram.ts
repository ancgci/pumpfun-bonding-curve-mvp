import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Configuration from .env
const TAKE_PROFIT_PERCENT = parseInt(process.env.TAKE_PROFIT_PERCENT || '100', 10);
const STOP_LOSS_PERCENT = parseInt(process.env.STOP_LOSS_PERCENT || '30', 10);
const BUY_AMOUNT_SOL = parseFloat(process.env.BUY_AMOUNT_SOL || '0.05');

interface Alert {
    timestamp: number;
    message: string;
    mint: string | null;
}

interface PriceData {
    timestamp: number;
    price: number;
}

interface TradeResult {
    mint: string;
    entryTime: number;
    entryPrice: number;
    exitTime: number | null;
    exitPrice: number | null;
    exitReason: 'TP' | 'SL' | 'ONGOING' | 'NO_DATA';
    profitLoss: number;
    profitLossPercent: number;
}

/**
 * Load alerts from JSONL file
 */
function loadAlerts(periodHours?: number): Alert[] {
    const logPath = path.join(__dirname, '..', 'data', 'telegram-alerts.jsonl');

    if (!fs.existsSync(logPath)) {
        console.log('⚠️ No alerts file found at', logPath);
        console.log('💡 The bot will create this file when it sends Telegram alerts');
        return [];
    }

    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);

    let alerts: Alert[] = lines.map(line => JSON.parse(line));

    // Filter by period if specified
    if (periodHours) {
        const cutoffTime = Date.now() - (periodHours * 60 * 60 * 1000);
        alerts = alerts.filter(a => a.timestamp >= cutoffTime);
    }

    return alerts.filter(a => a.mint); // Only alerts with valid mint
}

/**
 * Fetch price history from DexScreener API
 */
async function fetchPriceHistory(mint: string, fromTimestamp: number): Promise<PriceData[]> {
    try {
        // DexScreener API doesn't provide historical OHLCV directly
        // We'll use current price as a fallback for now
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
            timeout: 5000
        });

        if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
            return [];
        }

        // Get current price from the first pair
        const pair = response.data.pairs[0];
        const currentPrice = parseFloat(pair.priceUsd) / 100; // Convert to SOL estimate

        // For now, return current price as snapshot
        // TODO: Integrate Birdeye or similar API for historical data
        return [{
            timestamp: Date.now(),
            price: currentPrice
        }];
    } catch (error: any) {
        console.log(`❌ Failed to fetch price for ${mint}:`, error.message);
        return [];
    }
}

/**
 * Simulate a trade based on price history
 */
async function simulateTrade(alert: Alert): Promise<TradeResult> {
    const mint = alert.mint!;
    const entryTime = alert.timestamp;

    // Fetch price history
    const priceHistory = await fetchPriceHistory(mint, entryTime);

    if (priceHistory.length === 0) {
        return {
            mint,
            entryTime,
            entryPrice: 0,
            exitTime: null,
            exitPrice: null,
            exitReason: 'NO_DATA',
            profitLoss: 0,
            profitLossPercent: 0
        };
    }

    // For now, use current price as entry (simplified)
    // In full implementation, would use historical price at entryTime
    const entryPrice = priceHistory[0].price;
    const currentPrice = priceHistory[priceHistory.length - 1].price;

    // Calculate price change percentage
    const priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;

    // Determine exit
    let exitReason: 'TP' | 'SL' | 'ONGOING' = 'ONGOING';
    let exitPrice = currentPrice;
    let exitTime: number | null = null;

    if (priceChangePercent >= TAKE_PROFIT_PERCENT) {
        exitReason = 'TP';
        exitPrice = entryPrice * (1 + TAKE_PROFIT_PERCENT / 100);
        exitTime = Date.now(); // Simplified
    } else if (priceChangePercent <= -STOP_LOSS_PERCENT) {
        exitReason = 'SL';
        exitPrice = entryPrice * (1 - STOP_LOSS_PERCENT / 100);
        exitTime = Date.now(); // Simplified
    }

    // Calculate P&L
    const profitLossPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
    const profitLoss = BUY_AMOUNT_SOL * (profitLossPercent / 100);

    return {
        mint,
        entryTime,
        entryPrice,
        exitTime,
        exitPrice,
        exitReason,
        profitLoss,
        profitLossPercent
    };
}

/**
 * Generate backtest report
 */
function generateReport(results: TradeResult[]) {
    const wins = results.filter(r => r.exitReason === 'TP');
    const losses = results.filter(r => r.exitReason === 'SL');
    const ongoing = results.filter(r => r.exitReason === 'ONGOING');
    const noData = results.filter(r => r.exitReason === 'NO_DATA');

    const totalTrades = results.length;
    const winCount = wins.length;
    const lossCount = losses.length;
    const ongoingCount = ongoing.length;
    const noDataCount = noData.length;

    const winRate = totalTrades > 0 ? (winCount / (winCount + lossCount)) * 100 : 0;

    const grossProfit = wins.reduce((sum, r) => sum + r.profitLoss, 0);
    const grossLoss = losses.reduce((sum, r) => sum + r.profitLoss, 0);
    const netPL = grossProfit + grossLoss;

    const totalInvested = totalTrades * BUY_AMOUNT_SOL;
    const roi = totalInvested > 0 ? (netPL / totalInvested) * 100 : 0;

    const bestTrade = results.reduce((best, r) =>
        r.profitLoss > best.profitLoss ? r : best,
        results[0] || { profitLoss: 0, mint: 'N/A' }
    );

    const worstTrade = results.reduce((worst, r) =>
        r.profitLoss < worst.profitLoss ? r : worst,
        results[0] || { profitLoss: 0, mint: 'N/A' }
    );

    console.log('\n═══════════════════════════════════════');
    console.log('       📊 BACKTEST REPORT');
    console.log('═══════════════════════════════════════\n');

    console.log(`Configuration:`);
    console.log(`  Take Profit: ${TAKE_PROFIT_PERCENT}%`);
    console.log(`  Stop Loss: ${STOP_LOSS_PERCENT}%`);
    console.log(`  Position Size: ${BUY_AMOUNT_SOL} SOL\n`);

    console.log(`Total Alerts: ${totalTrades}`);
    console.log(`Total Invested: ${totalInvested.toFixed(4)} SOL\n`);

    console.log(`Results:`);
    console.log(`  ✅ Wins: ${winCount} (${winCount > 0 ? ((winCount / (winCount + lossCount)) * 100).toFixed(1) : '0'}%)`);
    console.log(`  ❌ Losses: ${lossCount} (${lossCount > 0 ? ((lossCount / (winCount + lossCount)) * 100).toFixed(1) : '0'}%)`);
    console.log(`  ⏳ Ongoing: ${ongoingCount}`);
    console.log(`  ⚠️ No Data: ${noDataCount}\n`);

    if (winCount + lossCount > 0) {
        console.log(`P&L:`);
        console.log(`  📈 Gross Profit: +${grossProfit.toFixed(4)} SOL (${winCount} trades)`);
        console.log(`  📉 Gross Loss: ${grossLoss.toFixed(4)} SOL (${lossCount} trades)`);
        console.log(`  💰 NET: ${netPL >= 0 ? '+' : ''}${netPL.toFixed(4)} SOL (${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%)\n`);

        if (bestTrade.mint !== 'N/A') {
            console.log(`Best Trade: ${bestTrade.mint.substring(0, 8)}... → ${bestTrade.profitLoss >= 0 ? '+' : ''}${bestTrade.profitLoss.toFixed(4)} SOL (${bestTrade.profitLossPercent >= 0 ? '+' : ''}${bestTrade.profitLossPercent.toFixed(1)}%)`);
        }
        if (worstTrade.mint !== 'N/A') {
            console.log(`Worst Trade: ${worstTrade.mint.substring(0, 8)}... → ${worstTrade.profitLoss >= 0 ? '+' : ''}${worstTrade.profitLoss.toFixed(4)} SOL (${worstTrade.profitLossPercent >= 0 ? '+' : ''}${worstTrade.profitLossPercent.toFixed(1)}%)`);
        }

        if (winCount > 0) {
            const avgWin = grossProfit / winCount;
            console.log(`\nAverage Win: +${avgWin.toFixed(4)} SOL`);
        }
        if (lossCount > 0) {
            const avgLoss = grossLoss / lossCount;
            console.log(`Average Loss: ${avgLoss.toFixed(4)} SOL`);
        }

        if (winCount > 0 && lossCount > 0) {
            const avgWin = grossProfit / winCount;
            const avgLoss = Math.abs(grossLoss / lossCount);
            const winLossRatio = avgWin / avgLoss;
            console.log(`Win/Loss Ratio: ${winLossRatio.toFixed(2)}:1`);
        }
    }

    console.log('\n═══════════════════════════════════════\n');

    if (noDataCount > 0) {
        console.log(`⚠️  Warning: ${noDataCount} alerts had no price data available`);
        console.log(`   This may affect accuracy of results\n`);
    }

    console.log(`💡 Note: This is a SIMULATION based on current prices`);
    console.log(`   Real trades would have different slippage and timing\n`);
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    let periodHours: number | undefined;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--period' && args[i + 1]) {
            const period = args[i + 1];
            if (period.endsWith('h')) {
                periodHours = parseInt(period);
            } else if (period.endsWith('d')) {
                periodHours = parseInt(period) * 24;
            }
        }
    }

    console.log('\n🔍 Loading Telegram alerts...');
    const alerts = loadAlerts(periodHours);

    if (alerts.length === 0) {
        console.log('\n⚠️  No alerts found!');
        console.log('   The bot will create alerts when it detects tokens');
        console.log('   Run the bot and wait for some Telegram notifications\n');
        return;
    }

    console.log(`✅ Found ${alerts.length} alerts${periodHours ? ` (last ${periodHours}h)` : ''}`);
    console.log('\n📊 Simulating trades...');

    const results: TradeResult[] = [];

    for (let i = 0; i < alerts.length; i++) {
        const alert = alerts[i];
        process.stdout.write(`\r  Progress: ${i + 1}/${alerts.length}`);

        const result = await simulateTrade(alert);
        results.push(result);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\r  Progress: Complete!     \n');

    generateReport(results);
}

// Run
main().catch(console.error);
