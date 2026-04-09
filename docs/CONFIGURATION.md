# Referência de Configuração

Todas as variáveis de ambiente disponíveis no arquivo `.env`.

## RPCs

### `RPC_URL` **(obrigatório)**
Endpoint principal da Solana. Agora integrado ao `rpcPool` para failover automático.

**Ordem efetiva atual do `rpcPool`:**
1. `SHYFT_RPC` se configurado
2. `RPC_URL`
3. `RPC_FALLBACK_LIST` na ordem declarada

URLs duplicadas são deduplicadas antes da montagem do pool.

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

**Nota:** hoje o runtime não possui um `wsPool` equivalente ao `rpcPool`; esses valores ficam declarados para consumidores específicos e para futuras integrações de failover WS.

---

## gRPC Discovery

### `GRPC_PROVIDER_PREFERENCE`
Ordem de preferência dos providers gRPC declarados.

**Exemplo:**
```bash
GRPC_PROVIDER_PREFERENCE=bitquery,publicnode,custom,legacy
```

---

### `BITQUERY_GRPC_URL` e `BITQUERY_GRPC_TOKEN`
Endpoint e token do Bitquery CoreCast.

**Uso atual no runtime:**
- `DexTrades`
- `Transactions`
- `DexPools`
- `Transfers`
- `DexOrders`
- `Balances`

**Exemplo:**
```bash
BITQUERY_GRPC_URL=corecast.bitquery.io:443
BITQUERY_GRPC_TOKEN=YOUR_BITQUERY_CORECAST_TOKEN
```

---

### `PUBLICNODE_GRPC_URL` e `PUBLICNODE_GRPC_TOKEN`
Endpoint e token do Yellowstone gRPC da PublicNode.

**Exemplo:**
```bash
PUBLICNODE_GRPC_URL=https://solana-yellowstone-grpc.publicnode.com:443
PUBLICNODE_GRPC_TOKEN=YOUR_PUBLICNODE_GRPC_TOKEN
```

---

### `SHYFT_GRPC` e `SHYFT_GRPC_TOKEN`
Endpoint gRPC legado/custom. Continua suportado como provider Yellowstone compatível.

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

## Camada Determinística de Execução

### `FAST_LANE_ENABLED`
Ativa a camada determinística inspirada em `go-trader` para detectar setups muito ruins ou muito claros antes e depois do LLM.

**Padrão recomendado:** `true`

```bash
FAST_LANE_ENABLED=true
```

---

### `FAST_LANE_SKIP_SCORE`
Pontuação mínima do `fast lane` para transformar um sinal ruim em bloqueio duro.

**Padrão recomendado:** `80`

```bash
FAST_LANE_SKIP_SCORE=80
```

---

### `FAST_LANE_BUY_CONFIDENCE_BONUS`
Bônus base de confiança aplicado quando o `fast lane` confirma um setup de compra.

**Padrão recomendado:** `5`

```bash
FAST_LANE_BUY_CONFIDENCE_BONUS=5
```

---

### `PORTFOLIO_GOVERNOR_ENABLED`
Ativa o governador de portfólio inspirado em `go-trader`, limitando excesso de exposição e concentração por criador.

**Padrão recomendado:** `true`

```bash
PORTFOLIO_GOVERNOR_ENABLED=true
```

---

### `MAX_OPEN_POSITIONS`
Máximo de posições abertas consideradas pelo governador.

**Padrão recomendado:** `4`

```bash
MAX_OPEN_POSITIONS=4
```

---

### `MAX_ACTIVE_EXPOSURE_SOL`
Exposição agregada máxima em SOL antes de bloquear uma nova entrada.

**Padrão recomendado:** `0.35`

```bash
MAX_ACTIVE_EXPOSURE_SOL=0.35
```

---

### `MAX_SAME_CREATOR_POSITIONS`
Máximo de posições simultâneas em tokens do mesmo criador no modo live.

**Padrão recomendado:** `1`

```bash
MAX_SAME_CREATOR_POSITIONS=1
```

---

### `PORTFOLIO_SOFT_EXPOSURE_THRESHOLD_PCT`
Faixa de exposição em que o bot degrada uma nova entrada para `RECHECK` em vez de bloquear ou comprar imediatamente.

