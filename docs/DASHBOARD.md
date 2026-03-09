# 📊 Dashboard V2 — React/Vite Guide

## Overview

O Dashboard V2 é uma interface moderna construída com **React 19 + Vite + TypeScript** e **Tailwind CSS v4**.
Ele substitui o dashboard legado (HTML/JS) com uma UX premium, componentes reutilizáveis, e atualizações em tempo real via WebSocket.

**Stack:** React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts, Socket.io-client, Lucide Icons.

---

## 🚀 Como Iniciar

```bash
# Na raiz do projeto
cd dashboard-new
npm install
npm run dev
```

**Acesso:** http://localhost:5174

> **Nota:** O backend API (`localhost:3001`) e o bot precisam estar rodando. Use `npm run start:all` na raiz.

---

## 🗂️ Navegação por Abas

O dashboard é dividido em 3 abas no topo:

### Tab 1: Overview
- **Performance Overview** — Gráfico PnL cumulativo + cards (Invested, Win Rate, Wins, Losses)
- **Control Center** — Toggles: Agent ON/OFF, SIM/LIVE, Auto-Buy, Emergency Stop
- **Active Protocols** — PumpFun, Meteora, Bonk, Daos, Moonshot (clickable toggles)
- **AI Agent Status** — Modo, confiança, LLM
- **Circuit Breaker** — Status OK/HALTED, falhas consecutivas, daily loss
- **Learning Boards** — Progresso simulação vs mainnet
- **Simulation Readiness** — Score de readiness, blockers
- **Active Positions** — Tabela de posições abertas

### Tab 2: Trading
- **Trading Parameters** — Buy Amount, TP%, SL%, Slippage, Jito Tip, Auto-Sell, Save
- **Active Positions** — Posições abertas com P&L
- **Learned Rules** — Regras aprendidas pelo LearnerAgent

### Tab 3: Logs & History
- **Live Terminal** — Logs em tempo real com auto-scroll (600px, polling 2s)
- **Recent Trades** — Tabela completa com links Trojan, cores por status, reason
- **Learned Rules** — Padrões extraídos pelo AI

---

## 🎨 Componentes

| Componente | Arquivo | Função |
|-----------|---------|--------|
| `Header` | `Header.tsx` | Status de conexão, versão, health badge |
| `StatsOverview` | `StatsOverview.tsx` | Gráfico PnL (Recharts) + 4 cards de métricas |
| `ControlPanel` | `ControlPanel.tsx` | Toggles do agente + emergency stop |
| `TradingParameters` | `TradingParameters.tsx` | Inputs de configuração + Save |
| `ActiveProtocols` | `ActiveProtocols.tsx` | Toggle switches para 5 protocolos |
| `AgentStatus` | `AgentStatus.tsx` | Status, modo, confiança |
| `CircuitBreakerStatus` | `CircuitBreakerStatus.tsx` | Status OK/HALTED + métricas |
| `LearningBoards` | `LearningBoards.tsx` | Progresso sim vs mainnet |
| `SimulationStatus` | `SimulationStatus.tsx` | Readiness score + blockers |
| `PositionsList` | `PositionsList.tsx` | Tabela de posições ativas |
| `TradeHistory` | `TradeHistory.tsx` | Tabela de trades + links Trojan |
| `AgentLiveTerminal` | `AgentLiveTerminal.tsx` | Terminal estilo iTerm2 com logs |
| `LearnedRules` | `LearnedRules.tsx` | Lista de regras aprendidas |

---

## 🔌 APIs Consumidas

O dashboard consome os seguintes endpoints do backend (`localhost:3001`):

| Endpoint | Método | Dados |
|----------|--------|-------|
| `/api/stats` | GET | Invested, wins, losses, winRate |
| `/api/positions` | GET | Posições ativas |
| `/api/cb-status` | GET | Circuit Breaker (isTripped, failures) |
| `/api/agent/stats` | GET | Status do agente, modo, LLM |
| `/api/agent/trades` | GET | Histórico de trades |
| `/api/agent/logs` | GET | Logs em tempo real |
| `/api/agent/patterns` | GET | Padrões estatísticos |
| `/api/agent/learned-rules` | GET | Regras aprendidas |
| `/api/simulation/status` | GET | Readiness, métricas |
| `/api/simulation/trades` | GET | Trades simulados (SQLite) |
| `/api/trading-config` | GET/POST | Configurações de trading |
| `/api/protocol-config` | GET/POST | Protocolos ON/OFF |
| `/api/emergency-stop` | GET/POST | Parada de emergência |
| `/api/cb-reset` | POST | Reset circuit breaker |
| `/api/agent/toggle` | POST | Liga/desliga agente |
| `/api/agent/mode` | POST | Alterna SIM/LIVE |
| `/api/bot-health` | GET | Health check |

**WebSocket:** `localhost:3000` — Eventos `dashboardUpdate` (stats, simTrades).

---

## 📁 Estrutura de Arquivos

```
dashboard-new/
├── package.json
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── tailwind.config.js
├── components.json              # shadcn/ui config
└── src/
    ├── main.tsx                  # Entry point (ErrorBoundary)
    ├── App.tsx                   # Tab navigation + layout
    ├── index.css                 # Tailwind v4 + glassmorphism + slider CSS
    ├── hooks/
    │   └── useDashboardData.tsx  # Context + API polling + WebSocket
    ├── lib/
    │   └── utils.ts             # cn() helper (clsx + tailwind-merge)
    └── components/
        ├── ui/                   # shadcn/ui primitives
        │   ├── badge.tsx
        │   ├── card.tsx
        │   ├── progress.tsx
        │   └── scroll-area.tsx
        └── dashboard/            # Feature components
            ├── Header.tsx
            ├── StatsOverview.tsx
            ├── ControlPanel.tsx
            ├── TradingParameters.tsx
            ├── ActiveProtocols.tsx
            ├── AgentStatus.tsx
            ├── CircuitBreakerStatus.tsx
            ├── LearningBoards.tsx
            ├── SimulationStatus.tsx
            ├── PositionsList.tsx
            ├── TradeHistory.tsx
            ├── AgentLiveTerminal.tsx
            └── LearnedRules.tsx
```

---

## 🔧 Customização

### Mudar Porta
Edite `vite.config.ts`:
```typescript
server: { port: 5174 }
```

### Mudar Tema
Edite `src/index.css` — variáveis CSS em `:root`.

### Mudar Polling Interval
Edite `src/hooks/useDashboardData.tsx`:
```typescript
const pollInterval = setInterval(refreshData, 10000); // 10s
const logInterval = setInterval(fetchLogs, 2000);      // 2s
```

---

*Para troubleshooting API, consulte [API.md](API.md).*
