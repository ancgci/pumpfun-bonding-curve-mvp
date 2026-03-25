# Winner Reentry Agent

**Data:** 23/03/2026  
**Status:** implementado localmente

## Objetivo

Criar um worker assíncrono para explorar reentradas em tokens que acabaram de gerar trades muito bons, sem abrir um segundo canal de execução desgovernado.

O agente:

- lê `CLOSED_TP` recentes da base de simulação;
- filtra apenas winners com recência, P&L e contexto minimamente saudáveis;
- coloca os melhores candidatos em uma fila curta;
- reavalia cada mint pelo mesmo funil principal do bot;
- aplica cooldown por mint e limite de reentradas.

## Fluxo

1. `simulationEngine.ts` expõe `getRecentWinningTrades()`.
2. `winnerReentryAgent.ts` roda em background e procura winners elegíveis.
3. O candidato entra em uma fila com:
   - dedupe por mint;
   - prioridade;
   - `maxTokens`;
   - `minDelay`;
   - `maxAge`;
   - cooldown por mint;
   - `maxReentriesPerMint`.
4. Quando o candidato fica pronto, o agente monta um `TokenAnalysis` fresco:
   - backfill de histórico;
   - preço atual;
   - risco atual;
   - snapshot TA atual.
5. O candidato passa por `getAgentDecision()` e `executeAgentTrade()`.
6. Se o bot estiver em `LIVE`, a execução usa `executeHybridTrade()` no modo `REENTRY`.

## Guardrails

- Não reentra em token com posição aberta.
- Não aceita winners antigos ou fracos.
- Não deixa backlog crescer sem limite.
- Pode expulsar o pior item se chegar um winner claramente melhor.
- Não tenta o mesmo mint indefinidamente.
- Continua sujeito aos bloqueios normais do pipeline principal.

## Critérios de elegibilidade

O worker não usa "trade que deu lucro" como sinal suficiente. Um winner só entra na fila se passar por filtros mínimos:

- `status === CLOSED_TP`;
- trade recente dentro de `WINNER_REENTRY_LOOKBACK_MS`;
- `pnlPercent >= WINNER_REENTRY_MIN_PNL_PERCENT`;
- curva ainda em zona útil para continuação (`85 <= bondingCurvePercent < 100`);
- excursão favorável mínima coerente com um winner de verdade;
- sem posição aberta naquele mint;
- sem cooldown ativo para o mint;
- sem exceder `WINNER_REENTRY_MAX_REENTRIES_PER_MINT`.

## Governança da fila

A fila de reentrada foi desenhada para não virar um segundo gargalo operacional.

- `dedupe por mint`: um mesmo token não ocupa múltiplos slots;
- `maxTokens`: teto rígido de backlog;
- `priorityScore`: winners melhores sobem na frente;
- `eviction`: se a fila estiver cheia, um candidato fraco pode ser expulso por outro melhor;
- `minDelay`: espera mínima antes da nova leitura do mercado;
- `maxAge`: item expira rápido se não confirmar;
- `cooldown por mint`: evita looping no mesmo token;
- `processedTradeKeys`: impede reprocessar infinitamente o mesmo winner fechado.

## Fluxo operacional

1. Um trade fecha em `CLOSED_TP`.
2. O worker assíncrono busca winners recentes em `getRecentWinningTrades()`.
3. O trade vira candidato apenas se ainda fizer sentido como continuação.
4. O candidato entra na fila curta de reentrada.
5. Após `WINNER_REENTRY_MIN_DELAY_MS`, o worker recompõe contexto fresco:
   - histórico;
   - preço atual;
   - metadata;
   - risco;
   - TA snapshot.
6. O mint volta para `getAgentDecision()`.
7. Se aprovado, ele ainda passa por `executeAgentTrade()` e pelo executor híbrido em modo `REENTRY`.

## Logs esperados

As mensagens mais importantes para operação são:

- `🧠 [WinnerReentryAgent] Added ... to reentry queue`
- `🧠 [WinnerReentryAgent] Updated ... in reentry queue`
- `🧠 [WinnerReentryAgent] Evicted ... from reentry queue`
- `🧠 [WinnerReentryAgent] Re-evaluating ...`
- `🧠 [WinnerReentryAgent] ... result: action=... executed=...`
- `🧠 [index.ts] Winner Reentry executing BUY for ...`

Se o worker estiver ativo mas sem executar trades, os motivos mais comuns são:

- nenhum `CLOSED_TP` recente suficientemente forte;
- fila expirando sem confirmação;
- cooldown por mint;
- posição já aberta;
- reprovação normal do pipeline principal;
- bloqueio por preflight ou por limites de portfólio.

## Perfil inicial recomendado

Para o primeiro deploy, o perfil mais conservador é:

```bash
WINNER_REENTRY_AGENT_ENABLED=true
WINNER_REENTRY_DISCOVERY_INTERVAL_MS=120000
WINNER_REENTRY_SCAN_INTERVAL_MS=4000
WINNER_REENTRY_LOOKBACK_MS=1800000
WINNER_REENTRY_MAX_TOKENS=3
WINNER_REENTRY_MIN_DELAY_MS=10000
WINNER_REENTRY_MAX_AGE_MS=900000
WINNER_REENTRY_PER_MINT_COOLDOWN_MS=900000
WINNER_REENTRY_MAX_REENTRIES_PER_MINT=1
WINNER_REENTRY_MIN_PNL_PERCENT=35
```

Esse perfil reduz risco de saturação e obriga o worker a ser seletivo.

## Limites conhecidos

- O worker depende de winners já fechados na simulação/histórico recente.
- Ele melhora descoberta de segunda perna, mas não substitui qualidade do pipeline principal.
- Se o critério de winner ficar permissivo demais, a fila pode perder qualidade mesmo com cap.
- Se `WINNER_REENTRY_MIN_PNL_PERCENT` ficar alto demais, quase nada entra no radar.

## Arquivos

- `utils/winnerReentryAgent.ts`
- `utils/simulationEngine.ts`
- `utils/config.ts`
- `utils/hybridExecutor.ts`
- `index.ts`
- `test/unit/winnerReentryAgent.test.ts`

## Validação local

```bash
npm run typecheck
npx jest --config jest.config.js test/unit/winnerReentryAgent.test.ts
```
