# Referência de Configuração

Todas as variáveis de ambiente disponíveis no arquivo `.env`.

## RPCs

### `RPC_URL` **(obrigatório)**
Endpoint principal da Solana.

**Exemplos:**
```bash
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
RPC_URL=https://rpc.ankr.com/solana
RPC_URL=https://api.mainnet-beta.solana.com
```

**Recomendação:** Use serviços premium (Helius, Triton, QuickNode) para melhor performance.

---

### `RPC_URL_FALLBACK_1` e `RPC_URL_FALLBACK_2`
Endpoints de backup caso o principal falhe.

**Padrão:**
```bash
RPC_URL_FALLBACK_1=https://api.mainnet-beta.solana.com
RPC_URL_FALLBACK_2=https://solana-api.projectserum.com
```

---

## Wallet

### `SECRET_KEY_JSON` **(obrigatório)**
Chave privada da wallet em formato JSON array.

**Formato:**
```bash
SECRET_KEY_JSON=[1,2,3,4,...,64]
```

**Obter do Phantom:**
1. Phantom → Configurações → Exportar Chave Privada
2. Converter para array numérico

⚠️ **Segurança:** NUNCA compartilhe esta chave!

---

## Telegram

### `TELEGRAM_BOT_TOKEN` **(obrigatório)**
Token do bot Telegram.

