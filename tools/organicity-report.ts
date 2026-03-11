#!/usr/bin/env ts-node
/**
 * ORGANICITY SHADOW REPORT
 *
 * Relatório interativo de validação local da camada de organicidade.
 * Lê data/organicity-shadow.jsonl e data/organicity-shadow-stats.json.
 *
 * Uso:
 *   npm run organicity:report
 *   npm run organicity:report -- --last 50     (últimos 50 eventos)
 *   npm run organicity:report -- --fp           (somente falsos positivos candidatos)
 *   npm run organicity:report -- --clear        (resetar logs)
 */

import * as fs from "fs";
import * as path from "path";

const SHADOW_LOG_FILE = path.join(__dirname, "../data/organicity-shadow.jsonl");
const STATS_FILE = path.join(__dirname, "../data/organicity-shadow-stats.json");

const args = process.argv.slice(2);
const showLast = args.includes("--last") ? parseInt(args[args.indexOf("--last") + 1] || "30") : 30;
const fpOnly = args.includes("--fp");
const clearLogs = args.includes("--clear");

// ── CLEAR ────────────────────────────────────────────────────
if (clearLogs) {
    if (fs.existsSync(SHADOW_LOG_FILE)) fs.unlinkSync(SHADOW_LOG_FILE);
    if (fs.existsSync(STATS_FILE)) fs.unlinkSync(STATS_FILE);
    console.log("✅ Shadow logs cleared.");
    process.exit(0);
}

// ── LOAD DATA ─────────────────────────────────────────────────
let stats: any = null;
let events: any[] = [];

if (fs.existsSync(STATS_FILE)) {
    stats = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
}

