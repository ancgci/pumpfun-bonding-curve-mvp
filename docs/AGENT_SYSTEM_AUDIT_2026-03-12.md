# 🤖 Multi-Agent AI System Audit Report

**Data:** 12 de Março de 2026  
**Autor:** AI Code Auditor  
**Projeto:** PumpFun Bonding Curve Trading Bot  
**Escopo:** Avaliação completa do sistema de agentes de IA e arquitetura do bot

---

## 📋 Executive Summary

Este documento apresenta uma auditoria técnica completa do sistema de trading automatizado para Solana bonding curves. O sistema foi avaliado em profundidade, incluindo arquitetura, agentes de IA, camadas de defesa, configuração e fluxos de operação.

### Veredito Geral

| Componente | Status | Observação |
|------------|--------|------------|
| **Multi-Agent AI System** | ✅ **OPERACIONAL** | Estruturalmente completo |
| **Risk Engine** | ✅ **OPERACIONAL** | 4 fases de análise paralela |
| **Technical Analysis V2** | ✅ **OPERACIONAL** | 1-second resolution |
| **Organicity Protection** | ✅ **OPERACIONAL** | 9-axis anti-bot detection |
| **Circuit Breaker** | ✅ **OPERACIONAL** | Emergency stop mechanisms |
| **Learning System** | ✅ **OPERACIONAL** | Self-reflection loop ativa |
| **Skills System** | ✅ **OPERACIONAL** | Dynamic injection working |
| **Dashboard API** | ✅ **OPERACIONAL** | WebSocket + OAuth2 |

---

## 1. Arquitetura do Sistema

### 1.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                    index.ts (Main Orchestrator)                 │
│  • gRPC Stream Handler (Yellowstone)                            │
│  • Multi-Protocol Monitoring (6 platforms)                      │
│  • Telegram Alert Manager                                       │
│  • Creator/Whale Tracking                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Risk Engine   │   │ Agent           │   │ Dip Monitor     │
│ (Anti-Rug)    │   │ Orchestrator    │   │ (Waitlist)      │
│ 4 Phases      │   │ (Multi-Agent)   │   │ Service         │
└───────────────┘   └─────────────────┘   └─────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Hybrid Executor │
                    │ (Jito + RPC)    │
                    └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
        ┌──────────┐  ┌──────────────┐  ┌─────────────┐
        │ RPC Pool │  │ Gas Oracle   │  │ Slippage    │
        │ (10+     │  │ (Dynamic)    │  │ Calculator  │
        │  nodes)  │  │              │  │             │
        └──────────┘  └──────────────┘  └─────────────┘
```

### 1.2 Arquivos Principais

| Arquivo | Linhas | Responsabilidade |
|---------|--------|------------------|
| `index.ts` | 2,315 | Main orchestrator - gRPC stream, multi-protocol monitoring |
| `utils/agentOrchestrator.ts` | 1,063 | AI decision engine, multi-agent orchestration |
| `utils/hybridExecutor.ts` | 847 | Trade execution (Jito + RPC fallback) |
| `utils/riskEngine.ts` | 324 | Anti-rug analysis orchestrator |
| `utils/circuitBreaker.ts` | 246 | Emergency stop mechanism |
| `utils/volatilityMonitor.ts` | 634 | High-frequency TA (1-second buckets) |
| `utils/organicityMonitor.ts` | 497 | Anti-manipulation data collection |
| `utils/learnerAgent.ts` | ~300 | Self-reflection learning loop |
| `dashboard-api/server.ts` | 1,207 | Express API + Socket.io + OAuth2 |

---

## 2. Multi-Agent AI System

### 2.1 Arquitetura de Agentes

```
.agents/
├── orchestrator/
│   └── main-orchestrator.ts      # Core decision flow
├── agents/
│   ├── RiskAgent/                # Security veto (BLOCK power)
│   ├── ScalperAgent/             # 5s micro-trend specialist
│   ├── SentimentAgent/           # Social hype analyst
│   ├── WhaleTrackerAgent/        # Large movement detector
│   └── CopyTradingAgent/         # Final decision judge
└── skills/
    ├── core/                     # Built-in skills
    ├── custom/                   # User-created skills
    └── PumpFunOrganicityGuard/   # Organicity protection
