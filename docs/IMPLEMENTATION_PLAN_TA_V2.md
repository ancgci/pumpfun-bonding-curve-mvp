# Plano de Implementação — Análise Técnica V2

> **Referência**: `docs/TECHNICAL_ANALYSIS_V2.md`  
> **Status**: PENDENTE APROVAÇÃO  
> **Estimativa**: 6 tarefas sequenciais

---

## Resumo das Mudanças

O sistema atual (`volatilityMonitor.ts`) usa:
- MACD 12,26,9 (lento demais para 1s)
- RSI 14 (lento demais)
- EMA 9/21 (insuficiente)
- Buckets de 5s (resolução baixa)
- Sem Donchian, VWAP, ROC, Volume Relativo, Score, Bloqueios

O novo sistema precisa:
- Buckets de 1s para todas as features
- MACD 4,9,3 / RSI 7 / EMA 5,9,13 / ATR 7
- Donchian Channel 12
- Volume Relativo + Rolling VWAP
- ROC 5
- Score de confluência (0-100)
- Sistema de bloqueio pré-entrada
- Gestão de posição com trailing adaptativo ao ATR

---

## TAREFA 1 — `utils/technicalConfig.ts` (Novo arquivo)

**O quê**: Interface `TechnicalAnalysisConfig` com TODOS os parâmetros ajustáveis e defaults.

**Escopo**:
- Interface TypeScript com todos os parâmetros listados na Seção 8
- Objeto `DEFAULT_TA_CONFIG` com valores default
- Função `loadTAConfig()` que carrega de `data/ta-config.json` (se existir) ou usa defaults
- Integração com `getRuntimeConfig()` do `config.ts`

**Dependências**: Nenhuma  
**Risco**: Baixo

---

## TAREFA 2 — `volatilityMonitor.ts` (Refatoração maior)

**O quê**: Adicionar buckets de 1s, novos indicadores, e parametrizar os existentes.

**Escopo**:
- Adicionar `periodStore1s: Map<string, PricePeriod[]>` (buckets de 1 segundo)
- `recordPriceSample()` → atualizar store de 1s também
- `getMovingAverage()` → aceitar resolution `"1s"`, suportar EMA 5/9/13
- `calculateEMASlope(mint, period, slopeWindow)` → Nova função
- `getHighResRSI()` → default period=7, usar store de 1s
- `getHighResMACD()` → parametrizar periodos (default 4,9,3), usar store de 1s
- `getATR()` → versão 1s com period=7
- **Novas funções**:
  - `getDonchianChannel(mint, period)` → upper/lower band
  - `getRollingVWAP(mint, window)` → VWAP local
  - `getROC(mint, period)` → Rate of Change
  - `getVolumeRelative(mint, window)` → volume atual / média
- `getTASnapshot()` → expandir para incluir TODAS as features
- Exportar nova interface `TASnapshotV2`

**Dependências**: Tarefa 1  
**Risco**: Médio (é o arquivo core, precisa manter backward compat)

---

## TAREFA 3 — `utils/technicalScore.ts` (Novo arquivo)

**O quê**: Engine de score de confluência conforme Seção 7.

**Escopo**:
- Função `calculateConfluenceScore(snapshot: TASnapshotV2, config: TechnicalAnalysisConfig): ScoreResult`
- `ScoreResult` = `{ score: number, breakdown: ScoreBreakdown, invalidated: boolean, invalidReason?: string }`
- Implementar os 4 blocos: Tendência, Impulso, Confirmação, Penalidades
- Invalidação absoluta (score = -999) para bloqueios críticos
- Cálculo de sizing baseado no score

**Dependências**: Tarefa 1, 2  
**Risco**: Médio

---

## TAREFA 4 — `utils/entryBlocker.ts` (Novo arquivo)

**O quê**: Sistema de bloqueio pré-entrada conforme Seção 5.

**Escopo**:
- Função `checkEntryBlocks(snapshot: TASnapshotV2, config: TechnicalAnalysisConfig): BlockResult[]`
- Cada bloqueio retorna `{ code: string, reason: string, severity: 'HARD' | 'SOFT' }`
- Tracking de: cooldown pós-loss, stops consecutivos, pernas sem pullback
- Integração com estado persistente (último trade, sequência de stops)

**Dependências**: Tarefa 1, 2  
**Risco**: Baixo

---

## TAREFA 5 — `utils/positionManagerV2.ts` (Novo ou extensão)

**O quê**: Gestão de posição com regras de saída da Seção 6.

**Escopo**:
- Trailing stop adaptativo ao ATR
- Saída parcial em TP1 + move stop para breakeven
- Saída por falha de follow-through
- Saída por perda de momentum (MACD + RSI)
- Saída por reversão de tendência (EMA crossover)
- Time stop
- Integração com `technicalConfig` para thresholds

**Dependências**: Tarefa 1, 2, 3  
**Risco**: Alto (gerencia dinheiro real)

---

## TAREFA 6 — Integração no `agentOrchestrator.ts`

**O quê**: Conectar o novo sistema de TA no fluxo de decisão do bot.

**Escopo**:
- Expandir `TokenAnalysis` com os novos campos do `TASnapshotV2`
- No `getAgentDecision()`: calcular score técnico ANTES de chamar o LLM
- Incluir score e bloqueios no prompt do LLM para decisão informada
- Respeitar bloqueios HARD (não deixar o LLM overrular)
- Score técnico como floor de confiança: `finalConfidence = max(llmConfidence, technicalScore/100)`
- Na saída: usar `positionManagerV2` em vez da lógica simples atual
- Logging detalhado de cada decisão com breakdown do score

**Dependências**: Todas as anteriores  
**Risco**: Alto (muda o fluxo principal de decisão)

---

## Ordem de Execução

```
Tarefa 1 (config)
    ↓
Tarefa 2 (volatilityMonitor refactor)
    ↓
Tarefa 3 (score) + Tarefa 4 (blocker) [paralelo]
    ↓
Tarefa 5 (position manager)
    ↓
Tarefa 6 (integração orchestrator)
```

---

## Critérios de Aceitação por Tarefa

- [ ] Cada nova função tem testes unitários
- [ ] Backward compatibility mantida (funções legadas não quebram)
- [ ] Todos os parâmetros são configuráveis via `TechnicalAnalysisConfig`
- [ ] Log detalhado em cada decisão de entrada/saída/bloqueio
- [ ] Score breakdown visível no dashboard
- [ ] Build sem erros (`tsc --noEmit`)
