"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const args = process.argv.slice(2);
const config = {
    takeProfit: parseArgument('--tp', 40),
    stopLoss: parseArgument('--sl', 25),
    numTrades: parseArgument('--trades', 100),
};
console.log('\n📊 BACKTESTER - Simulação de Estratégia\n');
console.log('='.repeat(50));
console.log(`Configuração:`);
console.log(`  Take Profit: ${config.takeProfit}%`);
console.log(`  Stop Loss: ${config.stopLoss}%`);
console.log(`  Número de Trades: ${config.numTrades}`);
console.log('='.repeat(50));
console.log('');
const results = simulateTrades(config.numTrades, config.takeProfit, config.stopLoss);
console.log('📈 RESULTADOS:\n');
console.log(`Total de Trades: ${results.total}`);
console.log(`Vitórias: ${results.wins} (${results.winRate.toFixed(1)}%)`);
console.log(`Perdas: ${results.losses} (${results.lossRate.toFixed(1)}%)`);
console.log('');
console.log(`💰 P&L Total: ${results.totalPL > 0 ? '+' : ''}${results.totalPL.toFixed(4)} SOL`);
console.log(`Média de Ganho: +${results.avgWin.toFixed(4)} SOL`);
console.log(`Média de Perda: -${results.avgLoss.toFixed(4)} SOL`);
console.log('');
console.log(`📊 Métricas:`);
console.log(`  Max Drawdown: ${results.maxDrawdown.toFixed(4)} SOL`);
console.log(`  Sharpe Ratio: ${results.sharpeRatio.toFixed(2)}`);
console.log(`  Profit Factor: ${results.profitFactor.toFixed(2)}`);
console.log('');
if (results.totalPL > 0) {
    console.log('✅ Estratégia LUCRATIVA com esses parâmetros!');
}
else {
    console.log('❌ Estratégia PERDEDORA - tente outros parâmetros.');
}
console.log('\n' + '='.repeat(50) + '\n');
function parseArgument(flag, defaultValue) {
    const arg = args.find(a => a.startsWith(flag));
    if (!arg)
        return defaultValue;
    const value = parseFloat(arg.split('=')[1]);
    return isNaN(value) ? defaultValue : value;
}
function simulateTrades(numTrades, takeProfit, stopLoss) {
    let wins = 0;
    let losses = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    let balance = 0;
    let maxBalance = 0;
    let maxDrawdown = 0;
    const returns = [];
    for (let i = 0; i < numTrades; i++) {
        const priceChange = simulatePriceChange();
        const investmentSize = 0.05;
        if (priceChange >= takeProfit) {
            const profit = investmentSize * (takeProfit / 100);
            wins++;
            totalProfit += profit;
            balance += profit;
            returns.push(profit);
        }
        else if (priceChange <= -stopLoss) {
            const loss = investmentSize * (stopLoss / 100);
            losses++;
            totalLoss += loss;
            balance -= loss;
            returns.push(-loss);
        }
        else {
            const result = Math.random() > 0.5 ? 0.001 : -0.001;
            balance += result;
            returns.push(result);
            if (result > 0)
                wins++;
            else
                losses++;
        }
        if (balance > maxBalance) {
            maxBalance = balance;
        }
        const currentDrawdown = maxBalance - balance;
        if (currentDrawdown > maxDrawdown) {
            maxDrawdown = currentDrawdown;
        }
    }
    const winRate = (wins / numTrades) * 100;
    const lossRate = (losses / numTrades) * 100;
    const avgWin = wins > 0 ? totalProfit / wins : 0;
    const avgLoss = losses > 0 ? totalLoss / losses : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit;
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
    return {
        total: numTrades,
        wins,
        losses,
        winRate,
        lossRate,
        totalPL: balance,
        avgWin,
        avgLoss,
        maxDrawdown,
        sharpeRatio,
        profitFactor,
    };
}
function simulatePriceChange() {
    const isWinningTrade = Math.random() < 0.6;
    if (isWinningTrade) {
        return Math.random() * 100;
    }
    else {
        return -Math.random() * 50;
    }
}
//# sourceMappingURL=backtester.js.map