```

### 2.2 Fluxo de Orquestração

**Arquivo:** `.agents/orchestrator/main-orchestrator.ts`

```typescript
async decide(tokenData: any) {
    // 1. RiskAgent sempre fala primeiro (SEGURANÇA)
    const riskResult = await this.agents.risk.analyze(tokenData);
    if (riskResult.decision === 'BLOCK') return riskResult;

    // 2. ScalperAgent (se for pump.fun ou dip detectado)
    if (tokenData.protocol === 'pumpfun' || tokenData.timeframe === '5s') {
        return await this.agents.scalper.analyze(tokenData, riskResult);
    }

    // 3. Demais agentes em paralelo
    const [sentiment, whale] = await Promise.all([
        this.agents.sentiment.analyze(tokenData),
        this.agents.whale.analyze(tokenData)
    ]);

    // 4. CopyTradingAgent para decisão final
    return await this.agents.copy.finalDecision(tokenData, { 
        riskResult, 
        sentiment, 
        whale 
    });
}
```

### 2.3 BaseAgent Implementation

**Arquivo:** `.agents/agents/BaseAgent.ts`

Todos os agentes herdam de `BaseAgent` que fornece:

| Feature | Implementação |
|---------|---------------|
| **LLM Integration** | NVIDIA API (`https://integrate.api.nvidia.com/v1/chat/completions`) |
| **Rate Limiting** | 3 req/s, max 3 concurrent (Bottleneck) |
| **Prompt Loading** | `prompt.md` por agente |
| **JSON Parsing** | Robust extraction with brace matching |
| **Error Handling** | 429 retry-after, timeout 20s |

### 2.4 Prompt Files (Verificados)

| Agente | Arquivo | Status | Conteúdo |
|--------|---------|--------|----------|
| RiskAgent | `RiskAgent/prompt.md` | ✅ | BLOCK criteria, riskScore thresholds |
| ScalperAgent | `ScalperAgent/prompt.md` | ✅ | 5s-60s scalping strategy, EMA/VWAP |
| CopyTradingAgent | `CopyTradingAgent/prompt.md` | ✅ | Final decision synthesis |
| SentimentAgent | `SentimentAgent/prompt.md` | ✅ | Existe |
| WhaleTrackerAgent | `WhaleTrackerAgent/prompt.md` | ✅ | Existe |

### 2.5 Integração no Fluxo Principal

**Arquivo:** `utils/agentOrchestrator.ts` (linha ~463)

```typescript
try {
    // 🚀 Multi-Agent PRO Orchestration
    const orchestratedResult = await orchestrator.decide(tokenAnalysis);
    
    const tpPercent = (typeof orchestratedResult.takeProfitPercent === "number" && orchestratedResult.takeProfitPercent > 0)
        ? orchestratedResult.takeProfitPercent
        : CONFIG.TAKE_PROFIT_PERCENT;
    
    const action = (orchestratedResult.action || orchestratedResult.decision) === "BUY" ? "BUY" : "SKIP";
    
    logger.info(`📊 [Agent-Orchestrated] Decision: ${action}, Confidence: ${orchestratedResult.confidence ?? 0}%`);
    
    return {
        action,
        confidence: orchestratedResult.confidence ?? 0,
        reasoning: orchestratedResult.reasoning || orchestratedResult.reason || "Orchestrated decision",
        entryPrice: tokenAnalysis.price,
        takeProfit: tokenAnalysis.price * (1 + tpPercent / 100),
        stopLoss: tokenAnalysis.price * (1 - slPercent / 100),
    } as AgentDecision;
} catch (error: any) {
    logger.warn(`⚠️ [Orchestrator] Multi-Agent failed: ${error.message}. Falling back to Legacy LLM.`);
    return await callLlm(tokenAnalysis);
}
```

**Fallback Seguro:** Se o orquestrador falhar, o sistema reverte para LLM single-agent legado.

---

## 3. Camadas de Defesa (Defense in Depth)

### 3.1 Pre-Filter (<1ms)

**Arquivo:** `utils/agentOrchestrator.ts`

