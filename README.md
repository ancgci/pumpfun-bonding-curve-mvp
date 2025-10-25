# Welcome to PumpFun Bonding Curve Monitoring Script

This script monitors bonding curve of Pumpfun tokens and alerts when any token reachs 97.7% of the bonding curve. 
To get monitoring signal on your Telegram channel, you need to add your Telegram Bot to your channel as an Administrator.

## 🔄 Novo Sistema Híbrido de Trading

O projeto agora inclui um sistema híbrido de trading que pode:
- Comprar e vender diretamente no contrato da PumpFun enquanto o token ainda estiver na curva
- Vender via Jupiter quando o token já tiver migrado para a Raydium

### Arquitetura

| Etapa | Ação                                 | Origem dos dados                              | Execução          |
| ----- | ------------------------------------ | --------------------------------------------- | ----------------- |
| 1️⃣   | Monitorar curva (ex: 97.7%)          | gRPC da Shyft + contrato Pump.fun             | 🚀 Bot atual      |
| 2️⃣   | Comprar quando atingir ponto ideal   | 📜 Interação direta com contrato Pump.fun     | `buyOnPumpFun()`  |
| 3️⃣   | Acompanhar migração para Raydium     | Verificar criação de LP                       | Contrato Pump.fun |
| 4️⃣   | Vender automaticamente após migração | 🔁 Via API Jupiter (swap token → SOL/USDC)    | `sellViaJupiter()`|

## 📊 Melhorias na Leitura de Dados e Metadados

O projeto agora inclui um sistema aprimorado de coleta e cache de metadados que busca informações de múltiplas fontes:

### Fontes de Dados
1. **PumpFun API** - Dados primários dos tokens PumpFun
2. **Solana.fm** - Informações gerais de tokens Solana
3. **DexScreener** - Dados de mercado e liquidez

### Informações Coletadas
- Nome e símbolo do token
- Descrição e imagem
- Links sociais (Twitter, Telegram, Website)
- Detecção de scams
- Dados financeiros (Market Cap, Preço, Volume 24h, Liquidez)
- Informações do criador e data de criação

### Sistema de Cache
- Cache de 30 minutos para metadados
- Configuração via variáveis de ambiente
- Estatísticas de desempenho

## 🚦 Controle de Trades

### Modo de Trade Único
O sistema agora inclui um modo de trade único que permite apenas uma posição aberta por vez:
- Quando uma posição é aberta, o bot não executará novas compras
- Apenas após fechar a posição (Take Profit ou Stop Loss) novas compras serão permitidas
- Configurável via variável de ambiente

### Filtro de Tipo de Trade
Agora é possível filtrar quais tipos de trades o bot pode executar:
- **BUY**: Apenas operações de compra
- **SELL**: Apenas operações de venda
- **BOTH**: Ambas as operações (padrão)

## 📈 Monitor de Desempenho

O sistema inclui um monitor de desempenho que rastreia:
- Número total de transações processadas
- Tokens únicos monitorados
- Taxa de acerto do cache
- Chamadas de API realizadas
- Erros ocorridos
- Relatórios automáticos a cada 10 minutos

## 📚 Documentação Adicional

Para mais detalhes sobre a implementação do sistema híbrido, consulte o arquivo [IMPLEMENTACAO_HIBRIDA.md](IMPLEMENTACAO_HIBRIDA.md).

Para uma análise completa do projeto e oportunidades de melhoria, consulte o arquivo [ANALISE_E_MELHORIAS.md](ANALISE_E_MELHORIAS.md).

Para o plano de ação detalhado para implementar as melhorias, consulte o arquivo [PLANO_DE_ACAO.md](PLANO_DE_ACAO.md).

## Prerequisites

- [NodeJS](https://nodejs.org/en/download) (> v18.0.0)
- Shyft RPC, Shyft GRPC, Telegram Bot Token, 

## Quick Start

1. **Clone and Install**
   ```bash
   git clone [your-repository-url]
   cd [project-directory]
   ```

2. **Configure Environment**
   
   Create a `.env` file in the root directory:
   ```env
    SHYFT_RPC=""
    SHYFT_GRPC=""
    TELEGRAM_BOT_TOKEN=""
    ALERT_THRESHOLD=97.7
    
    # Configurações de Trading Híbrido
    RPC_URL=https://api.mainnet-beta.solana.com
    SECRET_KEY_JSON=[SUA_PRIVATE_KEY_EM_ARRAY]
    PUMPFUN_PROGRAM_ID=6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
    BUY_AMOUNT_SOL=0.1
    TAKE_PROFIT_PERCENT=20
    SLIPPAGE_BPS=50
    AUTO_BUY_ENABLED=true
    AUTO_SELL_TAKE_PROFIT=true
    AUTO_SELL_STOP_LOSS=true
    SINGLE_TRADE_MODE=true
    TRADE_TYPE_FILTER=BOTH
    
    # Configurações de Telegram
    MIN_MESSAGE_INTERVAL=10000
    
    # Configurações de Metadados
    METADATA_CACHE_TTL=1800
    ENABLE_METADATA_FETCH=true
    METADATA_CACHE_CHECK_PERIOD=600
   ```

3. **Build and Run**
   ```bash
   # Install dependencies
   npm install

   # Run in development mode
   ts-node index.ts
   ```

## Testes

Para testar as melhorias implementadas:

```bash
# Testar busca de metadados
npm run test:metadata

# Testar todas as melhorias
npm run test:all

# Testar modo de trade único
npm run test:single-trade

# Testar filtro de tipo de trade
npm run test:trade-type
```

## Feature

| Variable | Description | Required |
|----------|-------------|----------|
| `LANGUAGE` | Typescript | Yes |
| `BOT` | Telegram Bot, Telegram Channel | Yes |
| `ENVIRONMENT` | Shyft RPC, Shyft gRPC | Yes |