#!/bin/bash

# 🧪 LOCAL TEST SCRIPT - Verificar configuração TA V2
# Este script testa se os filtros estão funcionando corretamente
# com a nova ta-config.json (SOFT MODE)

set -e

PROJECT_ROOT="/home/srant/projects/pumpfun-bonding-curve-Test"
cd "$PROJECT_ROOT"

echo "════════════════════════════════════════════════════════════"
echo "🧪 TESTE LOCAL - Validação de ta-config.json (SOFT MODE)"
echo "════════════════════════════════════════════════════════════"
echo ""

# Verificar se ta-config.json existe
echo "📋 [STEP 1] Verificar se ta-config.json foi criado..."
if [ -f "data/ta-config.json" ]; then
    echo "✅ Arquivo encontrado!"
    echo ""
    echo "📊 Conteúdo do ta-config.json:"
    cat data/ta-config.json | jq '.' 2>/dev/null || cat data/ta-config.json
else
    echo "❌ ERRO: data/ta-config.json NÃO ENCONTRADO!"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 [STEP 2] Comparar: DEFAULTS vs SOFT MODE"
echo "════════════════════════════════════════════════════════════"

cat > /tmp/compare-config.js << 'EOF'
const fs = require('fs');
const path = require('path');

// Defaults
const DEFAULT_TA_CONFIG = {
    scoreMinimo: 55,
    rsiBullishMin: 55,
    rsiBullishMax: 80,
    rsiOverboughtBlock: 82,
    atrMinPct: 0.05,
    atrMaxPct: 5.0,
    maxDistVWAPPct: 3.0,
    candleStretchMultiplier: 2.5,
    minOrganicScore: 50,
    maxLegsWithoutPullback: 2,
    maxConsecutiveStops: 3,
    consecutiveStopPauseMs: 60000,
    adaptiveOrganicEnabled: false,
    volumeRelativeMin: 1.5,
    sustainCandles: 3,
};

// Soft Mode
const softMode = JSON.parse(fs.readFileSync('/home/srant/projects/pumpfun-bonding-curve-Test/data/ta-config.json', 'utf8'));

console.log("\n┌─────────────────────────────────────────────────────────────┐");
console.log("│ COMPARAÇÃO: DEFAULT vs SOFT MODE                          │");
console.log("└─────────────────────────────────────────────────────────────┘\n");

const keys = Object.keys(DEFAULT_TA_CONFIG);
let improvements = 0;
let differences = 0;

keys.forEach(key => {
    const def = DEFAULT_TA_CONFIG[key];
    const soft = softMode[key] !== undefined ? softMode[key] : def;
    
    if (def !== soft) {
        differences++;
        
        // Determine if it's an improvement (more permissive)
        let isImprovement = false;
        let percentage = 0;
        
        if (typeof def === 'number' && typeof soft === 'number') {
            if (key.includes('Min') || key.includes('max')) {
                // Lower=more permissive for Mins, higher=more permissive for Maxs
                isImprovement = (key.includes('Min') && soft < def) || (key.includes('Max') && soft > def);
                if (def !== 0) {
                    percentage = ((soft - def) / def * 100).toFixed(1);
                }
            }
        } else if (typeof def === 'boolean' && typeof soft === 'boolean') {
            isImprovement = !def && soft;
        }
        
        const icon = isImprovement ? '✅' : '❌';
        const change = percentage !== 0 ? ` (${percentage > 0 ? '+' : ''}${percentage}%)` : '';
        
        console.log(`${icon} ${key.padEnd(30)} DEFAULT: ${String(def).padEnd(10)} → SOFT: ${soft}${change}`);
        
        if (isImprovement) improvements++;
    }
});

console.log(`\n📊 Total de mudanças: ${differences}`);
console.log(`✅ Melhorias (mais permissivas): ${improvements}`);
console.log(`\n🎯 Expectativa: Bot vai rejeitar ~50-60% dos tokens vs ~95% antes\n`);
EOF

node /tmp/compare-config.js

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🔍 [STEP 3] Validar TypeScript e importação"
echo "════════════════════════════════════════════════════════════"
echo ""

# Criar pequeno teste de import
cat > /tmp/test-config.ts << 'EOF'
import { getTAConfig, loadTAConfig } from './utils/technicalConfig';

const config = getTAConfig();