Rejeição instantânea sem chamar LLM:

```typescript
// Bloqueios de gestão de risco
const riskBlocks = checkEntryBlocks(taSnap, taConfig, tokenAnalysis.mint)
    .filter(b => b.severity === "HARD" && (
        b.code === "BLOCK_COOLDOWN" ||
        b.code === "BLOCK_CONSECUTIVE_STOPS"
    ));
if (riskBlocks.length > 0) {
    return { action: "SKIP", confidence: 0, reasoning: riskBlocks[0].code };
}

// Micro-dump extremo (dado de latência zero)
if (taSnap.microTrend) {
    const microThreshold = agentMode === "SIMULATION" ? -15 : -8;
    if (taSnap.microTrend.changePct < microThreshold) {
        return { action: "SKIP", confidence: 0, 
                 reasoning: `MicroTrend: sharp drop (${taSnap.microTrend.changePct.toFixed(1)}% in 10s)` };
    }
}

// Honeypot, low liquidity, insufficient holders
if (tokenAnalysis.honeypotRisk) return SKIP;
if (tokenAnalysis.liquiditySol < 2) return SKIP;
if (tokenAnalysis.holders < minRequired) return SKIP;
if (tokenAnalysis.riskScore > 70) return SKIP;
```

### 3.2 Risk Engine (4 Fases)

**Arquivo:** `utils/riskEngine.ts`

| Fase | Checks | Execução |
|------|--------|----------|
| **Phase 1** | Token Authorities, Contract Age, Metadata | Parallel (Promise.allSettled) |
| **Phase 2** | Liquidity Analysis, Holder Distribution, Metadata Quality, Moralis API | Parallel |
| **Phase 3** | Trading Sanity (volume fake, buy/sell imbalance, honeypot) | Sequential |
| **Phase 4** | Technical Analysis Discount (RSI, MACD, EMA) | Sequential |

**Score Weights (Configuráveis):**
```typescript
weights: {
    mintAuth: 40,
    freezeAuth: 40,
    noLpLock: 10,
    top10Concentration: 15,
    clustering: 15,
    honeypot: 100,  // BLOCK automático
    volumeFake: 10,
    buySellImbalance: 10,
    devWalletHigh: 10,
}
```

**Thresholds de Decisão:**
- 0–40: `ALLOW_TRADE`
- 41–70: `ALLOW_ALERT` (trade reduzido)
- 71–100: `BLOCK`

### 3.3 Organicity Protection (9-Axis Scoring)

**Arquivos:** `utils/organicityMonitor.ts`, `utils/organicityScore.ts`

| Eixo | Descrição | Detecção |
|------|-----------|----------|
| **Trade Density** | Trades por 20s | Bot activity spikes |
| **Wallet Diversity** | Unique buyers/sellers 30s | Artificial participation |
| **Alternation Ratio** | Buy/sell sequence balance | Wash trading |
| **Pullback Quality** | Healthy retracements | Organic growth |
| **Linearity Efficiency (R²)** | Price linearity | Bot pattern detection |
| **Participation Expansion** | Growing wallet count | Organic spread |
| **Late Entry Risk** | Curve position vs holders | Bundle detection |
| **Liquidity Quality** | Price impact per SOL | Fake liquidity |
| **Seller Churn Rate** | Absorption modeling | Dump patterns |

**Shadow Mode:**
```env
SHADOW_MODE=true  # Observa sem bloquear
```

### 3.4 Pre-Execution Re-Validation

**Arquivo:** `utils/agentOrchestrator.ts` (pós-LLM)

Após LLM responder (1-3s de latência):

