# Referência de Configuração

Todas as variáveis de ambiente disponíveis no arquivo `.env`.

## RPCs

### `RPC_URL` **(obrigatório)**
Endpoint principal da Solana. Agora integrado ao `rpcPool` para failover automático.

---

### `RPC_FALLBACK_LIST`
Lista de URLs de backup separadas por vírgula. O bot rotacionará entre elas se o principal falhar ou atingir limite de cota.

**Exemplo:**
```bash
RPC_FALLBACK_LIST=https://url1,https://url2,https://url3
```

---

### `WS_URL` e `WS_FALLBACK_LIST`
URL de WebSocket primária e lista de fallbacks. Usado como redundância ao gRPC para captura de eventos em tempo real.

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

## Dashboards & Alertas

### `ALERT_THRESHOLD`
Percentual de progresso da bonding curve (0-100) para enviar o alerta ao Telegram.

**Nota Técnica**: A partir de Março de 2026, a análise da IA foi desacoplada deste parâmetro. O robô inicia a **Descoberta e Operação aos 15%**, mas só envia o alerta ao Telegram no valor configurado aqui (ex: 90%).

**Padrão:** `90`

```bash
ALERT_THRESHOLD=90 # Alerta no Telegram apenas no final da curva
```

---

### `VERBOSE_TRANSACTION_LOGS`
Controla se o bot escreve o bloco detalhado de cada transação em nível `info`.

**Padrão operacional recomendado na VPS:** `false`

```bash
VERBOSE_TRANSACTION_LOGS=false
```

Use `true` apenas para troubleshooting temporário.

---

### `MONITORING_PROTOCOL`
Define o escopo principal do stream on-chain.

**Opções:** `PUMPFUN`, `METEORA_DBC`, `BONK_FUN`, `DAOS_FUN`, `MOONSHOT`, `ANONCOIN`, `BOTH`

**Padrão recomendado na VPS:** `PUMPFUN`

```bash
MONITORING_PROTOCOL=PUMPFUN
```

> [!WARNING]
> O modo `BOTH` ou o monitoramento simultâneo de múltiplos protocolos aumenta o consumo contínuo de banda, processamento e logging. Na VPS da Contabo, o baseline recomendado passou a ser `PUMPFUN` apenas.

---

### Flags de protocolos auxiliares
Mesmo com `MONITORING_PROTOCOL=PUMPFUN`, mantenha desabilitados no servidor os protocolos que não estiver usando:

```bash
METEORA_DBC_MONITORING_ENABLED=false
BONK_FUN_MONITORING_ENABLED=false
DAOS_FUN_MONITORING_ENABLED=false
MOONSHOT_MONITORING_ENABLED=false
ANONCOIN_MONITORING_ENABLED=false
```

Ative um protocolo extra apenas quando houver necessidade operacional clara.

---

### `BANDWIDTH_ALERT_THRESHOLD_GIB`
Limite diário de tráfego usado pelo alerta via Telegram baseado no `vnstat`.

**Padrão operacional atual:** `5`

```bash
BANDWIDTH_ALERT_THRESHOLD_GIB=5
```

Isso representa um alerta preventivo, bem abaixo do throughput máximo aplicado pela Contabo.

---

### `BANDWIDTH_ALERT_IFACE`
Interface de rede monitorada pelo script de alerta de banda.

**Padrão operacional atual:** `eth0`

```bash
BANDWIDTH_ALERT_IFACE=eth0
```

---

### `BANDWIDTH_ALERT_CHAT_ID`
Chat de destino específico para o alerta diário de banda.

Se não for definido, o script usa `TELEGRAM_CHAT_ID`.

```bash
BANDWIDTH_ALERT_CHAT_ID=123456789
```

---

## Modos do Agente (Simulation vs Live)

### `AGENT_MODE`
Define se o agente orquestrador vai apenas simular operações ou executar trades reais na blockchain.

**Padrão:** `SIMULATION`

```bash
AGENT_MODE=SIMULATION # Executa análise plena e simula trades (Aprendizado)
AGENT_MODE=LIVE       # Executa análise e envia transação real na Solana
```