**Padrão recomendado:** `0.8`

```bash
PORTFOLIO_SOFT_EXPOSURE_THRESHOLD_PCT=0.8
```

---

### `EXECUTION_PREFLIGHT_ENABLED`
Ativa o preflight operacional inspirado em `Hummingbot` imediatamente antes da execução.

Ele valida:
- sanidade do preço de entrada;
- exposição projetada;
- saldo disponível da wallet no modo `LIVE`.

**Padrão recomendado:** `true`

```bash
EXECUTION_PREFLIGHT_ENABLED=true
```

---

### `EXECUTION_PREFLIGHT_SOL_BUFFER`
Buffer extra de SOL exigido no modo `LIVE` para evitar entradas que deixariam a wallet sem margem para fees e operação segura.

**Padrão recomendado:** `0.015`

```bash
EXECUTION_PREFLIGHT_SOL_BUFFER=0.015
```

---

## Dip Monitor & Waitlists (Dip Sniper + Micro-Recheck)

O `DipMonitorService` mantém filas em memória para reentradas rápidas após `RECHECK`.

Existem dois tipos:
- `LEGACY_DIP`: fila legada do Dip Sniper (timing / pullback).
- `MICRO_RECHECK`: micro-waitlist curta (8-15s) para rechecks near-execution de `PROBE` frágil.

### `DIP_MONITOR_SCAN_INTERVAL_MS`
Intervalo do loop de varredura do Dip Monitor (ms).

**Padrão:** `2000`

```bash
DIP_MONITOR_SCAN_INTERVAL_MS=2000
```

---

### `DIP_WAITLIST_MAX_AGE_MS`
TTL máximo (ms) para itens na fila legada (`LEGACY_DIP`).

**Padrão:** `300000` (5 minutos)

```bash
DIP_WAITLIST_MAX_AGE_MS=300000
```

---

### `MICRO_WAITLIST_MAX_TOKENS`
Teto rígido de itens simultâneos na micro-waitlist (`MICRO_RECHECK`).

**Padrão:** `8`

```bash
MICRO_WAITLIST_MAX_TOKENS=8
```

---

### `MICRO_WAITLIST_MIN_DELAY_MS`
Delay mínimo (ms) antes de um item `MICRO_RECHECK` ficar elegível para reentrar.

**Padrão:** `8000`

```bash
MICRO_WAITLIST_MIN_DELAY_MS=8000
```

---

### `MICRO_WAITLIST_MAX_AGE_MS`
TTL máximo (ms) por item na micro-waitlist (`MICRO_RECHECK`).

**Padrão:** `15000`

```bash
MICRO_WAITLIST_MAX_AGE_MS=15000
```

---

> [!NOTE]
> A micro-waitlist foi desenhada para não saturar o bot: ela exige `eligibleForMicroWaitlist=true`, deduplica por mint, prioriza por score e, com backlog cheio, rejeita itens fracos ou pode expulsar o pior item quando chega um candidato melhor.

## Winner Reentry Agent

Worker assíncrono para reavaliar tokens que tiveram `CLOSED_TP` recente e ainda parecem aptos para uma segunda entrada.

Ele não executa compra cega. O fluxo é:
- lê vencedores recentes da simulação;
- aplica filtro mínimo de qualidade e recência;
- coloca só os melhores numa fila curta;
- reavalia o mint pelo mesmo pipeline principal (`getAgentDecision` + `executeAgentTrade`);
- aplica cooldown por mint e limite de reentradas para não saturar o bot.

### `WINNER_REENTRY_AGENT_ENABLED`
Ativa o worker de reentrada de winners.

**Padrão:** `false`

```bash
WINNER_REENTRY_AGENT_ENABLED=true
```

---

### `WINNER_REENTRY_DISCOVERY_INTERVAL_MS`
Intervalo do ciclo que procura novos winners elegíveis.

**Padrão:** `120000`

```bash
WINNER_REENTRY_DISCOVERY_INTERVAL_MS=120000
```

---

### `WINNER_REENTRY_SCAN_INTERVAL_MS`
Intervalo de varredura da fila curta de reentrada.

**Padrão:** `4000`

```bash
WINNER_REENTRY_SCAN_INTERVAL_MS=4000
```

---