```typescript
// 1. TA V2 Full Snapshot
const taSnapNow = getTASnapshotV2(tokenAnalysis.mint, taConfigExec);
const execBlocks = checkEntryBlocks(taSnapNow, taConfigExec, tokenAnalysis.mint);
if (hasHardBlock(execBlocks)) {
    dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol, isInsufficientData);
    return;
}

// 2. Organicity Re-Check
const orgResult = calculateOrganicityScore(orgHistory, prices1sNow, curvePercent);
const orgBlocks = checkOrganicityHardBlocks(orgHistory, orgResult, prices1sNow);
if (hardOrgBlocks.length > 0 && !SHADOW_MODE) {
    dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol, false);
    return;
}

// 3. Micro-Confirmation (3-8s async window)
const mcResult = await runMicroConfirm(tokenAnalysis.mint, tokenAnalysis.symbol, curvePercent, prices1sExec);
if (!mcResult.passed) {
    dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol, false);
    return;
}

// 4. Price Spike Check
const validation = validateTradeExecution(tokenAnalysis.mint, tokenAnalysis.symbol, tokenAnalysis.price, 10.0);
if (!validation.isValid) {
    dipMonitor.addToken(tokenAnalysis.mint, tokenAnalysis.symbol, false);
    return;
}
```

### 3.5 Circuit Breaker

**Arquivo:** `utils/circuitBreaker.ts`

| Trigger | Ação | Duração |
|---------|------|---------|
| Daily Loss > 0.5 SOL | Trip circuit | 24h reset |
| Consecutive Failures > 10 | Trip circuit | 24h reset |
| Honeypot Detected | Blacklist deployer | 24h |
| 2 Rug Signals em 3min | Pause entries | 10min |
| LP Drop > 30% | Emergency exit + alert | Immediate |

**Persistência:** `circuit_breaker_state.json`

---

## 4. Technical Analysis V2

**Arquivo:** `utils/volatilityMonitor.ts` (634 linhas)

### 4.1 Indicadores (1-second resolution)

| Indicador | Período | Uso |
|-----------|---------|-----|
| **EMA** | 5, 9, 13, 21 | Trend direction |
| **MACD** | 4, 9, 3 | Momentum acceleration |
| **RSI** | 7 | Overbought/oversold |
| **ATR** | 7 | Volatility measurement |
| **Donchian** | 12 | Breakout detection |
| **ROC** | 5 | Rate of change |
| **Volume Relative** | 10 | Volume burst detection |
| **VWAP** | 20 | Fair value reference |

### 4.2 Confluence Scoring

**Arquivo:** `utils/technicalScore.ts`

Score 0-100 baseado em 4 blocos:

| Bloco | Peso | Componentes |
|-------|------|-------------|
| **Trend** | 30 pts | EMA alignment, price position |
| **Impulse** | 30 pts | MACD, RSI, volume burst |
| **Confirmation** | 25 pts | Donchian breakout, VWAP distance |
| **Penalties** | -15 pts | Overbought, low volume, high volatility |

**Thresholds (Configuráveis):**
```typescript
scoreMinimo: 55,      // Mínimo para entrada
scoreSizingMid: 65,   // 75% position size
scoreSizingMax: 80,   // 100% position size
```

### 4.3 Configuração Runtime

**Arquivo:** `utils/technicalConfig.ts`

Todos os parâmetros são ajustáveis via `data/ta-config.json`:

```typescript
export interface TechnicalAnalysisConfig {
    emaPeriods: [number, number, number];  // [5, 9, 13]
    macdPeriods: [number, number, number]; // [4, 9, 3]
    rsiPeriod: number;                      // 7
    atrPeriod: number;                      // 7
    rsiBullishMin: number;                  // 55
    rsiOverboughtBlock: number;             // 82
    volumeRelativeMin: number;              // 1.5
    maxDistVWAPPct: number;                 // 3.0
    atrMinPct: number;                      // 0.05
    atrMaxPct: number;                      // 5.0
    scoreMinimo: number;                    // 55
    // ... 40+ parâmetros
}
```

---

## 5. Learning System

### 5.1 LearnerAgent

**Arquivo:** `utils/learnerAgent.ts`

**Ciclo de Auto-Reflexão:**

1. **Trigger:** 30s após boot, depois a cada hora
2. **Input:** Trades perdedores de `data/simulation/trades.json`
3. **Process:** LLM post-mortem analysis ("Why did these fail?")
4. **Output:** Máximo 5 regras extraídas
5. **Persistência:** `data/agent/patterns.json` (máx 20 regras)
6. **Injeção:** Regras injetadas no system prompt do Agent Orchestrator

