# Bitquery CoreCast Multi-Stream

## Objetivo

Adicionar redundância real de discovery e enriquecer o runtime PumpFun sem depender só de Yellowstone/PublicNode.

O runtime Bitquery agora usa múltiplos streams CoreCast no mesmo provider:

- `DexTrades`
- `Transactions`
- `DexPools`
- `Transfers`
- `DexOrders`
- `Balances`

## Como cada stream entra no bot

### 1. `DexTrades`

É a lane principal de discovery Bitquery para PumpFun.

- decodifica trade token-vs-SOL
- extrai `mint`, `marketAddress`, `trader`, `signature`, `side`, `amount`
- publica candidato no `bitqueryEventBus`

### 2. `Transactions`

É o fallback estrutural para discovery PumpFun.

- lê `ParsedIdlInstructions`
- confirma `buy/sell` do programa PumpFun
- extrai `bondingCurveAddress`, `mint`, `trader`
- publica discovery no mesmo `bitqueryEventBus`

### 3. `DexPools`

Enriquecimento assíncrono de liquidez/pool state.

- mantém snapshot recente por `marketAddress`
- evita ida imediata ao RPC quando o pool já foi visto
- ajuda no cálculo de `curve progress`

### 4. `Transfers`

Enriquecimento assíncrono de participação real por mint.

- não roda globalmente; usa watchlist dinâmica
- a watchlist nasce de mints já descobertos por `DexTrades` ou `Transactions`
- guarda janela curta de `60s`
- mede:
  - `transferCount60s`
  - `uniqueWallets60s`
  - `uniqueSenders60s`
  - `uniqueReceivers60s`
  - `tokenVolume60s`

Uso atual:

- bônus leve no `PUMPFUN_COMPACT`
- reforço leve no `Fast Lane`

### 5. `DexOrders`

Enriquecimento assíncrono de pressão compradora/vendedora.

- mede `OPEN`, `UPDATE`, `CANCEL`
- mantém janela curta de `30s`
- produz:
  - `buyOrders30s`
  - `sellOrders30s`
  - `cancelOrders30s`
  - `buyVolume30s`
  - `sellVolume30s`
  - `buyPressureRatio`

Uso atual:

- bônus leve no `PUMPFUN_COMPACT`
- reforço leve no `Fast Lane`

### 6. `Balances`

Uso operacional, não discovery.

- acompanha o saldo da wallet ativa
- mantém cache curto de `SOL` nativa
- `executionPreflight` usa esse cache antes de cair para RPC

## Fluxo no runtime

1. `grpcProviders.ts` escolhe o provider ativo.
2. Se o provider for `bitquery` e `MONITORING_PROTOCOL=PUMPFUN`, o `index.ts` sobe o conjunto multi-stream.
3. `DexTrades` e `Transactions` alimentam o `bitqueryEventBus`.
4. `DexPools` abastece o cache de pool por `marketAddress`.
5. `Transfers` é reconfigurado dinamicamente quando novos mints entram na watchlist.
6. `DexOrders` e `Balances` enriquecem o estado em memória.
7. `agentOrchestrator.ts` consome `Transfers` e `DexOrders` como sinais leves no score técnico.
8. `executionPreflight.ts` consome `Balances` como cache operacional.

## Guards de runtime

### Watchlist de Transfers

- TTL por mint: `15 min`
- cap de mints rastreados: `48`
- stream é recriado apenas quando a watchlist muda

### Estado em memória

`bitqueryRealtimeState.ts` usa:

- transfers: janela `60s`
- orders: janela `30s`
- balances: TTL curto
- cleanup periódico a cada `60s`

## Impacto esperado

### Ganhos imediatos

- discovery PumpFun menos dependente de Yellowstone
- fallback melhor que um único stream de trade
- leitura curta de fluxo mais útil para launch recente
- menos ida ao RPC para saldo da wallet ativa

### Sem mudar o perfil do bot para bloqueio duro

`Transfers` e `DexOrders` foram ligados como:

- reforço positivo leve
- não como hard-block

Isso evita repetir o erro da etapa 3 pesada.

## Variáveis de ambiente

Principais env vars:

```bash
GRPC_PROVIDER_PREFERENCE=bitquery,publicnode,custom,legacy
BITQUERY_GRPC_URL=corecast.bitquery.io:443
BITQUERY_GRPC_TOKEN=...
PUBLICNODE_GRPC_URL=https://solana-yellowstone-grpc.publicnode.com:443
PUBLICNODE_GRPC_TOKEN=...
MONITORING_PROTOCOL=PUMPFUN
```

## Limitações atuais

- `Transfers` só observa mints já descobertos no runtime atual; não é stream global de todos os tokens.
- `Balances` hoje é usado só como cache da wallet ativa.
- `DexOrders` entra como enriquecimento leve, não como bloqueio estrutural.

## Validação local

```bash
npm run typecheck
npx jest --config jest.config.js \
  test/unit/grpcProviders.test.ts \
  test/unit/bitqueryGrpcAdapter.test.ts \
  test/unit/bitqueryTransactionsAdapter.test.ts \
  test/unit/bitqueryDexPoolsAdapter.test.ts \
  test/unit/bitqueryTransfersAdapter.test.ts \
  test/unit/bitqueryDexOrdersAdapter.test.ts \
  test/unit/bitqueryBalancesAdapter.test.ts \
  test/unit/technicalScore.test.ts \
  test/unit/strategyFastLane.test.ts \
  test/unit/executionPreflight.test.ts
```