### `WINNER_REENTRY_LOOKBACK_MS`
Janela máxima de recência do trade vencedor para virar candidato.

**Padrão:** `1800000` (30 minutos)

```bash
WINNER_REENTRY_LOOKBACK_MS=1800000
```

---

### `WINNER_REENTRY_MAX_TOKENS`
Máximo de mints simultâneos na fila de reentrada.

**Padrão:** `4`

```bash
WINNER_REENTRY_MAX_TOKENS=4
```

---

### `WINNER_REENTRY_MIN_DELAY_MS`
Espera mínima antes de reavaliar um winner recém-fechado.

**Padrão:** `10000`

```bash
WINNER_REENTRY_MIN_DELAY_MS=10000
```

---

### `WINNER_REENTRY_MAX_AGE_MS`
TTL máximo de cada candidato na fila de reentrada.

**Padrão:** `900000` (15 minutos)

```bash
WINNER_REENTRY_MAX_AGE_MS=900000
```

---

### `WINNER_REENTRY_PER_MINT_COOLDOWN_MS`
Cooldown aplicado por mint após uma tentativa de reentrada.

**Padrão:** `900000` (15 minutos)

```bash
WINNER_REENTRY_PER_MINT_COOLDOWN_MS=900000
```

---

### `WINNER_REENTRY_MAX_REENTRIES_PER_MINT`
Máximo de tentativas de reentrada por mint dentro da janela de cooldown.

**Padrão:** `1`

```bash
WINNER_REENTRY_MAX_REENTRIES_PER_MINT=1
```

---

### `WINNER_REENTRY_MIN_PNL_PERCENT`
P&L percentual mínimo para um `CLOSED_TP` recente entrar no radar do worker.

**Padrão:** `35`

```bash
WINNER_REENTRY_MIN_PNL_PERCENT=35
```

---

> [!NOTE]
> O worker usa fila curta com cap, eviction por prioridade, dedupe por mint, TTL, cooldown e reavaliação completa pelo pipeline principal. A intenção é explorar winners recentes sem abrir um segundo canal de execução sem governança.

## Camada LLM

### `LLM_PROVIDER_ORDER`
Ordem de tentativa dos providers para o gateway unificado de LLM.

**Padrão recomendado:** `legacy,google`

```bash
LLM_PROVIDER_ORDER=legacy,google
```

Valores aceitos: `google`, `legacy`, `nvidia`.

---

### `GOOGLE_GENERATIVE_AI_API_KEY`
Chave da API do Google Generative AI usada pelo provider `@ai-sdk/google`.

```bash
GOOGLE_GENERATIVE_AI_API_KEY=YOUR_GEMINI_KEY
```

Se não estiver definida, o gateway pula o provider Google e tenta o provider legado seguinte.
Se a ordem estiver em `legacy,google`, o passo Google simplesmente será ignorado quando chegar a vez dele.

No perfil local atual, essa chave já foi validada apenas para testes locais de conectividade e fallback. O valor real não deve ser documentado nem commitado fora do `.env` privado.

---

### `GOOGLE_LLM_MODEL`
Modelo Gemini padrão para o gateway estruturado.

**Padrão atual:** `gemini-2.5-flash`

```bash
GOOGLE_LLM_MODEL=gemini-2.5-flash
```

---

### `AGENT_GOOGLE_LLM_MODEL`
Override opcional do modelo Gemini apenas para o agente principal de decisão de entrada.

```bash
AGENT_GOOGLE_LLM_MODEL=gemini-2.5-pro
```

---

### `LEARNER_LLM_PROVIDER_ORDER`
Override opcional da ordem de providers somente para o `LearnerAgent`.

```bash
LEARNER_LLM_PROVIDER_ORDER=legacy,google
```

---

### `LEARNER_GOOGLE_LLM_MODEL`
Override opcional do modelo Gemini somente para o `LearnerAgent`.

```bash
LEARNER_GOOGLE_LLM_MODEL=gemini-2.5-flash
```

---

### `POSTMORTEM_LLM_PROVIDER_ORDER`
Override opcional da ordem de providers somente para o enriquecimento do `PostMortemAgent`.

```bash
POSTMORTEM_LLM_PROVIDER_ORDER=legacy,google
```

---