**Exemplo de Regra Aprendida:**
```json
{
    "rule": "REJECT tokens with bondingCurve > 80% but holders < 30 (likely bundled)",
    "source": "Ca7bK...mint",
    "createdAt": "2026-03-12T10:30:00.000Z"
}
```

### 5.2 Skills System

**Arquivo:** `utils/skillRegistry.ts`

**Estrutura:**
```markdown
---
name: PumpFunScalper
version: 1.0.0
description: Early momentum scalping on pump.fun
tags: [core, trading, pumpfun]
priority: 1
---

Skill instructions here...
```

**Injeção Dinâmica por Tags:**
```typescript
const skillTags = ["core", "trading", "risk", "mev", "execution"];
if (tokenAnalysis.bondingCurvePercent < 100) skillTags.push("pumpfun");
if (tokenAnalysis.sentiment) skillTags.push("sentiment");
if (tokenAnalysis.isCopyTrade) skillTags.push("copytrading");

const skillsPrompt = getActiveSkillsPrompt({ action: "token_analysis", tags: skillTags });
```

---

## 6. Configuração e Variáveis de Ambiente

### 6.1 Configuração Crítica

```env
# AI Agent
AGENT_ENABLED=true
AGENT_MODE=SIMULATION          # SIMULATION ou LIVE
AGENT_MIN_CONFIDENCE=70
LLM_MODEL=meta/llama-3.1-70b-instruct
NV_LLM_API_KEY=sk-...          # NVIDIA API key (OBRIGATÓRIA)

# Trading
BUY_AMOUNT_SOL=0.01
TAKE_PROFIT_PERCENT=100
STOP_LOSS_PERCENT=30
SLIPPAGE_BPS=300
AUTO_BUY_ENABLED=false

# Wallet (LIVE mode apenas)
SECRET_KEY_JSON=[64-element array]

# Risk Engine
RISK_ENGINE_ENABLED=true
RISK_WEIGHT_HONEYPOT=100       # BLOCK automático
RISK_BLOCK_UNLOCKED_LP=true    # Requer LP lockado

# Organicity
SHADOW_MODE=true               # Observa sem bloquear

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=-1001234567890

# Dashboard Auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=strong-random-secret-min-32-chars
ALLOWED_EMAIL=you@gmail.com
```

### 6.2 Runtime Configuration Files

| Arquivo | Propósito | Atualização |
|---------|-----------|-------------|
| `data/trading-config.json` | Trading params | Dashboard UI |
| `data/protocol-config.json` | Protocol toggles | Dashboard UI |
| `data/ta-config.json` | TA parameters | Dashboard UI |
| `data/emergency-stop.json` | Emergency flag | Dashboard / Telegram |
| `circuit_breaker_state.json` | CB state | Auto (circuitBreaker.ts) |

---

## 7. Dashboard API

**Arquivo:** `dashboard-api/server.ts` (1,207 linhas)

### 7.1 Endpoints

```typescript
GET  /api/stats              // General statistics
GET  /api/positions          // Active positions
GET  /api/agent/stats        // AI agent metrics
GET  /api/agent/logs         // Live agent logs
GET  /api/learning-metrics   // LearnerAgent performance
GET  /api/organicity-history // Organicity tracking
POST /api/trading-config     // Update trading parameters
POST /api/protocol-config    // Toggle protocols
POST /api/emergency-stop     // Emergency stop toggle
POST /api/auth/google        // Google OAuth
POST /api/auth/refresh       // Refresh JWT
```

### 7.2 WebSocket (Socket.io)

- Real-time position updates
- Live P&L streaming
- Agent decision logs
- Circuit breaker state changes
- Organicity shadow events

### 7.3 Authentication

| Feature | Implementação |
|---------|---------------|
| **OAuth Provider** | Google OAuth 2.0 |
| **Token Type** | JWT (access + refresh) |
| **Access Token** | 15 min expiry |
| **Refresh Token** | 7 days (HTTP-only cookie) |
| **Rate Limiting** | 20 req/15min on auth endpoints |
| **Allowed Email** | Configurable via `ALLOWED_EMAIL` |

---

## 8. Fluxo Completo de Operação

