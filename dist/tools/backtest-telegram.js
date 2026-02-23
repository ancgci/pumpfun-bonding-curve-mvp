"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const TAKE_PROFIT_PERCENT = parseInt(process.env.TAKE_PROFIT_PERCENT || '100', 10);
const STOP_LOSS_PERCENT = parseInt(process.env.STOP_LOSS_PERCENT || '30', 10);
const BUY_AMOUNT_SOL = parseFloat(process.env.BUY_AMOUNT_SOL || '0.05');
function loadAlerts(periodHours) {
    const logPath = path.join(__dirname, '..', 'data', 'telegram-alerts.jsonl');
    if (!fs.existsSync(logPath)) {
        console.log('⚠️ No alerts file found at', logPath);
        console.log('💡 The bot will create this file when it sends Telegram alerts');
        return [];
    }
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line);
    let alerts = lines.map(line => JSON.parse(line));
    if (periodHours) {
        const cutoffTime = Date.now() - (periodHours * 60 * 60 * 1000);
        alerts = alerts.filter(a => a.timestamp >= cutoffTime);
    }
    return alerts.filter(a => a.mint);
}
async function fetchPriceHistory(mint, fromTimestamp) {
    try {
        const response = await axios_1.default.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
            timeout: 5000
        });
        if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
            return [];
        }
        const pair = response.data.pairs[0];
        const currentPrice = parseFloat(pair.priceUsd) / 100;
        return [{
                timestamp: Date.now(),
                price: currentPrice
            }];
    }
    catch (error) {
        console.log(`❌ Failed to fetch price for ${mint}:`, error.message);
        return [];
    }
}
async function simulateTrade(alert) {
    const mint = alert.mint;
    const entryTime = alert.timestamp;
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
    const entryPrice = priceHistory[0].price;
    const currentPrice = priceHistory[priceHistory.length - 1].price;
    const priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    let exitReason = 'ONGOING';
    let exitPrice = currentPrice;
    let exitTime = null;
    if (priceChangePercent >= TAKE_PROFIT_PERCENT) {
        exitReason = 'TP';
        exitPrice = entryPrice * (1 + TAKE_PROFIT_PERCENT / 100);
        exitTime = Date.now();
    }
    else if (priceChangePercent <= -STOP_LOSS_PERCENT) {
        exitReason = 'SL';
        exitPrice = entryPrice * (1 - STOP_LOSS_PERCENT / 100);
        exitTime = Date.now();
    }
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
function generateReport(results) {
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
    const bestTrade = results.reduce((best, r) => r.profitLoss > best.profitLoss ? r : best, results[0] || { profitLoss: 0, mint: 'N/A' });
    const worstTrade = results.reduce((worst, r) => r.profitLoss < worst.profitLoss ? r : worst, results[0] || { profitLoss: 0, mint: 'N/A' });
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
async function main() {
    const args = process.argv.slice(2);
    let periodHours;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--period' && args[i + 1]) {
            const period = args[i + 1];
            if (period.endsWith('h')) {
                periodHours = parseInt(period);
            }
            else if (period.endsWith('d')) {
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
    const results = [];
    for (let i = 0; i < alerts.length; i++) {
        const alert = alerts[i];
        process.stdout.write(`\r  Progress: ${i + 1}/${alerts.length}`);
        const result = await simulateTrade(alert);
        results.push(result);
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    console.log('\r  Progress: Complete!     \n');
    generateReport(results);
}
main().catch(console.error);
//# sourceMappingURL=backtest-telegram.js.map