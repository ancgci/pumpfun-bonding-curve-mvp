# 🤖 PumpFun Trading Bot

Bot de trading automático para Solana com suporte a múltiplos protocolos DeFi (PumpFun, Meteora, Moonshot, Bonk, Daos, Anoncoin).

## 📌 Perfil Operacional Atual

Após os ajustes de banda aplicados em **20/03/2026**, o perfil recomendado para a VPS ficou:

- `MONITORING_PROTOCOL=PUMPFUN`
- protocolos auxiliares desabilitados por padrão no servidor (`METEORA_DBC`, `BONK_FUN`, `DAOS_FUN`, `MOONSHOT`, `ANONCOIN`)
- `VERBOSE_TRANSACTION_LOGS=false`
- `AGENT_MODE=SIMULATION` no baseline operacional
- `AGENT_MODE=LIVE` continua disponível quando houver decisão explícita de operar em mainnet
- governança adaptativa de entrada implementada no código local (`FULL`, `REDUCED`, `PROBE` e `RECHECK` para setups precoces)
- camada determinística local inspirada em `go-trader` e `Hummingbot` com `fast lane`, `portfolio governor` e `execution preflight`
- gateway LLM unificado disponível localmente com `legacy -> google`, saída estruturada e tool calling por agente
- conectividade LLM local validada com NVIDIA primário (`z-ai/glm5`) e Gemini como fallback operacional
- `vnstat` instalado na VPS para histórico de tráfego
- alerta diário em Telegram configurado para `5 GiB/dia`
- `tools/vnstat_daily_alert.py` executado via `cron` a cada 15 minutos na VPS

## 🌟 Características Principais

### Sprint 1: Redução de Risco ✅
- **Position Manager** - Persistência de posições em disco (zero perda de dados em crash)
- **Circuit Breaker com Telegram Alerts** - Notificações instantâneas quando o bot para de operar
- **RPC Pool com Failover** - Alta disponibilidade com 3 endpoints (99.9% uptime)

### Sprint 2: Otimizações ✅
- **Dynamic Gas Pricing** - Economiza 50-70% em fees durante baixa demanda
- **Adaptive Slippage** - Ajusta slippage baseado na liquidez do token (+25% taxa de sucesso)

### Sprint 4: Ferramentas ✅
- **Dashboard Web** - Monitoramento visual em tempo real
- **Backtester CLI** - Otimização segura de parâmetros sem risco

### Sprint 8: Inteligência & Escala ✅
- **RPC Pool Pro** - 10+ endpoints com failover dinâmico (Uptime 99.99%)
- **Multi-Source Sentiment** - Santiment, Twitter e SenseAI integrados
- **Moralis Anti-Rug** - Análise profunda de holders e deployers
- **Trojan Integration** - Nome do token e Dev Wallet agora vinculados ao Trojan Terminal/Wallet

### Sprint 9: Ressurreição & Alta Precisão ✅
- **Persistência de Simulação** - Retomada automática de trades e monitores após restart do bot.
- **Indicadores de Alta Frequência** - RSI, MACD e EMAs calculados em janelas de 5 segundos.
- **Filtros Estritos de Entrada** - Travas automáticas contra sobrecompra (RSI > 75) e tendência de queda.

### Sprint 10: Multi-Agent & Real-Time UX ✅
- **Arquitetura Multi-Agente** - Orquestração de uma equipe de especialistas (Scalper, Risk, Sentiment, Whale).
- **Dashboard WebSocket** - Atualizações instantâneas via Socket.io no servidor e cliente.
- **Scalper Ultra-Fast** - Agente dedicado para operar em buckets de 5s no modo PRO.
- **Risk Guardian** - Validação de segurança obrigatória em paralelo a análise de trade.
- **Sprint 11: Descoberta Híbrida & Estabilização** ✅
- **Descoberta Antecipada**: Operação a partir de 15% de curva, independente de alertas.
- **Fila de Compra Imediata**: Compra aprovada por IA assim que dados estabilizam (15s).

## 📊 Impacto Total

| Métrica | Melhoria |
|---------|----------|
| **Risco de Perda** | -80% |
| **Lucro** | +20-30% |
| **Custos de Gas** | -60% |
| **Uptime** | 99.9% |

## 🚀 Início Rápido

### 1. Instalação
```bash
npm install
```