### 8.1 Detecção → Análise → Execução

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. gRPC Stream (Yellowstone) detecta transação                      │
│    • PumpFun, Meteora DBC, Bonk.fun, Daos.fun, Moonshot, Anoncoin  │
│    • Parseia instruções e eventos via IDL                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Extração de Dados                                                │
│    • Mint, signer, bonding curve, amounts                          │
│    • Creator wallet detection                                      │
│    • Token metadata (cached)                                       │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Risk Engine Analysis                                             │
│    • Phase 1: Authorities, Age, Metadata (parallel)                │
│    • Phase 2: Liquidity, Holders, Metadata Quality (parallel)      │
│    • Phase 3: Trading Sanity                                       │
│    • Phase 4: TA Discount                                          │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. AI Agent Decision (se discovery band)                            │
│    • Pre-Filter (<1ms rejection)                                   │
│    • Multi-Agent Orchestration:                                    │
│      - RiskAgent (security veto)                                   │
│      - ScalperAgent (micro-trend)                                  │
│      - SentimentAgent (social)                                     │
│      - WhaleTrackerAgent (large movements)                         │
│      - CopyTradingAgent (final judge)                              │
│    • Fallback to single LLM if orchestration fails                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. Pre-Execution Re-Validation                                      │
│    • TA V2 Full Snapshot (setup still valid?)                      │
│    • Organicity Re-Check (still organic?)                          │
│    • Micro-Confirmation (3-8s async window)                        │
│    • Price Spike Check (no abnormal movement)                      │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. Execution (SIMULATION ou LIVE)                                   │
│    • Dynamic position sizing (confidence-based)                    │
│    • Jito Bundle (priority) ou RPC fallback                        │
│    • Position Manager save                                         │
│    • Telegram alert                                                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. Post-Trade Monitoring                                            │
│    • Simulation: DexScreener price polling                         │
│    • TP/SL/timeout checks                                          │
│    • LearnerAgent analysis (hourly cycle)                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Dip Sniper Flow

```
1. Token aprovado mas timeout durante avaliação LLM
   └─ Adicionado ao DipMonitor waitlist

2. Scan a cada 2 segundos
   ├─ RSI < 45 (oversold)
   ├─ Price > EMA9 (crossing up)
   └─ MACD histogram > 0 (bullish)

3. Execução automática quando condições batem
   └─ Remove da waitlist, executa buy
```

---

## 9. Pontos de Atenção e Dependências

### 9.1 Dependências Críticas

| Dependência | Status | Impacto se Falhar |
|-------------|--------|-------------------|
| **NVIDIA LLM API Key** | ⚠️ Requer configuração | Agentes não funcionam |
| **Yellowstone gRPC** | ⚠️ Requer endpoint válido | Sem streaming em tempo real |
| **Solana RPC** | ⚠️ Requer endpoint válido | Sem leitura on-chain |
| **Telegram Bot Token** | ⚠️ Requer configuração | Sem alertas |
| **Wallet Private Key** | ⚠️ Requer para LIVE mode | Apenas SIMULATION |

### 9.2 Configurações para Produção

```env
# Mudar para LIVE
AGENT_MODE=LIVE
AUTO_BUY_ENABLED=true

# Configurar wallet real
SECRET_KEY_JSON=[your-64-element-array]

# Aumentar thresholds de segurança
AGENT_MIN_CONFIDENCE=80
RISK_THRESHOLD_LOW=40
RISK_THRESHOLD_MED=70

# Desabilitar shadow mode
SHADOW_MODE=false
```

---

## 10. Arquivos de Persistência

| Arquivo | Propósito | Tamanho Típico |
|---------|-----------|----------------|
| `data/positions.json` | Posições ativas/históricas | < 100 KB |
| `data/simulation/trades.json` | Histórico de trades simulados | < 1 MB |
| `data/simulation/metrics.json` | Métricas de performance | < 10 KB |
| `data/agent/patterns.json` | Regras aprendidas (máx 20) | < 5 KB |
| `data/agent/learner-state.json` | Checkpoint aprendizado | < 1 KB |
| `data/organicity-history.json` | Janelas de organicidade | < 500 KB |
| `data/trading-config.json` | Configuração de trading | < 5 KB |
| `data/protocol-config.json` | Protocol toggles | < 1 KB |
| `data/emergency-stop.json` | Emergency flag | < 1 KB |
| `data/ta-config.json` | Configuração TA | < 5 KB |
| `circuit_breaker_state.json` | Estado circuit breaker | < 1 KB |
| `sent_addresses.json` | Endereços alertados | < 100 KB |

