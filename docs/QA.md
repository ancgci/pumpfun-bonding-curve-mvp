# 🧪 QAgent — Senior Quality Assurance

## Overview

O **QAgent** é um agente de QA Senior (12+ anos em bots Solana) que garante qualidade contínua do projeto
com **regressão completa**, **testes funcionais**, **E2E**, **unitários** e **API**.

**Localização:** `.agents/agents/QAgent/`

---

## 📋 Suites de Teste

| Suite | Arquivo | Framework | Escopo |
|-------|---------|-----------|--------|
| **Unit** | `tests/unit/simulationEngine.test.ts` | Jest | Lógica isolada (métricas, trades, readiness) |
| **API** | `tests/api/statsEndpoint.test.ts` | Supertest | Endpoints REST (`/api/stats`, `/api/positions`, etc.) |
| **E2E** | `tests/e2e/dashboardLoad.test.ts` | Playwright | Dashboard React carrega sem crash |
| **Regression** | `tests/regression/fullRegressionSuite.test.ts` | Playwright | Layout, interações, API health, zero errors |

---

## 🚀 Comandos

```bash
# Rodar tudo (unit + API + E2E + regressão)
npm run qa:full

# Individualmente
npm run qa:unit         # Testes unitários
npm run qa:api          # Testes de API
npm run qa:e2e          # E2E funcional (Playwright)
npm run qa:regression   # Suite de regressão completa
```

---

## 🔍 O Que Cada Suite Testa

### Unit (`qa:unit`)
- `getSimulationMetrics()` retorna métricas válidas
- `getOpenTradesFromDb()` retorna array
- `getRecentTrades(limit)` respeita limites
- `isSimulationReadyForLive()` retorna `{ ready, reasons }`
- Campos obrigatórios (`mint`, `entryPrice`, `status`)

### API (`qa:api`)
- `GET /api/stats` → estrutura com `totalPositions`, `winRate`
- `GET /api/positions` → array de posições
- `GET /api/cb-status` → `consecutiveFailures`
- `GET /api/agent/stats` → `enabled`, `mode`
- `GET /api/simulation/status` → `readyForLive`, `readinessScore`
- `GET /api/trading-config` → `buyAmountSol`, `takeProfitPercent`
- `GET /api/protocol-config` → `PUMPFUN`
- `GET /api/emergency-stop` → `active` (boolean)
- `GET /api/agent/logs` → array de logs
- `GET /api/bot-health` → status 200

### E2E (`qa:e2e`)
- Dashboard React carrega sem crash
- Stats Overview, Trading Parameters, Control Center visíveis
- Active Protocols mostra PumpFun
- Circuit Breaker, Live Terminal, Trade History renderizam
- Zero `pageerror` events no console

### Regression (`qa:regression`)
- Todas as seções renderizam por nome
- Stats cards mostram valores numéricos (não NaN/undefined)
- Emergency Stop e Reset CB clicáveis
- Sliders de parâmetros interativos
- Save Parameters funciona
- 5 protocolos corretos
- CB mostra todas as 4 métricas
- Tabela de trades com 7 colunas corretas
- Zero JS errors no console
- Zero API requests com status >= 400

---

## 📊 Relatórios de Teste (Reports)

Após a execução, o QAgent gera relatórios detalhados dependendo da suite utilizada:

### 1. Testes de Frontend (Playwright)
Ao rodar `qa:e2e`, `qa:regression` ou `qa:full`, o sistema gera um site de relatório visual contendo a árvore de componentes testada, tempo de execução e, em caso de erro, a linha exata de código que falhou.
- **Localização:** Os relatórios são salvos na pasta `/playwright-report/` na raiz do projeto.
- **Acesso:** Abra o arquivo `index.html` desta pasta diretamente no seu navegador.

### 2. Testes de Backend (Jest)
Ao rodar `qa:unit`, `qa:api` ou `qa:full`, o sistema exibe o resultado compilado diretamente no seu terminal, listando os sucessos e falhas em tempo real.
- **Coverage:** Pode ser configurado futuramente para injetar uma pasta `/coverage/` detalhando a porcentagem do seu código que os testes cobriram.

---

## 🛠️ Pré-requisitos

```bash
npm install -D supertest @playwright/test
npx playwright install --with-deps
```

---

## 📝 Prompt do Agente

O arquivo `prompt.md` define o comportamento do QAgent para uso com LLMs:
- Foco em regressão + funcional + E2E + unitário + API
- Sem security/não-funcional (sem OWASP, k6, Lighthouse)
- Responde a comandos: `qa:run full`, `qa:regression`, `qa:fix failing test`