> [!NOTE] 
> **Filtros Flexíveis no modo SIMULATION:** 
> Para maximizar o aprendizado da Inteligência Artificial, o modo `SIMULATION` aplica **regras de pré-filtro mais brandas** do que o modo `LIVE`. 
> 
> No modo simulado:
> - A confiança exigida (`AGENT_MIN_CONFIDENCE`) é reduzida em até 20 pontos (mantendo um piso de 50%).
> - O pré-filtro de "Micro-Dump" tolera quedas mais bruscas (-15% em vez de -8% em 10s).
> - A detecção de "Falling Knife" aceita velas vermelhas maiores, permitindo testar reversões.
> - A exigência mínima de *holders* (baseada no progresso da bonding curve) é reduzida em 50%.
>
> Quando você altera o `.env` para `AGENT_MODE=LIVE`, todos os filtros rígidos de segurança e proteção de capital são ativados incondicionalmente para evitar perdas (rug pulls, snipers, etc).

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

## Configurações de Simulação

### `SIMULATION_TIMEOUT_MIN`
Tempo máximo (em minutos) para uma trade simulada permanecer aberta se não atingir TP ou SL.

**Padrão:** `20`

**Exemplo:** `10` = fechar automaticamente após 10 minutos.

```bash
SIMULATION_TIMEOUT_MIN=20
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

### `JITO_TIP_AMOUNT`
Gorjeta para validadores Jito em SOL.

**Padrão:** `0.0001`

```bash
JITO_TIP_AMOUNT=0.0001
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

## Sentiment Analysis (Social Listening)

### `SANTIMENT_API_KEY`
Chave para volume social e dominância via Santiment.

### `HUGGINGFACE_API_KEY`
Chave para análise de sentimento NLP via HuggingFace Inference API.

### `SENSE_AI_ENABLED`
Ativa análise de hype específica para tokens Pump.fun (`true`/`false`).

---

## Moralis

### `MORALIS_API_KEY`
Chave de API da Moralis Solana para análise profunda de holders e risco.

---

---

## Multi-Agent Architecture

O bot utiliza uma estrutura de múltiplos agentes especializados localizados em `.agents/agents/`.

### Estrutura de Diretórios
- `.agents/agents/ScalperAgent/`: Estratégias de HFT/Scalping.
- `.agents/agents/RiskAgent/`: Verificações de segurança e anti-rug.
- `.agents/agents/SentimentAgent/`: Análise de hype e social.
- `.agents/orchestrator/`: Cérebro central que coordena a equipe.

### Comandos de Ativação (via Dashboard/Chat)
- `/agent:scalper`: Ativa apenas o modo scalper 5s.
- `/agent:risk`: Foca exclusivamente em proteção.
- `/agent:all`: Ativa a orquestração multi-agente completa (padrão).

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
RPC_FALLBACK_LIST=https://url1,https://url2
WS_URL=wss://your-primary-ws
WS_FALLBACK_LIST=wss://url1,wss://url2

# === Wallet ===
SECRET_KEY_JSON=[1,2,3,...,64]

# === Telegram ===
TELEGRAM_BOT_TOKEN=123456789:ABC...
TELEGRAM_CHAT_ID=123456789
BANDWIDTH_ALERT_CHAT_ID=
VERBOSE_TRANSACTION_LOGS=false
BANDWIDTH_ALERT_THRESHOLD_GIB=5
BANDWIDTH_ALERT_IFACE=eth0

# === Trading ===
BUY_AMOUNT_SOL=0.05
TAKE_PROFIT_PERCENT=40
STOP_LOSS_PERCENT=25
SLIPPAGE_BPS=50

AUTO_BUY_ENABLED=false
AUTO_SELL_TAKE_PROFIT=true
AUTO_SELL_STOP_LOSS=true
SINGLE_TRADE_MODE=false
TRADE_TYPE_FILTER=BOTH
AGENT_MODE=SIMULATION
ALERT_THRESHOLD=90

# === Monitoring Scope (recommended on VPS) ===
MONITORING_PROTOCOL=PUMPFUN
METEORA_DBC_MONITORING_ENABLED=false
BONK_FUN_MONITORING_ENABLED=false
DAOS_FUN_MONITORING_ENABLED=false
MOONSHOT_MONITORING_ENABLED=false
ANONCOIN_MONITORING_ENABLED=false

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
JITO_TIP_AMOUNT=0.0001

# === Jupiter ===
JUPITER_API_BASE=https://api.jup.ag/ultra
JUPITER_API_KEY=

# === Protocolos ===
PUMPFUN_PROGRAM_ID=6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
```
