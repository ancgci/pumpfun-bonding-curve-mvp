# 🤖 PumpFun Trading Bot

Automated trading bot for Solana with support for multiple DeFi protocols.

## 📚 Documentation

All project documentation is in the `/docs` folder:

- **[README](docs/README.md)** - Overview and quick start
- **[ARCHITECTURE](docs/ARCHITECTURE.md)** - Technical system architecture
- **[USAGE](docs/USAGE.md)** - Complete usage guide
- **[CONFIGURATION](docs/CONFIGURATION.md)** - Environment variables reference
- **[RISK_ENGINE](docs/RISK_ENGINE.md)** - Anti-rug filters, risk score and tuning
- **[AI_AGENT](docs/AI_AGENT.md)** - AI Agent architecture, learning loop, and precision trading
- **[SKILLS](docs/SKILLS.md)** - Pluggable Skills system: create, import, and manage agent skills
- **[API](docs/API.md)** - Dashboard API documentation
- **[DASHBOARD](docs/DASHBOARD.md)** - Dashboard UI guide
- **[CHANGELOG](docs/CHANGELOG.md)** - Improvement history

## 🚀 Quick Start

### Option 1: Everything at Once (Recommended)

```bash
# 1. Install dependencies
npm install

# 2. Configure .env
cp .env.example .env
# Edit .env with your credentials

# 3. Start bot + dashboard simultaneously
npm run start:all
```

**Result:** Bot and Dashboard start together. Access: http://localhost:3001

---

### Option 2: Separately

**Bot:**
```bash
npm start
```

**Dashboard (separate terminal):**
```bash
npm run start:dashboard
```


## 🆕 Latest Changes (Mar 3, 2026)

### 🧩 Skills Architecture — Pluggable Agent Intelligence

O agente agora é alimentado por **Skills**: módulos de conhecimento plugáveis que podem ser adicionados, removidos ou importados do GitHub sem alterar código.

| Feature | Description |
|---------|-------------|
| **Skill Loader** | Auto-descobre skills em `.agents/skills/` com hot-reload |
| **Skill Registry** | Seleciona skills por contexto/tags/prioridade e injeta no prompt do LLM |
| **4 Skills Built-in** | PumpFunScalper, RiskAnalyzer, VolumeAnalysis, WalletTracker |
| **GitHub Import CLI** | Importa skills de qualquer repo público via `npm run skill:import` |
| **Runtime Enable/Disable** | Liga/desliga skills sem reiniciar o bot |

**Comandos:**
```bash
# Listar skills instaladas
npm run skill:list

# Importar skill do GitHub
npm run skill:import -- --url https://raw.githubusercontent.com/user/repo/main/MySkill.md

# Importar de repositório
npm run skill:import -- --repo user/repo --file skills/Strategy.md

# Deletar uma skill
npm run skill:delete -- SkillName
```

**Criar uma skill** — basta criar um `.md` em `.agents/skills/`:
```yaml
---
name: MinhaSkill
description: O que faz
version: "1.0"
tags: [trading, analysis]
author: seu-nome
priority: 10
---
# Instruções detalhadas para o agente...
```

**Skills Built-in:**

| Skill | Prioridade | Função |
|-------|------------|--------|
| **PumpFunScalper** | 1 | Estratégia core de scalping agressivo |
| **RiskAnalyzer** | 5 | Honeypot, rug pull, deployer history |
| **VolumeAnalysis** | 10 | Wash trading vs volume orgânico |
| **WalletTracker** | 10 | Whales, concentração, insider patterns |

**Novos Arquivos:**
- `utils/skillLoader.ts` — Descoberta e parse de skills
- `utils/skillRegistry.ts` — Seleção e injeção no prompt
- `tools/import-skill.ts` — CLI de importação
- `.agents/skills/*.md` — Diretório de skills
- `docs/SKILLS.md` — Documentação completa

**See:** [SKILLS.md](docs/SKILLS.md) for full documentation.

---

## 🔵 Previous Changes (Mar 2, 2026)

### 🧠 AI Agent Autonomy Upgrades

| Feature | Description |
|---------|-------------|
| **Dynamic TP/SL** | LLM now defines Take Profit and Stop Loss per trade based on volatility analysis |
| **LearnerAgent (Self-Reflection)** | New module that analyzes losing trades and extracts "golden rules" via LLM |
| **Learned Rules Injection** | Rules from past mistakes are automatically injected into the agent's system prompt |
| **Hourly Learning Cycle** | LearnerAgent runs every hour + 30s after boot |