console.log('✅ Config carregado com sucesso!');
console.log(`   scoreMinimo: ${config.scoreMinimo} (esperado: 40)`);
console.log(`   atrMinPct: ${config.atrMinPct}% (esperado: 0.02)`);
console.log(`   minOrganicScore: ${config.minOrganicScore} (esperado: 35)`);
console.log(`   adaptiveOrganicEnabled: ${config.adaptiveOrganicEnabled} (esperado: true)`);

// Validação
const tests = [
    ['scoreMinimo === 40', config.scoreMinimo === 40],
    ['atrMinPct === 0.02', config.atrMinPct === 0.02],
    ['minOrganicScore === 35', config.minOrganicScore === 35],
    ['adaptiveOrganicEnabled === true', config.adaptiveOrganicEnabled === true],
];

let passed = 0;
let failed = 0;

tests.forEach(([name, result]) => {
    if (result) {
        console.log(`  ✅ ${name}`);
        passed++;
    } else {
        console.log(`  ❌ ${name}`);
        failed++;
    }
});

console.log(`\n📊 Testes: ${passed}/${tests.length} passaram`);

if (failed > 0) {
    process.exit(1);
}
EOF

echo "Compilando e testando import..."
npx ts-node /tmp/test-config.ts

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📈 [STEP 4] Simulação de Scores com SOFT MODE"
echo "════════════════════════════════════════════════════════════"
echo ""

cat > /tmp/simulate-scores.ts << 'EOF'
import { getTAConfig } from './utils/technicalConfig';

const config = getTAConfig();

console.log('🧪 Simulando cenários de score com SOFT MODE:\n');

// Cenários típicos em PUMP.FUN
const scenarios = [
    {
        name: 'Token NOVO (< 30s)',
        score: 18,
        description: 'Poucas velas, sem EMAs alinhadas, sem volume confirmado'
    },
    {
        name: 'Token em EARLY HYPE (1-2 min)',
        score: 35,
        description: 'EMA começando alinhar, volume burst, mas ainda instável'
    },
    {
        name: 'Token em EARLY SPIKE (5 min)',
        score: 52,
        description: 'EMAs alinhadas, MACD positivo, volume crescendo'
    },
    {
        name: 'Token em BULLRUN (10+ min)',
        score: 72,
        description: 'Confluência total, breakout confirmado, pulling back slightly'
    }
];

console.log(`Current thresholds:\n`);
console.log(`  ✓ scoreMinimo (entrada): ${config.scoreMinimo}`);
console.log(`  ✓ scoreSizingMid: ${config.scoreSizingMid}`);
console.log(`  ✓ scoreSizingMax: ${config.scoreSizingMax}\n`);

scenarios.forEach(s => {
    const passMinimo = s.score >= config.scoreMinimo;
    const passLLM = true; // LLM pode ter sua própria lógica
    
    const icon = passMinimo ? '✅' : '⚠️';
    const status = passMinimo ? 'SERÁ ENVIADO ao LLM' : 'SERÁ REJEITADO (Score baixo)';
    const sizing = s.score >= config.scoreSizingMax ? '100%' :
                   s.score >= config.scoreSizingMid ? '75%' : '50%';
    
    console.log(`${icon} ${s.name}`);
    console.log(`   Score: ${s.score}/${100} → ${status}`);
    console.log(`   Sizing: ${sizing}`);
    console.log(`   Nota: ${s.description}\n`);
});

console.log('═══════════════════════════════════════════════════════════');
console.log('🎯 CRITICAL: Mesmo que score seja baixo (<40), LLM + RiskAgent');
console.log('   ainda podem DECIDIR se compra ou não baseado em confiança.');
console.log('   O novo ta-config.json APENAS deixa o LLM ter uma chance!');
console.log('═══════════════════════════════════════════════════════════\n');
EOF

npx ts-node /tmp/simulate-scores.ts

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ TESTE LOCAL COMPLETO"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Resumo:"
echo "  ✅ ta-config.json validado"
echo "  ✅ TypeScript compila sem erros"
echo "  ✅ Config carrega corretamente em runtime"
echo "  ✅ Thresholds estão em SOFT MODE"
echo ""
echo "🚀 PRÓXIMO PASSO:"
echo "  1. Revisão local: verifique os logs se houver"
echo "  2. Aprovação: se tudo OK, faça git commit"
echo "  3. Deploy: execute ./deploy/deploy.sh na VPS"
echo "  4. Monitorar: acompanhe os logs por 30-60 min"
echo ""
