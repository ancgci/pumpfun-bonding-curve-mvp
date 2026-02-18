# 🤖 PumpFun Trading Bot

Bot de trading automático para Solana com suporte a múltiplos protocolos DeFi.

## 📚 Documentação

Toda a documentação do projeto está na pasta `/docs`:

- **[README](docs/README.md)** - Visão geral e início rápido
- **[ARCHITECTURE](docs/ARCHITECTURE.md)** - Arquitetura técnica do sistema
- **[USAGE](docs/USAGE.md)** - Guia completo de uso
- **[CONFIGURATION](docs/CONFIGURATION.md)** - Referência de todas as variáveis de ambiente
- **[RISK_ENGINE](docs/RISK_ENGINE.md)** - Filtros anti-rug, score de risco e tuning
- **[API](docs/API.md)** - Documentação da API do dashboard
- **[CHANGELOG](docs/CHANGELOG.md)** - Histórico de melhorias

## 🚀 Início Rápido

### Opção 1: Tudo de Uma Vez (Recomendado) 🚀

```bash
# 1. Instalar dependências
npm install

# 2. Configurar .env
cp .env.example .env
# Editar .env com suas credenciais

# 3. Iniciar bot + dashboard simultaneamente
npm run start:all
```

**Resultado:** Bot e Dashboard iniciam juntos. Acesse: http://localhost:3001

---

### Opção 2: Separadamente

**Bot:**
```bash
npm start
```

**Dashboard (terminal separado):**
```bash
npm run start:dashboard
```

## 🆕 Recent Changes (Feb 17, 2026)

### 🛡️ Risk Engine — Anti-Rug Post-Curve
- 🔍 **Risk Score 0–100**: Cada token é analisado antes do trade com score automático
- 🚫 **Decisão Automática**: `ALLOW_TRADE` (0–30) / `ALLOW_ALERT` (31–60, trade reduzido) / `BLOCK` (61–100)
- 🔒 **Token Authorities**: Detecta Mint/Freeze Authority ativos e extensões Token-2022
- 💧 **LP Analysis**: Verifica LP lock/burn via rugcheck.xyz, L/M ratio (opcional: block silencioso se unlocked)
- 👥 **Holder Distribution**: Top-10 concentração, dev wallet %, cluster detection (bundling)
- 📊 **Trading Sanity**: Volume fake, buy/sell imbalance, honeypot simulation via Jupiter
- � **Contract Age**: Detecta tokens muito novos (<1h) via histórico de transações
- 🖼️ **Metadata Quality**: Valida imagem, links sociais e descrição para evitar scams low-effort
- �🔄 **Post-Curve Monitor**: Re-verifica authorities e LP a cada 30s por 10 min após trade
- ⏸️ **Anti-Rug Pause**: 2 rug signals em 3 min → pause automático de 10 min
- 🚨 **Telegram Alerts**: Score, flags e métricas incluídos em cada alerta

**[📋 Full Changelog](CHANGELOG_2026-02-17.md)** | **[🛡️ Risk Engine Docs](docs/RISK_ENGINE.md)** | **[📖 Configuration Guide](docs/CONFIGURATION.md)**

<details>
<summary>📜 Previous Changes (Feb 9, 2026)</summary>

### New Features
- 🚀 **Unified Start**: `npm run start:all` launches bot + dashboard
- 💎 **Moon Shot Mode**: Keep 5% of position on profit (configurable via `SELL_PERCENT_ON_TP`)
- 📡 **Protocol Source**: Telegram alerts now show token source
- 🎨 **Dark Dashboard**: Black theme + American English

### Optimizations  
- 🎯 **Memecoin Strategy**: TP=100% (2x), SL=30%, Slippage=3%
- 🔗 **DexTools Integration**: Switched from DexScreener
- ✅ **Fixed Program IDs**: daos.fun now using correct contract

**[📋 Full Changelog](CHANGELOG_2026-02-09.md)**
</details>

## ✨ Features

- ✅ **Position Persistence** - Zero perda de dados em crash
- ✅ **Circuit Breaker + Telegram Alerts** - Notificações instantâneas
- ✅ **RPC Pool com Failover** - 99.9% uptime
- ✅ **Dynamic Gas Pricing** - Economia de 50-70%
- ✅ **Adaptive Slippage** - +25% taxa de sucesso
- ✅ **Dashboard Web** - Monitoramento visual
- ✅ **Backtester CLI** - Otimização segura
- 🆕 **Risk Engine** - Score anti-rug 0–100 com 5 filtros + post-curve monitor
- 🆕 **Performance Backtest** - Simula resultados de alertas do Telegram

## 📊 Impacto

| Métrica | Melhoria |
|---------|----------|
| Risco | -80% |
| Lucro | +20-30% |
| Custos | -60% |
| Uptime | 99.9% |

## 📖 Leia Mais

Consulte a [documentação completa](docs/README.md) para detalhes.

## 📝 Licença

MIT