# Welcome to PumpFun Bonding Curve Monitoring Script

This script monitors bonding curve of Pumpfun tokens and alerts when any token reachs 97.7% of the bonding curve. 
To get monitoring signal on your Telegram channel, you need to add your Telegram Bot to your channel as an Administrator.

## 🔄 Novo Sistema Híbrido de Trading

O projeto agora inclui um sistema híbrido de trading que pode:
- Comprar e vender diretamente no contrato da PumpFun enquanto o token ainda estiver na curva
- Vender via Jupiter quando o token já tiver migrado para a Raydium

## 📊 Monitoramento Flexível de Protocolos

O projeto agora suporta monitoramento flexível de diferentes protocolos:
- **PumpFun**: Monitoramento tradicional de tokens PumpFun
- **Meteora DBC**: Monitoramento de tokens criados na Meteora DBC
- **Bonk.fun**: Monitoramento de tokens criados no Bonk.fun
- **daos.fun**: Monitoramento de tokens criados no daos.fun
- **Moonshot Screener**: Monitoramento de tokens criados no Moonshot Screener
- **anoncoin.it**: Monitoramento de tokens criados no anoncoin.it
- **BOTH**: Monitoramento simultâneo de múltiplos protocolos

### Arquitetura

| Etapa | Ação                                 | Origem dos dados                              | Execução          |
| ----- | ------------------------------------ | --------------------------------------------- | ----------------- |
| 1️⃣   | Monitorar curva (ex: 97.7%)          | gRPC da Shyft + contrato Pump.fun/Meteora DBC/Bonk.fun/daos.fun/Moonshot Screener/anoncoin.it | 🚀 Bot atual      |
| 2️⃣   | Comprar quando atingir ponto ideal   | 📜 Interação direta com contrato Pump.fun     | `buyOnPumpFun()`  |
| 3️⃣   | Acompanhar migração para Raydium     | Verificar criação de LP                       | Contrato Pump.fun |
| 4️⃣   | Vender automaticamente após migração | 🔁 Via API Jupiter (swap token → SOL/USDC)    | `sellViaJupiter()`|

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
    STOP_LOSS_PERCENT=25
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
    
    # Monitoramento de Protocolos
    # Opções: "PUMPFUN", "METEORA_DBC", "BONK_FUN", "DAOS_FUN", "MOONSHOT", "ANONCOIN", "BOTH"
    MONITORING_PROTOCOL=PUMPFUN
    
    # Monitoramento de Meteora DBC
    METEORA_DBC_MONITORING_ENABLED=true
    METEORA_DBC_ALERT_THRESHOLD=97.7
    METEORA_DBC_PROGRAM_ID=dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
    
    # Monitoramento de Bonk.fun
    BONK_FUN_MONITORING_ENABLED=true
    BONK_FUN_ALERT_THRESHOLD=97.7
    BONK_FUN_PROGRAM_ID=BONK_FUN_PROGRAM_ID_PLACEHOLDER
    
    # Monitoramento de daos.fun
    DAOS_FUN_MONITORING_ENABLED=true
    DAOS_FUN_ALERT_THRESHOLD=97.7
    DAOS_FUN_PROGRAM_ID=DAOS_FUN_PROGRAM_ID_PLACEHOLDER
    
    # Monitoramento do Moonshot Screener
    MOONSHOT_MONITORING_ENABLED=true
    MOONSHOT_ALERT_THRESHOLD=97.7
    MOONSHOT_PROGRAM_ID=MOONSHOT_PROGRAM_ID_PLACEHOLDER
    
    # Monitoramento do anoncoin.it
    ANONCOIN_MONITORING_ENABLED=true
    ANONCOIN_ALERT_THRESHOLD=97.7
    ANONCOIN_PROGRAM_ID=ANONCOIN_PROGRAM_ID_PLACEHOLDER
   ```

3. **Build and Run**
   ```bash
   # Install dependencies
   npm install

   # Run in development mode
   ts-node index.ts
   ```

## 🧪 Testes

O projeto inclui diversos scripts de teste para validar as funcionalidades:

```bash
# Testar todas as melhorias
npm run test:all

# Testar metadados
npm run test:metadata

# Testar modo de trade único
npm run test:single-trade

# Testar filtro de tipo de trade
npm run test:trade-type

# Testar configuração do Stop Loss
npm run test:stop-loss

# Testar trading real (descomentar linhas no arquivo para executar)
npm run test:real-trading

# Testar com token específico
npm run test:specific-token
```

## 🛡️ Segurança

- Nunca commite sua chave privada no código
- Use variáveis de ambiente para armazenar segredos
- Teste sempre em testnet antes de usar em mainnet