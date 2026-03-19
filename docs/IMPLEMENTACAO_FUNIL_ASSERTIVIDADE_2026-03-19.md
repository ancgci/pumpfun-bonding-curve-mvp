# Implementacao Local do Funil de Assertividade

Data: 19/03/2026
Escopo: somente ambiente local
Status: implementado localmente, sem deploy

## Objetivo

Executar o plano de melhoria de assertividade sem aumentar o risco operacional e sem repetir o problema anterior de excesso de regras binarias bloqueando quase todos os trades.

O foco desta implementacao foi:

- reduzir dependencia de hard blocks absolutos
- introduzir reavaliacao curta para setups borderline
- transformar parte dos bloqueios em pressao acumulada
- separar melhor o que e bloqueio definitivo do que e bloqueio temporario
- medir o funil inteiro do agente para diagnosticar onde os trades morrem

## Problema que motivou a mudanca

Antes desta implementacao, o fluxo pos-LLM ainda era excessivamente binario:

- `BUY` aprovado pela LLM podia ser abortado por um unico hard block
- score tecnico insuficiente virava rejeicao direta em muitos cenarios
- organicidade borderline tambem virava abort imediato
- varios casos que deveriam ser apenas temporarios acabavam marcando o token como processado

Na pratica, isso podia matar o funil cedo demais e reduzir demais o numero de oportunidades.

## O que foi implementado

### 1. Novo funil instrumentado de decisao

Foi criado um registrador persistente de funil em:

- `utils/decisionFunnelMetrics.ts`

Esse modulo grava eventos por etapa em:

- `data/agent/funnel-metrics.json`

Etapas registradas:

- `discovery`
- `risk`
- `pre_llm`
- `llm`
- `post_llm_blocks`
- `post_llm_score`
- `organicity`
- `micro_confirm`
- `execution`

Outcomes registrados:

- `approved`
- `blocked`
- `recheck`
- `skipped`
- `executed`
- `error`

Tambem guarda:

- totais por etapa
- totais por outcome
- totais por protocolo
- historico recente de eventos
- motivos agregados

### 2. Governanca nova de recheck no TA config

Foram adicionados novos parametros em:

- `utils/technicalConfig.ts`

Novos controles:

- `entryBlockRecheckPressure`
- `entryBlockFatalPressure`
- `organicityRecheckPressure`
- `organicityFatalPressure`
- `taScoreRecheckBuffer`
- `recheckDelayMs`
- `recheckMaxAttempts`

Esses parametros controlam quando um problema gera:

- aprovacao
- recheck curto
- bloqueio definitivo

### 3. Ajuste por protocolo

Tambem em `utils/technicalConfig.ts` foi adicionado:

- `getProtocolAdjustedTAConfig(protocol, baseConfig)`

Objetivo:

- evitar tratar todos os protocolos como se fossem identicos
- flexibilizar levemente score, organicidade e distancia de VWAP por protocolo

Nesta fase foram ajustados:

- `meteora_dbc`
- `bonk_fun`
- `daos_fun`
- `moonshot`

### 4. Pressao acumulada em vez de veto isolado

Em `utils/entryBlocker.ts` foram criados:

- `GateAction = ALLOW | RECHECK | BLOCK`
- `GateAssessment`
- `assessEntryBlockPressure()`
- `assessOrganicityBlockPressure()`

Logica nova:

- alguns codigos continuam fatais
- o restante soma pressao
- se a pressao passar do threshold de recheck, o setup entra em observacao curta
- se passar do threshold fatal, o setup e bloqueado

Isso reduz a dependencia de um unico sinal binario em casos onde o contexto ainda pode melhorar em poucos segundos.

### 5. Reescrita do pos-LLM no orchestrator

O trecho principal foi refeito em:

- `utils/agentOrchestrator.ts`

Mudancas estruturais:

- `executeAgentTrade()` passou a retornar um resultado estruturado
- foi criado um loop de reavaliacao curta com `runRecheckLoop()`
- o pos-LLM agora separa claramente:
  - bloqueios tecnicos
  - score tecnico
  - organicidade
  - micro-confirmacao
  - validacao final de execucao

