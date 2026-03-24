# Qualidade de PROBE e Execucao

**Data:** 23/03/2026  
**Escopo:** implementacao local, sem deploy  
**Objetivo:** melhorar a qualidade dos trades sem parar o bot

---

## 1. Problema observado

Depois que o bot voltou a operar, o gargalo deixou de ser "nao entra" e passou a ser qualidade:

- muitas entradas saiam como `PROBE`;
- grande parte dos setups ainda operava em `LOW_DATA`;
- varios trades entravam com apenas `1` candle de confirmacao;
- algumas perdas eram instantaneas;
- alguns fechamentos mostravam divergencia anormal entre `price` e `marketCap`;
- o post-mortem aprendia, mas esse aprendizado ainda tinha pouco efeito operacional imediato.

Em resumo: o bot tinha mais throughput, mas ainda pouco filtro no regime mais fragil.

---

## 2. O que foi implementado

### 2.1 Probe Quality Governor

Arquivo: `utils/probeQualityGovernor.ts`

Camada nova para duas funcoes:

1. reduzir ou reavaliar `PROBE` fragil quando houver perdas recentes recorrentes no mesmo regime;
2. validar a coerencia de `price x marketCap` antes de aceitar ticks no monitoramento.

Ela hoje faz:

- identifica regime fragil:
  - `pumpfun`
  - `entryProfile=PROBE`
  - `dataQualityScore <= 45`
  - `taScore <= 10`
  - `candlesAvailable1s <= 2`
  - curva entre `90%` e `100%`
- consulta post-mortems recentes;
- procura causas recorrentes:
  - `WEAK_MOMENTUM`
  - `NO_FOLLOW_THROUGH`
- reage assim:
  - `2` perdas recentes semelhantes: reduz `positionCap`
  - `3+` perdas recentes semelhantes: envia o token para `RECHECK`

Na parte de execucao, a mesma camada rejeita ticks absurdos, por exemplo:

- salto extremo de preco com market cap praticamente parado;
- preco e market cap andando em direcoes opostas com divergencia severa;
- divergencia absoluta muito acima do toleravel.

---

### 2.2 Adaptive Entry mais conservador para PROBE fragil

Arquivo: `utils/adaptiveEntryGovernance.ts`

O regime `PROBE` continua existindo, mas setups muito novos e sem confirmacao agora entram com cap menor.

Regra principal:

- se o setup estiver com `1` candle e `execScore < 10`, o `positionCap` do `PROBE` cai para `0.20`.

Isso preserva a operacao, mas corta risco exatamente onde a perda tem sido mais frequente.

---

### 2.3 Micro-Confirm com follow-through real

Arquivo: `utils/microConfirmation.ts`

Antes, a micro-confirmacao recebia um array de precos estatico na chamada inicial. Na pratica, ela via pouco da continuacao real durante a janela.

Agora:

- a microjanela passa a ler candles `1s` ao vivo via `getRecentPeriods1s()`;
- setups `PROBE` frageis usam uma janela um pouco maior;
- esses setups exigem `follow-through` minimo durante a micro-confirmacao;
- se esse follow-through nao aparecer, o token vai para `TEMP_RECHECK` em vez de comprar imediatamente.

Codigo novo de falha:

- `MC_NO_FOLLOW_THROUGH`

Resultado esperado:

- menos SL imediato por entrada sem continuidade;
- mais reavaliacoes curtas em vez de compras precipitadas.

---

### 2.4 Monitoramento simulado menos cego

Arquivo: `utils/agentOrchestrator.ts`

O monitoramento de saida em simulacao foi ajustado para reduzir overshoot de `TP/SL`.

Mudancas:

- polling mais rapido na fase inicial do trade;
- armamento de `break-even` apos ganho inicial relevante;
- sanity check de `price x marketCap` antes de atualizar `PnL` ou disparar `TP/SL`;
- persistencia do `marketCap` de entrada ao retomar trades abertos.

Objetivo:

- reduzir falso lucro/perda gerado por tick ruim;
- reduzir saida muito distante do alvo teorico;
- preservar o bot em operacao sem desligar a estrategia.

---

### 2.5 Micro-waitlist de 8-15s governada (MICRO_RECHECK)

Arquivos: `utils/dipMonitor.ts`, `utils/agentOrchestrator.ts`, `utils/config.ts`, `index.ts`

Sem paralisar o bot, a ideia aqui e endurecer so o `PROBE` ruim: quando houver `LOW_DATA` + `taScore` muito baixo + `1` candle + sem follow-through, em vez de comprar no impulso, o token entra numa micro-waitlist curta e so tenta reentrar apos alguns segundos.

Esta micro-waitlist e separada da fila legada do Dip Sniper (`LEGACY_DIP`). Ela foi implementada reaproveitando o `DipMonitorService`, mas com governor para evitar saturacao e fila infinita:

