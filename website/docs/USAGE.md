# Guia de Uso

## Índice
1. [Configuração Inicial](#configuração-inicial)
2. [Executar o Bot](#executar-o-bot)
3. [Dashboard](#dashboard)
4. [Backtester](#backtester)
5. [Monitoramento](#monitoramento)
6. [Troubleshooting](#troubleshooting)

---

## Configuração Inicial

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Arquivo `.env`

Consulte [`CONFIGURATION.md`](CONFIGURATION.md) para lista completa de variáveis.

**Mínimo Necessário:**
```bash
# RPC Principal
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Wallet
SECRET_KEY_JSON=[1,2,3,...,64]

# Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789

# Trading
BUY_AMOUNT_SOL=0.05
TAKE_PROFIT_PERCENT=40
STOP_LOSS_PERCENT=25
```

### 3. Criar Diretórios
```bash
mkdir data
```

---

## Executar o Bot

### Modo Normal
```bash
npm start
```

O bot irá:
- ✅ Carregar posições salvas do disco
- ✅ Conectar aos monitores gRPC
- ✅ Iniciar monitoramento de todos os protocolos
- ✅ Executar trades automaticamente

### Logs Importantes
```
✅ Carregando configurações...
🔄 X posições carregadas do disco (Y ativas)
✅ RPC Pool inicializado com 3 endpoints
🤖 Bot iniciado e monitorando...
```

---

## Dashboard

### Como Iniciar o Dashboard - Passo a Passo

#### Pré-requisito: Bot Rodando

Antes de tudo, certifique-se que o bot está rodando:
```bash
cd C:\Users\srant\Documentos\Projetos\pumpfun-bonding-curve-Test
npm start
```
Deixe esse terminal **aberto e rodando**.

---

#### Passo 1: Abrir Novo Terminal

Você precisa de **2 terminais separados**:
- Terminal 1: Bot (já está rodando ✅)
- Terminal 2: Dashboard (vamos iniciar agora)

**Abrir novo terminal:**
- Pressione `Ctrl + Shift + '` no VS Code
- Ou clique no `+` ao lado do terminal atual
- Ou abra um novo PowerShell/CMD

---

#### Passo 2: Navegar para a Pasta do Dashboard

No **novo terminal**, execute:
```bash
cd dashboard
```

Confirme que está na pasta certa:
```bash
dir
```

Você deve ver:
```
server.ts
public\
```

---

#### Passo 3: Iniciar o Servidor

Execute:
```bash
npx ts-node server.ts
```

**Saída esperada:**
```
✅ Dashboard server rodando em http://localhost:3001
📊 API disponível em:
   - http://localhost:3001/api/stats
   - http://localhost:3001/api/positions
   - http://localhost:3001/api/cb-status
```

---

#### Passo 4: Abrir no Navegador

**Opção A - Via terminal:**
```bash
start http://localhost:3001
```

**Opção B - Manual:**
1. Abra Chrome/Edge/Firefox
2. Digite: `http://localhost:3001`
3. Pressione Enter

---

### O Que Você Verá

#### 1. Estatísticas Gerais
- 💰 Total Investido (SOL)
- 📊 Taxa de Sucesso (%)
- ✅ Vitórias
- ❌ Perdas

#### 2. Circuit Breaker Status
- 🟢 Operacional / 🔴 Ativado
- Perda Diária (SOL)
- Falhas Consecutivas
- Motivo do trip

#### 3. Posições Ativas
- Token (mint address)
- Tempo desde compra ("2h 15m")
- SOL investido
- Take Profit / Stop Loss

**Auto-Refresh:** A cada 5 segundos

---

### Para Parar

**Dashboard (Terminal 2):**
```bash
Ctrl + C
```

**Bot (Terminal 1):**
```bash
Ctrl + C
```

---

### Troubleshooting

#### "Port 3001 already in use"
Porta já está em uso.

**Solução 1 - Encerrar processo:**
```bash
netstat -ano | findstr :3001
# Anote o PID (último número)
taskkill /PID <numero_pid> /F
```

**Solução 2 - Mudar porta:**
Edite `dashboard/server.ts` linha 7:
```typescript
const PORT = 3002; // Trocar para 3002
```

#### Dashboard não mostra dados
- ✅ Bot está rodando?
- ✅ Arquivo `data/positions.json` existe?
- ✅ Execute pelo menos 1 trade para gerar dados

#### Erro "Cannot find module"
Instale as dependências:
```bash
npm install
```

---

## Backtester

### Uso Básico
```bash
npx ts-node tools/backtester.ts --tp=50 --sl=15
```

### Parâmetros

| Parâmetro | Descrição | Padrão |
|-----------|-----------|--------|
| `--tp` | Take Profit (%) | 40 |
| `--sl` | Stop Loss (%) | 25 |
| `--trades` | Número de trades a simular | 100 |

### Exemplos

**Testar estratégia agressiva:**
```bash
npx ts-node tools/backtester.ts --tp=60 --sl=10 --trades=200
```

**Testar estratégia conservadora:**
```bash
npx ts-node tools/backtester.ts --tp=30 --sl=30 --trades=200
```

**Comparar múltiplas configurações:**
```bash
npx ts-node tools/backtester.ts --tp=40 --sl=25
npx ts-node tools/backtester.ts --tp=50 --sl=20
npx ts-node tools/backtester.ts --tp=60 --sl=15
```

### Interpretar Resultados

**Bom resultado:**
- ✅ P&L Total > 0
- ✅ Win Rate > 60%
- ✅ Sharpe Ratio > 1.5
- ✅ Profit Factor > 2.0

**Mal resultado:**
- ❌ P&L Total < 0
- ❌ Win Rate < 50%
- ❌ Sharpe Ratio < 1.0
- ❌ Max Drawdown muito alto

---

## Monitoramento

### Via Terminal
Os logs mostram:
```
🛒 Iniciando compra do token ABC...
✅ Compra realizada: signature
📊 Slippage usado: 1.2%
⚡ Gas fee: 8500 µL
```

### Via Telegram
Você receberá mensagens para:
- ✅ Compra executada
- ✅ Venda executada (TP ou SL)
- 🚨 Circuit Breaker ativado
- ⚠️ Falhas de RPC

### Via Dashboard
Veja em tempo real:
- Posições ativas
- Taxa de sucesso
- Status do Circuit Breaker

---

## Funcionalidades Avançadas

### 1. Modo Single Trade
**Ativar:** `.env`
```bash
SINGLE_TRADE_MODE=true
```

**Efeito:** Apenas 1 posição aberta por vez.

---

### 2. Filtro de Tipo de Trade
**Opções:**
```bash
TRADE_TYPE_FILTER=BUY    # Apenas compras
TRADE_TYPE_FILTER=SELL   # Apenas vendas
TRADE_TYPE_FILTER=BOTH   # Ambos (padrão)
```

---

### 3. Desativar Auto-Compra
```bash
AUTO_BUY_ENABLED=false
```

**Efeito:** Bot apenas monitora, não executa compras automaticamente.

---

### 4. Circuit Breaker Customizado
```bash
CB_MAX_DAILY_LOSS_SOL=1.0         # Parar se perder > 1 SOL/dia
CB_MAX_CONSECUTIVE_FAILURES=5     # Parar após 5 falhas seguidas
CB_RESET_HOURS=24                 # Reset após 24h
```

---

## Troubleshooting

### Bot não inicia
**Erro:** `Keypair não disponível`
- ✅ Verifique `SECRET_KEY_JSON` no `.env`
- ✅ Deve ser um array JSON: `[1,2,3,...,64]`

### Telegram não envia mensagens
**Erro:** `401 Unauthorized`
- ✅ Verifique `TELEGRAM_BOT_TOKEN`
- ✅ Verifique `TELEGRAM_CHAT_ID`
- ✅ Envie `/start` para o bot no Telegram

### RPC connection failed
**Erro:** `Failed to connect to RPC`
- ✅ Verifique `RPC_URL` está correto
- ✅ Teste manualmente: `curl https://your-rpc-url`
- ✅ Configure `RPC_URL_FALLBACK_1` e `RPC_URL_FALLBACK_2`

### Dashboard não carrega
**Erro:** `ECONNREFUSED localhost:3001`
- ✅ Verifique se `npx ts-node dashboard/server.ts` está rodando
- ✅ Verifique porta 3001 não está ocupada

### Circuit Breaker ativado inesperadamente
**Sintoma:** Bot para de operar sem motivo aparente
- ✅ Verifique `circuit_breaker_state.json`
- ✅ Ajuste `CB_MAX_DAILY_LOSS_SOL` para valor maior
- ✅ Reset manual: deletar `circuit_breaker_state.json` e reiniciar bot

### Gas fees muito altos
**Sintoma:** Gastando > 20k µL consistentemente
- ✅ Verifique `GAS_MAX_FEE` no `.env`
- ✅ Reduzir para `30000` se necessário
- ✅ Verificar se `GAS_PERCENTILE` está muito alto (reduza para 50)

### Trades falhando com slippage
**Sintoma:** Muitos trades recusados
- ✅ Aumentar `MAX_SLIPPAGE_BPS` (ex: 500 = 5%)
- ✅ Verificar se token é muito ilíquido
- ✅ Reducir `BUY_AMOUNT_SOL` para valores menores

---

## Melhores Práticas

### 1. Comece Pequeno
```bash
BUY_AMOUNT_SOL=0.01  # Começar com 0.01 SOL
```

### 2. Configure Circuit Breaker Apertado
```bash
CB_MAX_DAILY_LOSS_SOL=0.5  # Perda máxima: 0.5 SOL/dia
```

### 3. Use Backtester Antes de Mudar Parâmetros
```bash
# Teste antes de aplicar
npx ts-node tools/backtester.ts --tp=60 --sl=10
```

### 4. Monitore o Dashboard Regularmente
- Acesse `http://localhost:3001` diariamente
- Verifique taxa de sucesso
- Ajuste TP/SL conforme necessário

### 5. Mantenha RPCs de Fallback
```bash
RPC_URL=https://mainnet.helius-rpc.com/...
RPC_URL_FALLBACK_1=https://api.mainnet-beta.solana.com
RPC_URL_FALLBACK_2=https://solana-api.projectserum.com
```

---

## Próximos Passos

1. ✅ Configure o `.env`
2. ✅ Teste com `BUY_AMOUNT_SOL=0.01`
3. ✅ Rode backtester para otimizar TP/SL
4. ✅ Inicie o bot + dashboard
5. ✅ Monitore por 24h
6. ✅ Ajuste parâmetros conforme necessário