Comportamento novo:

- `BUY` da LLM nao vira execucao imediata automaticamente
- setups borderline podem receber `RECHECK`
- casos temporarios vao para `dipMonitor`
- apenas decisoes realmente finais persistem o token como processado

### 6. Temporario versus definitivo

Foi formalizado o conceito de motivo temporario no orchestrator.

Exemplos tratados como temporarios:

- `TEMP_RECHECK`
- `WAITING_DIP`
- casos de `insufficient data`
- timeouts de reavaliacao curta

Efeito pratico:

- o token nao fica morto cedo demais
- o pipeline pode tentar novamente depois

### 7. Integracao do resultado final no pipeline principal

Em `index.ts` o fluxo foi ajustado para:

- registrar `discovery` e `risk` no funil
- usar o resultado final de `executeAgentTrade()`
- so marcar o token como processado quando `persistDecision = true`

Isso corrige um problema importante do fluxo antigo:

- antes, a decisao da LLM podia marcar o token como processado antes da execucao final
- agora a persistencia respeita o resultado real do pos-LLM

### 8. Endpoint de diagnostico no backend

Foi adicionado no `dashboard-api`:

- `GET /api/agent/funnel-metrics`

Arquivo:

- `dashboard-api/server.ts`

Objetivo:

- inspecionar onde o funil esta aprovando, rechecando, bloqueando ou executando

## Comportamento novo por etapa

### Discovery

Agora grava evento de aprovacao quando o token entra no pipeline.

Tambem grava bloqueio se nao houver preco confiavel.

### Risk

Agora grava:

- `approved`
- `blocked`
- `error`

Com razoes como:

- `RISK_OK`
- `RISK_LP_UNLOCKED`
- `RISK_SCORE_HIGH`

### Post LLM Blocks

Em vez de abortar direto por qualquer hard block:

- calcula pressao total
- respeita codigos fatais
- permite `RECHECK` para casos limítrofes

### Post LLM Score

O score tecnico agora pode:

- aprovar
- entrar em recheck se estiver dentro do buffer
- bloquear se estiver realmente ruim

### Organicity

Agora pode:

- aprovar
- reavaliar
- bloquear

Em `SHADOW_MODE`, continua observando sem bloquear, mas agora grava o resultado no funil.

### Micro Confirm

Agora tambem entra no funil com:

- `approved`
- `blocked`

Se falhar, o token vai para espera temporaria.

### Execution

Agora distingue:

- aprovacao pre-execucao
- bloqueio por spike
- trade executado
- erro de execucao
- skip por posicao ja aberta

## Resultado esperado

Com essa implementacao, a expectativa e:

- menos perda de oportunidades por bloqueio precoce
- mais consistencia no tratamento de casos borderline
- mais visibilidade do funil inteiro
- mais capacidade de calibrar o sistema depois com base em dados reais

O objetivo nao foi deixar o bot mais agressivo de forma cega.

O objetivo foi:

- manter o risco atual
- reduzir falso bloqueio
- melhorar governanca e diagnostico

## Validacao realizada

Validacao local executada:

```bash
npm run typecheck
```

Resultado:

- passou sem erros

## Arquivos alterados nesta fase

- `utils/agentOrchestrator.ts`
- `utils/entryBlocker.ts`
- `utils/technicalConfig.ts`
- `utils/decisionFunnelMetrics.ts`
- `index.ts`
- `dashboard-api/server.ts`

## O que ainda nao foi feito

Nao foi feito nesta etapa:

- deploy para a VPS
- dashboard visual para exibir o funil novo
- calibracao fina dos thresholds com dados reais
- testes de performance prolongados em execucao real

## Proximo passo recomendado

Depois do deploy, acompanhar:

- `GET /api/agent/funnel-metrics`
- taxa de `recheck` por etapa
- motivos mais comuns de bloqueio
- diferenca entre `BUY` aprovado pela LLM e `executed`

Isso vai mostrar com clareza se os novos thresholds estao:

- reduzindo falso bloqueio
- ou liberando setups demais