if (fs.existsSync(SHADOW_LOG_FILE)) {
    const lines = fs.readFileSync(SHADOW_LOG_FILE, "utf-8")
        .trim()
        .split("\n")
        .filter(Boolean);
    events = lines.map(l => {
        try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
}

if (!stats && events.length === 0) {
    console.log("⚠️  Nenhum dado de shadow mode encontrado.");
    console.log("   1. Certifique-se que ORGANICITY_SHADOW_MODE=true no .env");
    console.log("   2. Inicie o bot: npm start");
    console.log("   3. Aguarde alguns tokens serem detectados");
    console.log("   4. Execute npm run organicity:report novamente");
    process.exit(0);
}

// ── SUMMARY ───────────────────────────────────────────────────
const divider = "═".repeat(70);
console.log("\n" + divider);
console.log("🔬  ORGANICITY SHADOW MODE — RELATÓRIO DE VALIDAÇÃO LOCAL");
console.log(divider);

if (stats) {
    const blockRate = stats.totalEvaluated > 0
        ? ((stats.totalWouldBlock / stats.totalEvaluated) * 100).toFixed(1)
        : "0.0";

    console.log(`\n📊  ESTATÍSTICAS GERAIS`);
    console.log(`   Total avaliados  : ${stats.totalEvaluated}`);
    console.log(`   Passariam        : ${stats.totalWouldPass} (${(100 - parseFloat(blockRate)).toFixed(1)}%)`);
    console.log(`   Seriam bloqueados: ${stats.totalWouldBlock} (${blockRate}%)  ← taxa de bloqueio`);
    console.log(`\n   OrganicScore médio : ${stats.avgOrganicScore.toFixed(1)}/100`);
    console.log(`   OrganicScore mín   : ${stats.minOrganicScore.toFixed(1)}`);
    console.log(`   OrganicScore máx   : ${stats.maxOrganicScore.toFixed(1)}`);
    console.log(`\n⚡  PERFORMANCE`);
    console.log(`   Latência média     : ${stats.avgLatencyMs.toFixed(2)} ms`);
    console.log(`   Amostras           : ${stats.latencySamples}`);
    console.log(`   Pico de memória    : ${stats.peakMemoryMB.toFixed(1)} MB`);
    console.log(`   Último update      : ${stats.lastUpdated}`);

    if (Object.keys(stats.hardBlockCounts).length > 0) {
        console.log(`\n🚫  BLOQUEIOS MAIS FREQUENTES`);
        const sorted = Object.entries(stats.hardBlockCounts)
            .sort(([, a]: any, [, b]: any) => b - a);
        for (const [code, count] of sorted) {
            const bar = "█".repeat(Math.min(Math.round((count as number / stats.totalWouldBlock) * 30), 30));
            console.log(`   ${code.padEnd(40)} ${String(count).padStart(4)}x  ${bar}`);
        }
    }
}

// ── EVENTS ─────────────────────────────────────────────────────
const filtered = fpOnly
    ? events.filter(e => e.wouldHaveBlocked && e.organicMarketScore >= 50) // alta pontuação mas hard block → possível FP
    : events;

const recent = filtered.slice(-showLast);

if (recent.length === 0) {
    console.log("\n✅  Nenhum evento " + (fpOnly ? "de falso positivo" : "") + " para exibir.");
} else {
    const title = fpOnly
        ? `\n⚠️  POSSÍVEIS FALSOS POSITIVOS — tokens bloqueados com score ≥ 50 (últimos ${showLast})`
        : `\n📋  ÚLTIMOS ${showLast} TOKENS AVALIADOS`;
    console.log(title);
    console.log("─".repeat(70));

    for (const e of recent) {
        const status = e.wouldHaveBlocked ? "🔴 BLOQUEADO" : "🟢 PASSOU";
        const ts = new Date(e.timestamp).toLocaleTimeString("pt-BR");
        console.log(`\n[${ts}] ${e.symbol} — ${status}  (Organic=${e.organicMarketScore}/100)`);
        console.log(`   Density=${e.tradeDensity_20s}t/20s  Buyers=${e.uniqueBuyers_30s}/30s  Wallets=${e.uniqueWallets_total}  Curve=${e.bondingCurvePercent.toFixed(1)}%`);
        console.log(`   Alt=${(e.alternationRatio * 100).toFixed(0)}%  Top1=${e.top1WalletSharePct.toFixed(0)}%  R²=${e.priceLinearityR2.toFixed(3)}`);
        if (e.hardBlocksTriggered?.length > 0) {
            console.log(`   🚫 Blocks: ${e.hardBlocksTriggered.join(", ")}`);
        }
        if (e.softBlocksTriggered?.length > 0) {
            console.log(`   ⚠️  Soft: ${e.softBlocksTriggered.join(", ")}`);
        }
    }
}

// ── RECOMENDAÇÕES ────────────────────────────────────────────
if (stats && stats.totalEvaluated >= 10) {
    const blockRate = (stats.totalWouldBlock / stats.totalEvaluated) * 100;
    console.log("\n" + divider);
    console.log("💡  ANÁLISE E RECOMENDAÇÕES");
    if (blockRate > 80) {
        console.log("   ⚠️  Taxa de bloqueio muito alta (>80%). Verificar se os thresholds estão muito restritivos.");
        console.log("   → Considerar aumentar minOrganicScore ou relaxar minTrades20s.");
    } else if (blockRate > 50) {
        console.log("   ✅ Taxa de bloqueio moderada (50-80%). Parece saudável — muitos tokens artificiais filtrados.");
    } else if (blockRate < 20) {
        console.log("   ⚠️  Taxa de bloqueio baixa (<20%). Pode estar deixando tokens artificiais passarem.");
        console.log("   → Revisar os logs individuais dos tokens bloqueados vs não-bloqueados.");
    } else {
        console.log("   ✅ Taxa de bloqueio dentro do esperado (20-50%).");
    }

    if (stats.avgLatencyMs > 5) {
        console.log(`   ⚠️  Latência média alta (${stats.avgLatencyMs.toFixed(2)}ms). Investigar gargalos.`);
    } else {
        console.log(`   ✅ Latência OK (${stats.avgLatencyMs.toFixed(2)}ms médio).`);
    }

    if (stats.peakMemoryMB > 500) {
        console.log(`   ⚠️  Pico de memória alto (${stats.peakMemoryMB.toFixed(0)}MB). Monitorar crescimento.`);
    } else {
        console.log(`   ✅ Memória OK (pico ${stats.peakMemoryMB.toFixed(0)}MB).`);
    }
}

console.log("\n" + divider + "\n");