- **so aceita near-execution**: `MICRO_RECHECK` exige `eligibleForMicroWaitlist=true` (na pratica, apenas caminhos explicitamente marcados);
- **teto rigido**: `MICRO_WAITLIST_MAX_TOKENS` (padrao `8`) limita quantos itens `MICRO_RECHECK` podem ficar simultaneamente na fila;
- **dedupe por mint**: re-enfileirar o mesmo mint atualiza o item em vez de duplicar;
- **prioridade**: ordena `MICRO_RECHECK` antes de `LEGACY_DIP` e prioriza por `priorityScore` (derivado de `confidence`, curva e risco);
- **backlog controlado**: com backlog cheio, rejeita candidato fraco ou expulsa o pior se chegar um melhor;
- **tempo curto e expira rapido**: `minDelayMs` (heuristico `8-12s`) antes de ficar "ready" e TTL curto (padrao `15s`).

Onde esta micro-waitlist e usada hoje:

- `probe_loss_pressure` -> manda para `MICRO_RECHECK` quando a governanca detecta repeticao de `WEAK_MOMENTUM/NO_FOLLOW_THROUGH`;
- `MC_NO_FOLLOW_THROUGH` -> manda para `MICRO_RECHECK` em vez de comprar imediatamente quando a micro-confirmacao nao encontra follow-through.

---

## 3. Onde isso entrou no fluxo

Arquivo principal: `utils/agentOrchestrator.ts`

Depois do score adaptativo:

1. o bot monta o `adaptiveEntryProfile`;
2. consulta a pressao recente do regime via `assessProbeLossPressure()`;
3. se o regime estiver sob pressao:
   - reduz size, ou
   - manda para `MICRO_RECHECK` (micro-waitlist curta) quando for caso tipico de `PROBE` fragil;
4. passa pela `Micro-Confirm` com follow-through real;
5. se falhar com `MC_NO_FOLLOW_THROUGH`, manda para `MICRO_RECHECK` em vez de comprar no impulso;
6. entra no preflight/execucao;
7. o monitoramento simulado passa a validar ticks suspeitos.

---

## 4. Logs esperados apos deploy

Quando a camada nova estiver ativa, os logs esperados incluem:

- `♻️ [Probe Quality] <token> entrando em cooldown leve por perdas recorrentes`
- `🪫 [Probe Quality] <token> reduzindo size do PROBE por pressão recente`
- `MC_NO_FOLLOW_THROUGH`
- `🧪 [SIMULATION] Ignorando tick suspeito de <token>: PRICE_MARKETCAP_*`
- `🛡️ [SIMULATION] <token> break-even armado ...`
- `👀 [DipMonitor] Added <token> (<mint>) to MICRO_RECHECK waitlist ...`
- `🚫 [DipMonitor] Rejected <token>: MICRO_RECHECK backlog full ...`
- `🧹 [DipMonitor] Evicted <token> from MICRO_RECHECK queue ...`
- `🎯 [DipMonitor] MICRO_RECHECK_READY CONFIRMED for <token>! kind=MICRO_RECHECK ...`
- `🚀 [index.ts] Dip Sniper executing LIVE BUY for <mint> (kind=MICRO_RECHECK)`

Esses sinais indicam que o bot nao foi paralisado, mas passou a reagir de forma mais seletiva no regime de menor qualidade.

---

## 5. Arquivos alterados

- `utils/probeQualityGovernor.ts`
- `utils/adaptiveEntryGovernance.ts`
- `utils/microConfirmation.ts`
- `utils/agentOrchestrator.ts`
- `utils/dipMonitor.ts`
- `utils/config.ts`
- `index.ts`
- `test/unit/probeQualityGovernor.test.ts`
- `test/unit/adaptiveEntryGovernance.test.ts`
- `test/unit/dipMonitor.test.ts`

---

## 6. Validacao local

Comandos executados:

```bash
npm run typecheck
npx jest --config jest.config.js test/unit/dipMonitor.test.ts test/unit/probeQualityGovernor.test.ts test/unit/adaptiveEntryGovernance.test.ts
```

Status:

- `typecheck` OK
- testes direcionados OK

---

## 7. Limites desta etapa

Esta etapa melhora qualidade sem desligar o bot, mas nao resolve sozinha tudo:

- o post-mortem ainda e majoritariamente advisory;
- os thresholds nao viram governanca dura universal automaticamente;
- a qualidade do feed externo continua influenciando o resultado;
- trades `LOW_DATA` continuam existindo por desenho estrategico.

O ganho desta iteracao e pragmatico:

- menos `PROBE` fraco comprado no impulso;
- menos size no regime mais fragil;
- menos aceitacao de tick claramente suspeito;
- mais chance de reavaliar setups antes de transformar ruido em perda.