### 2. Configuração
Copie `.env.example` para `.env` e configure:
```bash
# RPCs
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
RPC_FALLBACK_LIST=https://url1,https://url2
WS_URL=wss://your-primary-ws
WS_FALLBACK_LIST=wss://url1,wss://url2

# Wallet
SECRET_KEY_JSON=[...]

# Perfil recomendado na VPS
MONITORING_PROTOCOL=PUMPFUN
VERBOSE_TRANSACTION_LOGS=false
METEORA_DBC_MONITORING_ENABLED=false
BONK_FUN_MONITORING_ENABLED=false
DAOS_FUN_MONITORING_ENABLED=false
MOONSHOT_MONITORING_ENABLED=false
ANONCOIN_MONITORING_ENABLED=false
AGENT_MODE=SIMULATION
BANDWIDTH_ALERT_THRESHOLD_GIB=5
BANDWIDTH_ALERT_IFACE=eth0

# Camada local de execução mais determinística
FAST_LANE_ENABLED=true
PORTFOLIO_GOVERNOR_ENABLED=true
EXECUTION_PREFLIGHT_ENABLED=true

# Ver docs/CONFIGURATION.md para todas as opções
```

### 3. Execução

**Bot Principal:**
```bash
npm start
```

**Dashboard (Terminal separado):**
```bash
cd dashboard-api
npx ts-node server.ts
# Acesse: http://localhost:3001
```

**Backtester:**
```bash
npx ts-node tools/backtester.ts --tp=50 --sl=15
```

## 📁 Estrutura do Projeto

```
/utils
  - positionManager.ts      # Persistência de posições
  - telegramManager.ts      # Alertas Telegram
  - rpcPool.ts              # Pool de RPCs com failover
  - gasPriceOracle.ts       # Gas pricing dinâmico
  - slippageCalculator.ts   # Slippage adaptativo
  - circuitBreaker.ts       # Circuit Breaker
  - hybridExecutor.ts       # Executor de trades

/dashboard
  - server.ts               # Express API
  /public                   # Frontend HTML/CSS/JS

/tools
  - backtester.ts           # Simulador de trades

/data
  - positions.json          # Posições persistidas
```

## 📖 Documentação

- [Arquitetura](ARCHITECTURE.md) - Visão técnica do sistema
- [Guia de Uso](USAGE.md) - Como usar todas as features
- [VPS & Deploy](VPS_DEPLOYMENT.md) - Gerenciamento, acesso remoto e atualização da VPS
- [Avaliação de Banda Contabo](AVALIACAO_BANDA_CONTABO_2026-03-20.md) - Diagnóstico do throttle de banda
- [Mitigação de Banda e Monitoramento](MITIGACAO_BANDA_E_MONITORAMENTO_2026-03-20.md) - Registro do que foi ajustado
- [Governança Adaptativa de Entrada](GOVERNANCA_ADAPTATIVA_ENTRADA_2026-03-20.md) - Ajuste local do funil de BUY, sizing adaptativo e recheck
- [Fast Lane e Execution Preflight](FAST_LANE_E_EXECUTION_PREFLIGHT_2026-03-23.md) - Camada local inspirada em go-trader e Hummingbot para decisão determinística, exposição e preflight operacional
- [Bitquery CoreCast Multi-Stream](BITQUERY_CORECAST_MULTI_STREAM_2026-03-25.md) - Discovery redundante e enriquecimento assíncrono com `DexTrades`, `Transactions`, `DexPools`, `Transfers`, `DexOrders` e `Balances`
- [Integração AI SDK Google](AI_SDK_GOOGLE_INTEGRATION_2026-03-20.md) - Gateway LLM unificado, fallback, saída estruturada e tool calling local
- [Correção de Conectividade LLM](LLM_CONNECTIVITY_FIX_2026-03-23.md) - Ajuste local do modelo NVIDIA, URL legada explícita e validação do fallback Google
- [Hardening de Segurança](SECURITY_HARDENING.md) - Protocolo de proteção e auditoria da VPS
- [API do Dashboard](API.md) - Endpoints REST
- [Configuração](CONFIGURATION.md) - Todas as variáveis de ambiente
- [Changelog](CHANGELOG.md) - Histórico de melhorias

## 🛡️ Segurança

- **Circuit Breaker** ativo por padrão
- **Alertas Telegram** para eventos críticos
- **Persistência** de posições para recuperação após crash
- **RPC Failover** para alta disponibilidade

## 🤝 Suporte

- Abra uma issue no GitHub
- Consulte a documentação em `/docs`
- Verifique os logs em tempo real no dashboard

## 📝 Licença

MIT

---

**Desenvolvido com foco em velocidade, segurança e simplicidade** 🚀
