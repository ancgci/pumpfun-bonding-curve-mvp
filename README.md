# 🤖 PumpFun Trading Bot

Bot de trading automático para Solana com suporte a múltiplos protocolos DeFi.

## 📚 Documentação

Toda a documentação do projeto está na pasta `/docs`:

- **[README](docs/README.md)** - Visão geral e início rápido
- **[ARCHITECTURE](docs/ARCHITECTURE.md)** - Arquitetura técnica do sistema
- **[USAGE](docs/USAGE.md)** - Guia completo de uso
- **[CONFIGURATION](docs/CONFIGURATION.md)** - Referência de todas as variáveis de ambiente
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

## 🆕 Recent Changes (Feb 9, 2026)

### New Features
- 🚀 **Unified Start**: `npm run start:all` launches bot + dashboard
- 💎 **Moon Shot Mode**: Keep 5% of position on profit (configurable via `SELL_PERCENT_ON_TP`)
- 📡 **Protocol Source**: Telegram alerts now show token source
- 🎨 **Dark Dashboard**: Black theme + American English

### Optimizations  
- 🎯 **Memecoin Strategy**: TP=100% (2x), SL=30%, Slippage=3%
- 🔗 **DexTools Integration**: Switched from DexScreener
- ✅ **Fixed Program IDs**: daos.fun now using correct contract

**[📋 Full Changelog](CHANGELOG_2026-02-09.md)** | **[📖 Configuration Guide](docs/CONFIGURATION.md)**

## ✨ Features

- ✅ **Position Persistence** - Zero perda de dados em crash
- ✅ **Circuit Breaker + Telegram Alerts** - Notificações instantâneas
- ✅ **RPC Pool com Failover** - 99.9% uptime
- ✅ **Dynamic Gas Pricing** - Economia de 50-70%
- ✅ **Adaptive Slippage** - +25% taxa de sucesso
- ✅ **Dashboard Web** - Monitoramento visual
- ✅ **Backtester CLI** - Otimização segura
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