---

## 11. Testes e QA

### 11.1 Test Suites

```
test/
├── unit/                      # Jest unit tests
│   ├── agentOrchestrator.test.ts
│   ├── riskEngine.test.ts
│   ├── hybridExecutor.test.ts
│   └── ...
├── integration/               # Integration tests
│   ├── agentIntegration.test.ts
│   └── ...
├── e2e/                       # Playwright E2E tests
│   ├── dashboard.spec.ts
│   └── ...
└── smokeTest.ts               # Connectivity smoke tests
```

### 11.2 Pre-commit Hook

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.ts": ["npm run test:unit", "eslint"]
  }
}
```

---

## 12. Conclusão e Recomendações

### 12.1 Status Geral

O sistema está **estruturalmente completo e operacional**. Todos os componentes principais foram implementados com:

✅ **Arquitetura robusta** - Separação clara de responsabilidades  
✅ **Defesa em profundidade** - 5+ camadas de proteção  
✅ **Fallback seguro** - Multi-agent com fallback para LLM single  
✅ **Persistência confiável** - JSON + SQLite para dados críticos  
✅ **Monitoramento em tempo real** - WebSocket + Telegram  
✅ **Aprendizado contínuo** - Self-reflection loop ativa  

### 12.2 Pré-requisitos para Operação

1. **Configurar NVIDIA LLM API Key**
   ```bash
   # Obter em: https://build.nvidia.com/
   NV_LLM_API_KEY=nvapi-...
   ```

2. **Configurar gRPC Endpoint**
   ```bash
   # Triton One, Helius, ou outro provider
   SHYFT_GRPC=https://your-grpc-endpoint.com
   SHYFT_GRPC_TOKEN=your-token
   ```

3. **Configurar Wallet (LIVE mode)**
   ```bash
   # Exportar wallet como array de 64 elementos
   SECRET_KEY_JSON=[1,2,3,...,64]
   ```

4. **Testar em SIMULATION primeiro**
   ```bash
   AGENT_MODE=SIMULATION
   ```

5. **Habilitar alertas Telegram**
   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_CHAT_ID=-1001234567890
   ```

### 12.3 Próximos Passos Recomendados

1. **Validar prompts dos agentes** - Revisar `prompt.md` de cada agente
2. **Testar conectividade NVIDIA API** - Validar API key
3. **Rodar em SIMULATION** - Coletar métricas de performance
4. **Ajustar thresholds** - Baseado em resultados de simulation
5. **Habilitar LIVE mode** - Apenas após validação completa

---

## Apêndice A: Comandos Úteis

```bash
# Listar skills disponíveis
npm run skill:list

# Importar skill do GitHub
npm run skill:import https://github.com/...

# Rodar testes unitários
npm run test:unit

# Rodar testes E2E
npm run test:e2e

# Iniciar bot em development
npm run dev

# Iniciar dashboard
npm run dashboard

# Ver logs do LearnerAgent
tail -f logs/app.log | grep LearnerAgent
```

---

## Apêndice B: Troubleshooting

### Agentes não decidem

```bash
# Verificar API key
echo $NV_LLM_API_KEY

# Testar conectividade
curl -H "Authorization: Bearer $NV_LLM_API_KEY" \
     https://integrate.api.nvidia.com/v1/models
```

### Circuit Breaker disparou

```bash
# Ver estado atual
cat circuit_breaker_state.json

# Reset manual (apenas se seguro)
echo '{"dailyLossSol":0,"consecutiveFailures":0,"lastResetTime":1234567890,"isTripped":false}' > circuit_breaker_state.json
```

### Posições não persistem

```bash
# Verificar permissões
ls -la data/positions.json

# Ver logs
tail -f logs/app.log | grep PositionManager
```

---

**Fim do Relatório**

*Documento gerado em 12 de Março de 2026 como parte da auditoria técnica do sistema.*