### `POSTMORTEM_GOOGLE_LLM_MODEL`
Override opcional do modelo Gemini somente para o enriquecimento LLM do post-mortem.

```bash
POSTMORTEM_GOOGLE_LLM_MODEL=gemini-2.5-flash
```

---

### `LLM_MODEL`
Modelo do provider legado compatível com Chat Completions. No perfil local atual, ele é o provider principal do gateway.

```bash
LLM_MODEL=z-ai/glm5
```

---

### `LEGACY_LLM_API_URL`
URL explícita do endpoint legado compatível com Chat Completions.

Esse campo foi promovido a variável de ambiente para evitar regressões silenciosas de conectividade entre modelo, rota e provider após deploys. No perfil local atual ele aponta para o endpoint NVIDIA-compatible principal.

```bash
LEGACY_LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
```

---

### `NV_LLM_API_KEY`
Chave do provider legado atualmente usada no fallback NVIDIA-compatible.

```bash
NV_LLM_API_KEY=YOUR_NVIDIA_API_KEY
```

---

### `POSTMORTEM_LLM_API_URL`
Endpoint legado específico do post-mortem. Mantido para compatibilidade com o provedor anterior.

```bash
POSTMORTEM_LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
```

---

### `POSTMORTEM_LLM_MODEL`
Modelo legado específico do post-mortem.

```bash
POSTMORTEM_LLM_MODEL=qwen/qwen3.5-122b-a10b
```

---

### `POSTMORTEM_LLM_API_KEY`
Chave dedicada opcional para o provider legado do post-mortem.

```bash
POSTMORTEM_LLM_API_KEY=
```

---

### `POSTMORTEM_LLM_TIMEOUT_MS`
Timeout do provider legado para enriquecimento offline de autópsias.

```bash
POSTMORTEM_LLM_TIMEOUT_MS=20000
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

### Estado Persistido do Runtime
- `data/agent/config.json`: configuração efetiva do agente.
- `data/agent/status.json`: status salvo do agente.
- `data/agent/health.json`: snapshot consolidado de saúde dos subagentes.
- `data/agent/patterns.json`: regras aprendidas em uso pelo runtime.
- `data/agent/learner-state.json`: checkpoint do learner.

### Diretórios Auxiliares e Legados
- `.agents/shared-memory/`: legado/orfão. Mantido por histórico, mas não utilizado pelo runtime atual.
- `.agent/`: pacote externo de tooling local de desenvolvimento. Não é o diretório de runtime do bot.

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

# === Deterministic execution layer ===
FAST_LANE_ENABLED=true
FAST_LANE_SKIP_SCORE=80
FAST_LANE_BUY_CONFIDENCE_BONUS=5
PORTFOLIO_GOVERNOR_ENABLED=true
MAX_OPEN_POSITIONS=4
MAX_ACTIVE_EXPOSURE_SOL=0.35
MAX_SAME_CREATOR_POSITIONS=1
PORTFOLIO_SOFT_EXPOSURE_THRESHOLD_PCT=0.8
EXECUTION_PREFLIGHT_ENABLED=true
EXECUTION_PREFLIGHT_SOL_BUFFER=0.015

# === Dip Monitor (waitlists) ===
DIP_MONITOR_SCAN_INTERVAL_MS=2000
DIP_WAITLIST_MAX_AGE_MS=300000
MICRO_WAITLIST_MAX_TOKENS=8
MICRO_WAITLIST_MIN_DELAY_MS=8000
MICRO_WAITLIST_MAX_AGE_MS=15000

# === Winner Reentry Agent ===
WINNER_REENTRY_AGENT_ENABLED=false
WINNER_REENTRY_DISCOVERY_INTERVAL_MS=120000
WINNER_REENTRY_SCAN_INTERVAL_MS=4000
WINNER_REENTRY_LOOKBACK_MS=1800000
WINNER_REENTRY_MAX_TOKENS=4
WINNER_REENTRY_MIN_DELAY_MS=10000
WINNER_REENTRY_MAX_AGE_MS=900000
WINNER_REENTRY_PER_MINT_COOLDOWN_MS=900000
WINNER_REENTRY_MAX_REENTRIES_PER_MINT=1
WINNER_REENTRY_MIN_PNL_PERCENT=35

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