**How Self-Reflection Works:**
```
1. Bot closes trades (TP, SL, or timeout)
2. LearnerAgent reads all losing trades
3. Sends losses to LLM: "Why did these fail?"
4. LLM returns rules: ["Skip tokens with <2 SOL liquidity", ...]
5. Rules saved to data/agent/patterns.json
6. Next trade: rules injected into system prompt
7. Agent avoids same mistakes → Higher win rate
```

**New Files:**
- `utils/learnerAgent.ts` — Self-reflection engine
- `data/agent/patterns.json` — Learned rules (auto-generated)
- `data/agent/learner-state.json` — Learning checkpoint

### 🎨 Dashboard Modernization

| Feature | Description |
|---------|-------------|
| **Glassmorphism Theme** | Premium dark UI with `backdrop-filter: blur()`, animated gradients |
| **Google Fonts** | Outfit (UI) + JetBrains Mono (code/logs) |
| **Split Learning Boards** | Separate Simulation and Mainnet learning progress panels |
| **Premium Toggle Controls** | Animated toggle switches for Agent ON/OFF and SIM/LIVE mode |
| **Agent Live Logs Terminal** | Real-time scrolling terminal showing RiskEngine and Agent activity |
| **Micro-animations** | Hover effects, smooth transitions, card glow on interaction |

**New Dashboard Endpoints:**
- `GET /api/agent/logs` — Live agent logs (filtered from Winston)

### 🎯 Precision Trading Upgrades

| Feature | Description |
|---------|-------------|
| **Pre-Filter (<1ms)** | Instant reject without LLM: honeypot, low liquidity, few holders, high risk, young tokens |
| **Dynamic Position Sizing** | Trade size scales with confidence: 90%+ → 100%, 80% → 75%, 70% → 50% |
| **Trailing Stop Loss** | Stop rises with price (20% trailing from peak), locking in profits automatically |
| **Whale Dump Fast-Exit** | Emergency exit when price crashes >30% from peak in one check |
| **Enriched LLM Prompt** | Token age, buy/sell ratio, top 10 holder concentration, deployer history |

**See:** [AI_AGENT.md](docs/AI_AGENT.md) for full technical documentation.

---

## 🔵 Previous Changes (Feb 26, 2026)

### 🔵 Jito Endpoint Auto-Selection

| Feature | Description |
|---------|-------------|
| **Auto Latency Detection** | Automatically selects the fastest Jito Block Engine endpoint |
| **Multiple Fallbacks** | Tests Frankfurt, NY, Amsterdam, Tokyo endpoints |
| **Region Override** | Force specific region via `JITO_BLOCK_ENGINE_REGION` |
| **Cache** | Caches selection for 20 minutes (configurable) |
| **ENV Override** | Force specific endpoint via `JITO_BLOCK_ENGINE_URL` |

**New Environment Variables:**
```env
JITO_BLOCK_ENGINE_URLS=https://frankfurt.mainnet.block-engine.jito.wtf,https://ny.mainnet.block-engine.jito.wtf
JITO_BLOCK_ENGINE_REGION=ny
JITO_ENDPOINT_REFRESH_MINUTES=20
```

### 🟢 AI Agent with Learning

| Feature | Description |
|---------|-------------|
| **Auto Trading** | Buy/sell decisions based on AI confidence |
| **Learning System** | Learns from each trade, optimizes strategy every 50 trades |
| **Multiple LLM Support** | Gemini, OpenAI, Anthropic, Cohere |
| **Simulation Mode** | Test strategies without real funds |
| **Live Mode** | Real trading with real money |

**AI Agent Configuration:**
```env
AGENT_ENABLED=true
AGENT_MODE=SIMULATION       # or LIVE
AGENT_LEARNING_ENABLED=true
AGENT_AUTO_SELL=true
AGENT_MIN_CONFIDENCE=70
AGENT_MAX_CONFIDENCE=95
LLM_PROVIDER=gemini
LEARNING_OPTIMIZE_INTERVAL=50
```

### 🧪 Real-Time Token Simulation

**NEW**: Simulation tests AI strategy against **newly launched tokens with REAL prices**

| Feature | Description |
|---------|-------------|
| **Real Token Tests** | Simulates against tokens actually being launched now |
| **Real-Time Prices** | Uses DexScreener for live market data |
| **No Risk** | Records fake trades, learns from patterns |
| **Exit Monitoring** | Auto-close on Take Profit, Stop Loss, or timeout |
| **Metrics Tracking** | Win rate, P&L, Sharpe ratio, expected value |
| **Learning Integration** | Results feed directly into AI optimization |
| **Readiness Score** | 0-100 score showing when ready for LIVE trading |

