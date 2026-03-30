# Status do Backfill Resiliente - 2026-03-30

## Objetivo

Reduzir a dependência do endpoint HTTP do Pump.fun no backfill de trades, porque ele estava falhando com `530` por bloqueio/rate limit e deixando o pipeline sem histórico para TA e organicidade.

## O que foi feito

### 1. Backup local de segurança

Foi criado um snapshot local antes das mudanças em:

- `.backup/pre_backfill_2026-03-30_12-23/`

Motivo:

- Permitir retorno rápido ao estado anterior, sem depender de VPS.

### 2. Implementação da Fase 1

Foi implementada a estratégia `cache -> HTTP -> RPC`.

Arquivos principais:

- `utils/liveTradeCache.ts`
- `utils/pumpfunRpcBackfill.ts`
- `utils/pumpfunHistory.ts`
- `utils/bitqueryGrpcAdapter.ts`
- `index.ts`
- `test/unit/bitqueryGrpcAdapter.test.ts`

Motivo:

- `cache local`: aproveitar trades live já vistos pelo bot, sem chamada extra de rede
- `HTTP`: manter o caminho mais rápido quando funcionar
- `RPC`: garantir fallback histórico quando o HTTP cair

### 3. Cache local passivo

Foi criado um ring buffer em memória por mint.

Motivo:

- reduzir chamadas repetidas de backfill
- reaproveitar o fluxo live já existente
- acelerar rediscovery do mesmo token

### 4. Backfill RPC via IDL real

O backfill RPC foi implementado parseando `TradeEvent` do IDL do Pump.fun, via logs/transações on-chain.

Motivo:

- evitar inferência frágil por `postBalances`
- obter `mint`, `wallet`, `side`, `solAmount`, `tokenAmount`, `timestamp` e preço de forma consistente

### 5. Integração no pipeline

O pipeline passou a:

- alimentar o cache a partir dos trades live
- enviar `bondingCurve` / `marketAddress` para o backfill
- mesclar dados de `cache + HTTP + RPC`

Motivo:

- melhorar a precisão do backfill
- reduzir ruído nas buscas RPC
- manter compatibilidade com o fluxo atual

### 6. Ajustes após teste local real

Depois dos testes, foram feitos ajustes operacionais:

- `RPC_BACKFILL_TIMEOUT_MS`: `8000 -> 15000`
- `HTTP_BACKFILL_TIMEOUT_MS`: `3000 -> 5000`
- tentativas de fallback no RPC aumentadas
- troca do fetch batch quebrado por busca unitária de transações com throttle mais conservador

Motivo:

- o endpoint HTTP continuou falhando com `530`
- o primeiro desenho do RPC encontrou `429` e instabilidade no fetch em lote
- o fluxo precisava degradar com mais robustez

## O que os testes mostraram

### Validação técnica

- `npx tsc --noEmit --incremental false` -> OK
- `npx jest test/unit/bitqueryGrpcAdapter.test.ts --runInBand` -> OK

### Backfill isolado

Teste real com token específico:

- mint: `6MkfFjKsYM5jP5V6RzczpYvf96t4SN4y1qbwDNCp5YBZ`
- bonding curve: `8i9LK3ykXhCrsY5FF5AEd4TnQJnDS3yfCC61JzhiVaK4`

Resultado:

- HTTP falhou com `530`
- RPC reconstruiu `10 trades`
- backfill concluiu com sucesso

### Teste local completo do bot

Foi rodado o bot local em `SIMULATION` por janela controlada.

Resultado:

- bot subiu normalmente
- streams principais iniciaram
- ocorreram discoveries reais
- o backfill foi executado no fluxo live
- vários tokens seguiram no pipeline com histórico injetado via RPC

Exemplos observados:

- `uWfF3QAQ...` -> backfill parcial com continuidade do pipeline
- `HfbWJWCn...` -> `19 trades` injetados
- `GmzD2Nci...` -> `24 trades` injetados
- `76cjoJkm...` -> `30 trades` injetados

## Conclusão atual

A Fase 1 foi implementada e validada localmente.

Hoje:

- o HTTP do Pump.fun continua não confiável neste ambiente
- o fallback RPC já sustenta o backfill e mantém o pipeline funcional
- ainda existem `timeouts parciais` em alguns tokens sob pressão/rate limit

## Decisão recomendada

Ainda não priorizar a Fase 2 do WebSocket oficial.

Motivo:

- a Fase 1 já resolveu o problema principal do backfill
- o próximo passo mais importante é observar o comportamento em operação real
- a Fase 2 faz mais sentido como redundância live, não como correção principal do backfill

## Observações

- Nenhuma alteração foi feita na VPS nesta etapa.
- O teste local em `SIMULATION` gerou artefatos de runtime em arquivos de dados/log locais.