**Obter:**
1. Falar com [@BotFather](https://t.me/BotFather)
2. `/newbot`
3. Copiar token

**Exemplo:**
```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

---

### `TELEGRAM_CHAT_ID` **(obrigatório)**
ID do chat onde receber mensagens.

**Obter:**
1. Enviar `/start` para [@userinfobot](https://t.me/userinfobot)
2. Copiar seu ID

**Exemplo:**
```bash
TELEGRAM_CHAT_ID=123456789
```

---

## Trading Básico

### `BUY_AMOUNT_SOL`
Quantidade de SOL para investir por trade.

**Padrão:** `0.1`

**Recomendação:** Comece com `0.01` para testes.

```bash
BUY_AMOUNT_SOL=0.05
```

---

### `TAKE_PROFIT_PERCENT`
Percentual de lucro para venda automática.

**Padrão:** `20`

**Exemplo:** `40` = vender quando preço subir 40%

```bash
TAKE_PROFIT_PERCENT=40
```

---

### `STOP_LOSS_PERCENT`
Percentual de perda para venda automática.

**Padrão:** `25`

**Exemplo:** `15` = vender quando preço cair 15%

```bash
STOP_LOSS_PERCENT=15
```

---

### `SLIPPAGE_BPS`
Slippage máximo tolerado em basis points (100 bps = 1%).

**Padrão:** `50` (0.5%)

**Nota:** Com Adaptive Slippage ativo, este é o fallback.

```bash
SLIPPAGE_BPS=100  # 1%
```

---

## Trading Avançado

### `AUTO_BUY_ENABLED`
Ativar compras automáticas.

**Padrão:** `false`

```bash
AUTO_BUY_ENABLED=true   # Comprar automaticamente
AUTO_BUY_ENABLED=false  # Apenas monitorar
```

---

### `AUTO_SELL_TAKE_PROFIT`
Ativar venda automática ao atingir TP.

**Padrão:** `true`

```bash
AUTO_SELL_TAKE_PROFIT=true
```

---

### `AUTO_SELL_STOP_LOSS`
Ativar venda automática ao atingir SL.

**Padrão:** `true`

```bash
AUTO_SELL_STOP_LOSS=true
```

---

### `SINGLE_TRADE_MODE`
Permitir apenas 1 posição aberta por vez.

**Padrão:** `false`

```bash
SINGLE_TRADE_MODE=true   # Máximo 1 posição
SINGLE_TRADE_MODE=false  # Múltiplas posições
```

---

### `TRADE_TYPE_FILTER`
Filtrar tipos de trade a executar.

**Opções:** `BUY`, `SELL`, `BOTH`

**Padrão:** `BOTH`

```bash
TRADE_TYPE_FILTER=BUY    # Apenas compras
TRADE_TYPE_FILTER=SELL   # Apenas vendas
TRADE_TYPE_FILTER=BOTH   # Ambos
```

---

## Circuit Breaker

### `CB_MAX_DAILY_LOSS_SOL`
Perda máxima diária (SOL) antes de parar o bot.

**Padrão:** `2.0`

```bash
CB_MAX_DAILY_LOSS_SOL=1.0  # Parar após perder 1 SOL
```

---

### `CB_MAX_CONSECUTIVE_FAILURES`
Número de falhas consecutivas antes de parar.

**Padrão:** `10`

```bash
CB_MAX_CONSECUTIVE_FAILURES=5
```

---

### `CB_RESET_HOURS`
Horas para reset automático do Circuit Breaker.

**Padrão:** `24`

```bash
CB_RESET_HOURS=12  # Reset após 12 horas
```

---

## Gas Pricing (Otimização)

### `GAS_BASE_FEE`
Fee mínimo de gas (microLamports).

**Padrão:** `5000`

```bash
GAS_BASE_FEE=5000  # 5k microLamports
```

---

### `GAS_MAX_FEE`
Fee máximo de gas (microLamports).

**Padrão:** `50000`

```bash
GAS_MAX_FEE=30000  # Limitar a 30k µL
```

---

### `GAS_PERCENTILE`
Percentil dos fees recentes a usar.

**Padrão:** `75`

**Explicação:**
- `50` = Mediana (mais econômico, pode falhar em picos)
- `75` = Balanceado (recomendado)
- `90` = Agressivo (garante execução, mais caro)

```bash
GAS_PERCENTILE=75
```

---

## Slippage Adaptativo (Otimização)

### `MIN_SLIPPAGE_BPS`
Slippage mínimo (tokens muito líquidos).

**Padrão:** `30` (0.3%)

```bash
MIN_SLIPPAGE_BPS=30
```

---

### `MAX_SLIPPAGE_BPS`
Slippage máximo (tokens ilíquidos).

**Padrão:** `500` (5%)

```bash
MAX_SLIPPAGE_BPS=300  # Máximo 3%
```

---

## Jito

### `JITO_BLOCK_ENGINE_URL`
Endpoint do Jito Block Engine.

**Padrão:** `https://mainnet.block-engine.jito.wtf`

```bash
JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf
```

---

### `JITO_TIP_LAMPORTS`
Gorjeta para validadores Jito (em lamports).

**Padrão:** `10000` (0.00001 SOL)

```bash
JITO_TIP_LAMPORTS=50000  # 0.00005 SOL
```

---

## Jupiter API

### `JUPITER_API_BASE`
URL base da Jupiter API.

**Padrão:** `https://quote-api.jup.ag/v6`

```bash
JUPITER_API_BASE=https://quote-api.jup.ag/v6
```

---

### `JUPITER_API_KEY`
Chave de API da Jupiter (opcional).

**Obter:** [Jupiter.ag](https://station.jup.ag/docs/api_v6)

```bash
JUPITER_API_KEY=your_api_key_here
```

---

## Protocolos

### `PUMPFUN_PROGRAM_ID`
Program ID do PumpFun.

**Padrão:** `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`

```bash
PUMPFUN_PROGRAM_ID=6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
```

---

### `BONDING_CURVE`
Endereço da bonding curve (PumpFun).

```bash
BONDING_CURVE=<endereço_da_bonding_curve>
```

---

## Exemplo de `.env` Completo

```bash
# === RPCs ===
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
RPC_URL_FALLBACK_1=https://api.mainnet-beta.solana.com
RPC_URL_FALLBACK_2=https://solana-api.projectserum.com

# === Wallet ===
SECRET_KEY_JSON=[1,2,3,...,64]

# === Telegram ===
TELEGRAM_BOT_TOKEN=123456789:ABC...
TELEGRAM_CHAT_ID=123456789

# === Trading ===
BUY_AMOUNT_SOL=0.05
TAKE_PROFIT_PERCENT=40
STOP_LOSS_PERCENT=25
SLIPPAGE_BPS=50

AUTO_BUY_ENABLED=true
AUTO_SELL_TAKE_PROFIT=true
AUTO_SELL_STOP_LOSS=true
SINGLE_TRADE_MODE=false
TRADE_TYPE_FILTER=BOTH

# === Circuit Breaker ===
CB_MAX_DAILY_LOSS_SOL=1.0
CB_MAX_CONSECUTIVE_FAILURES=5
CB_RESET_HOURS=24

# === Gas Pricing ===
GAS_BASE_FEE=5000
GAS_MAX_FEE=50000
GAS_PERCENTILE=75

# === Slippage Adaptativo ===
MIN_SLIPPAGE_BPS=30
MAX_SLIPPAGE_BPS=500

# === Jito ===
JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf
JITO_TIP_LAMPORTS=10000

# === Jupiter ===
JUPITER_API_BASE=https://quote-api.jup.ag/v6
JUPITER_API_KEY=

# === Protocolos ===
PUMPFUN_PROGRAM_ID=6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
BONDING_CURVE=
```