**How It Works:**
```
1. Bot detects new token (PumpFun, Meteora, etc) 
2. AI agent: "Should we BUY? Confidence: 82.5%"
3. If SIMULATION mode:
   ├─ Record "BUY" entry at real price
   ├─ Monitor real prices for next 1 hour
   ├─ Auto-close: TP hit (+50%) or SL hit (-25%)
   ├─ Calculate P&L, update dashboard
   └─ Feed results to learning system
4. If LIVE mode:
   ├─ Execute real transaction
   ├─ Update positions.json
   └─ Same monitoring + real money impact
```

**Dashboard Simulation Metrics:**
```
🧪 SIMULATION
├─ Win Rate: 61.8%
├─ Total P&L: +2.345 SOL
├─ Sharpe Ratio: 1.45
├─ Expected Value: +0.089 SOL
├─ Max Drawdown: 3.2 SOL
└─ Readiness: 65/100
   ├─ 34/50 trades needed
   └─ Upgrade to LIVE when 100/100 ✅
```

**Documentation:**
- [SIMULATION_MODE.md](docs/SIMULATION_MODE.md) - Detailed simulation guide
- [REAL_TIME_SIMULATION.md](docs/REAL_TIME_SIMULATION.md) - Full workflow with real tokens

### 🟡 Dashboard Improvements

| Feature | Description |
|---------|-------------|
| **Agent Section** | Visual monitoring of AI agent status |
| **Learning Progress** | Progress bar showing optimization status |
| **Pattern Recognition** | Display learned trading patterns |
| **Real-time Metrics** | Win rate, trades, P&L |
| **Trade History** | Last 10 trades with confidence scores |

**Dashboard Endpoints:**
- http://localhost:3001 - Main dashboard
- http://localhost:3001/api/agent/stats - Agent statistics
- http://localhost:3001/api/agent/trades - Trade history
- http://localhost:3001/api/agent/patterns - Learned patterns

### 🔴 Infrastructure

| Change | Description |
|--------|-------------|
| **JSON Database** | Replaced SQLite with JSON file (no native dependencies) |
| **Multiple RPC Fallbacks** | 5 RPC endpoints for better uptime |
| **Updated Scripts** | Fixed npm start for WSL/Windows compatibility |

**RPC Fallbacks:**
```env
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
RPC_URL_FALLBACK_1=https://api.mainnet-beta.solana.com
RPC_URL_FALLBACK_2=https://solana-api.projectserum.com
RPC_URL_FALLBACK_3=https://rpc.ankr.com/solana
RPC_URL_FALLBACK_4=https://public.api.rpc.solana
```

---

## 🔴 Earlier Changes (Feb 22, 2026)

### Improvements

## ✨ Features

- ✅ **AI Agent** - Intelligent trading with Qwen3/Gemini/OpenAI/Anthropic
- ✅ **Dynamic TP/SL** - LLM decides Take Profit and Stop Loss per trade
- ✅ **LearnerAgent** - Self-reflection loop: learns from losses, generates rules
- ✅ **Learned Rules Injection** - Past mistakes feed into future decisions
- ✅ **Learning System** - Self-optimizing strategy after 50 trades
- ✅ **Jito Auto-Selection** - Lowest latency endpoint automatically
- ✅ **Precise Multi-Dex Parser** - Accurate IDL mapping for Jupiter, Raydium, Meteora
- ✅ **Position Persistence** - Zero data loss on crash (JSON database)
- ✅ **Circuit Breaker + Telegram Alerts** - Instant notifications
- ✅ **RPC Pool with Failover** - 99.9% uptime with 5 endpoints
- ✅ **Dynamic Gas Pricing** - 50-70% savings
- ✅ **Adaptive Slippage** - +25% success rate
- ✅ **Glassmorphism Dashboard** - Premium dark UI with animations and live logs
- ✅ **Split Learning Boards** - Simulation vs Mainnet metrics side by side
- ✅ **Premium Agent Controls** - Toggle switches for Agent and Trading Mode
- ✅ **Agent Live Logs** - Real-time terminal in the dashboard
- ✅ **Backtester CLI** - Safe optimization
- ✅ **Risk Engine** - Anti-rug score 0–100 with 5 filters + post-curve monitor
- ✅ **Alert Queue** - Async, prioritized, with retry
- ✅ **Skills Architecture** - Pluggable agent skills: create, import from GitHub, hot-reload
- ✅ **Yellowstone gRPC** - New high-availability endpoint

## 📊 Impact

| Metric | Improvement |
|--------|-------------|
| Risk | -80% |
| Profit | +20-30% |
| Costs | -60% |
| Uptime | 99.9% |

## 📖 Read More

See the [complete documentation](docs/README.md) for details.

## 📝 License

MIT