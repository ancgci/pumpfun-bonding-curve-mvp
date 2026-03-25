# Pipeline 3/8 - Technical Analysis V2

**Data:** 24/03/2026  
**Escopo:** documentar exatamente o que a etapa 3 avalia hoje no bot

## Referencia operacional

Este documento passa a usar **21/03/2026 10:04** como marco de comparacao operacional.

Motivo:
- esse horario passa a ser a referencia para comparar o comportamento do bot antes e depois dos ajustes incrementais mais recentes na etapa 3;
- o objetivo aqui nao e provar performance historica por si so, e sim deixar claro **o que a etapa 3 faz hoje** para facilitar rollback, poda de regras e investigacao de regressao.

## Papel da etapa 3

A etapa `3/8 - Technical Analysis` roda em `utils/agentOrchestrator.ts` antes da decisao da LLM.

Ela:
- coleta um snapshot tecnico de curtissimo prazo via `getTASnapshotV2()`;
- calcula um score de confluencia via `calculateConfluenceScore()`;
- grava no `tokenAnalysis` os campos `taScore`, `taScoreBreakdown`, `taClassification` e `taClassificationReason`;
- emite o log `[Pipeline 3/8 - Technical Analysis]`;
- **nao bloqueia sozinha a LLM por score baixo**;
- mas influencia fortemente a etapa 4 e tambem a revalidacao pos-LLM.

Em termos praticos: a etapa 3 hoje e "informativa" no pre-LLM, mas ela nao e neutra. O score e a classificacao alimentam o contexto do agente, o sizing, os rechecks e a governanca posterior.

Desde a refatoracao local mais recente, a etapa 3 opera em **dois modos**:

- `modo completo`: continua sendo usado fora do regime PumpFun de launch proximo da migracao;
- `modo compacto`: ativado para `protocol=pumpfun`, com foco em scalping de explosao curta e leitura de launch/migracao.

## Snapshot tecnico coletado

O snapshot vem de `utils/volatilityMonitor.ts` e hoje inclui:

- `currentPrice`
- `ema5`
- `ema9`
- `ema13`
- `emaAligned`
- `emaSlope5`
- `emaSpreadFast`
- `distEMA5Pct`
- `macd.macd`
- `macd.signal`
- `macd.histogram`
- `macd.histogramPrev`
- `macd.histogramAccelerating`
- `macd.nearZero`
- `rsi`
- `rsiSlope`
- `atr`
- `atrPct`
- `candleRangePct`
- `donchian.breakoutUp`
- `vwap`
- `distVWAPPct`
- `priceAboveVWAP`
- `roc`
- `volumeRelative.ratio`
- `volumeRelative.isBurst`
- `volumeRelative.isSpike`
- `microTrend.changePct`
- `microTrend.samples`
- `trend.changePct`
- `trend.isRed`
- `trend.bodySize`
- `candlesAvailable1s`
- `closes1s`

## Modos atuais de score tecnico

O score e calculado em `utils/technicalScore.ts`.

### Modo 1. Score completo

Usado para regimes gerais e tokens fora do launch compacto PumpFun.

#### 1. Tendencia micro

Itens avaliados:
- `emaAligned`
- `emaSlope`
- `emaSlopeAccelerating`
- `emaSpreadOpening`
- `priceAboveVWAP`

Objetivo:
- medir se o preco esta alinhado com a estrutura micro de tendencia de 1 segundo.

#### 2. Impulso

Itens avaliados:
- `macdHistPositive`
- `macdHistAccelerating`
- `macdNearZeroBonus`
- `rsiInBullZone`
- `rsiSlopePositive`
- `rocPositiveAndGrowing`

Objetivo:
- medir se ha impulso bullish com aceleracao suficiente para sustentar entrada curta.

#### 3. Confirmacao

Itens avaliados:
- `volumeBurst`
- `volumeBurstExtra`
- `donchianBreakout`
- `atrHealthy`

Objetivo:
- exigir algum grau de confirmacao de fluxo e breakout, em vez de usar apenas movimento bruto de preco.

#### 4. Bonus

Itens avaliados:
- `microTrendPositive`
- bonus agressivo de lancamento quando ha `microTrend` forte + `priceAboveVWAP` e ainda faltam sinais lentos

Objetivo:
- impedir que launches muito novos sejam zerados apenas porque ainda nao formaram EMA/MACD completos.

#### 5. Penalidades

Itens avaliados:
- `vwapDistancePenalty`
- `rsiOverboughtPenalty`
- `macdDecelPenalty`
- `limitedCandlesPenalty`
- `missingVolumePenalty`
- `weakFollowThroughPenalty`
- `thinConfirmationPenalty`

Objetivo:
- reduzir score de setups esticados, sem volume, com poucos candles ou sem follow-through.

### Modo 2. Score compacto PumpFun launch

Ativado quando:

- `protocol = pumpfun`

Objetivo:

- reduzir dependencia de sinais lentos para setups claramente `scalper`;
- parar de classificar launch forte como `WEAK_SETUP` apenas porque EMA/MACD/ROC/Donchian ainda nao amadureceram;
- privilegiar latencia e continuacao curta, nao confirmacao tardia.

Itens que realmente pesam nesse modo:

- `priceAboveVWAP`
- `microTrend.changePct`
- `volumeRelative.ratio`
- `volumeRelative.isBurst`
- `trend.changePct`
- `bondingCurvePercent` como bonus leve, somente quando ja existe fluxo positivo real

Penalidades que continuam ativas nesse modo:

- `vwapDistancePenalty` apenas quando o preco fica muito longe da VWAP
- `rsiOverboughtPenalty` apenas em sobrecompra extrema
- `weakFollowThroughPenalty` quando o micro movimento ja virou realmente negativo

Itens que **deixaram de governar a etapa 3 nesse regime**:

- `emaAligned`
- `emaSlopeAccelerating`
- `macdHistPositive`
- `macdHistAccelerating`
- `macdNearZeroBonus`
- `rsiInBullZone`
- `rsiSlopePositive`
- `rocPositiveAndGrowing`
- `donchianBreakout`
- `atrHealthy`
- `limitedCandlesPenalty`
- `missingVolumePenalty`
- `thinConfirmationPenalty`

Leitura pratica:

- a etapa 3 continua existindo;
- mas, no regime PumpFun perto da migracao, ela agora e um detector curto de momentum de launch, nao um score tradicional de confluencia completa;
- o score `VALID` desse regime foi reduzido para uma faixa compativel com scalping rapido;
- `LOW_DATA` ficou reservado para launch realmente sem fluxo minimo.

## Classificacao final da etapa 3

A etapa 3 produz quatro saidas principais:

- `score`
- `classification`
- `classificationReason`
- `regime`

### Classification

Valores possiveis:
- `VALID`
- `LOW_DATA`
- `WEAK_SETUP`
- `EARLY_MOMENTUM`

Regras principais:
- `LOW_DATA` quando faltam candles ou quando o regime ainda e insuficiente para leitura estavel;
- `WEAK_SETUP` quando o score zera e faltam sinais positivos relevantes;
- `VALID` quando a leitura tecnica tem confluencia suficiente.

No modo compacto PumpFun:
- `LOW_DATA` significa launch novo ainda sem fluxo minimo;
- `EARLY_MOMENTUM` significa momentum inicial util para scalper antes da confirmacao mais forte;
- `VALID` significa que ja existe fluxo curto suficiente sem depender de indicadores lentos;
- `WEAK_SETUP` fica reservado para launch sem fluxo real, abaixo da VWAP e sem expansao minima.

### Regime

Valores possiveis:
- `BULLISH`
- `NEUTRAL`
- `BEARISH`
- `INSUFFICIENT_DATA`

Regras principais hoje:
- no modo completo, `< 3` candles de `1s` tende a `INSUFFICIENT_DATA`;
- no modo completo, EMA alinhada + acima da VWAP + MACD positivo tende a `BULLISH`;
- no modo completo, sem EMA alinhada e sem VWAP positiva tende a `BEARISH`;
- no modo compacto PumpFun, `1-2 candles + microtrend >= 0.5%`, `priceAboveVWAP`, volume chegando ou burst ja podem marcar `BULLISH`.

## Thresholds e parametros ativos

Os parametros-base moram em `utils/technicalConfig.ts`.

Os principais thresholds que moldam a etapa 3 hoje sao:
- `emaPeriods = [5, 9, 13]`
- `macdPeriods = [4, 9, 3]`
- `rsiPeriod = 7`
- `atrPeriod = 7`
- `donchianPeriod = 12`
- `volumeRelativeWindow = 10`
- `vwapWindow = 20`
- `rocPeriod = 5`
- `slopeWindow = 3`
- `rsiBullishMin = 55`
- `rsiBullishMax = 80`
- `rsiOverboughtBlock = 82`
- `volumeRelativeMin = 1.5`
- `volumeRelativeBurst = 2.5`
- `volumeSpikeThreshold = 3.0`
- `maxDistVWAPPct = 3.0`
- `maxDistEMAPct = 2.5`
- `atrMinPct = 0.05`
- `atrMaxPct = 5.0`
- `candleStretchMultiplier = 2.5`
- `scoreMinimo = 55`
- `scoreSizingMid = 65`
- `scoreSizingMax = 80`
- `taScoreRecheckBuffer = 8`
- `recheckDelayMs = 6000`
- `recheckMaxAttempts = 2`

## Bloqueios e pressao lateral ligados a etapa 3

Embora a etapa 3 nao execute o bloqueio final no pre-LLM por score baixo, ela opera junto com `utils/entryBlocker.ts`.

Itens avaliados ali:
- `BLOCK_COOLDOWN`
- `BLOCK_CONSECUTIVE_STOPS`
- `BLOCK_INSUFFICIENT_DATA`
- `BLOCK_VWAP_DISTANCE`
- `BLOCK_CANDLE_STRETCHED`
- `BLOCK_ATR_DEAD`
- `BLOCK_ATR_EXTREME`
- `BLOCK_RSI_OVERBOUGHT`
- `BLOCK_3RD_LEG`
- `BLOCK_VOLUME_SPIKE_NO_FOLLOW`
- `BLOCK_NO_VOLUME`
- `BLOCK_HISTOGRAM_DECEL`
- `BLOCK_RSI_SLOPE_NEG`
- `BLOCK_BREAKOUT_NO_SUSTAIN`

Leitura pratica:
- parte disso virou `SOFT`, nao `HARD`;
- mas continua influenciando recheck, pressao acumulada e resolucao pos-LLM.

Desde os ajustes de `24/03/2026`, o regime compacto PumpFun launch tambem reduziu redundancias na camada lateral:

- `BLOCK_ATR_DEAD` nao entra mais nesse regime;
- `BLOCK_HISTOGRAM_DECEL` nao entra mais nesse regime;
- `BLOCK_RSI_SLOPE_NEG` nao entra mais nesse regime;
- `BLOCK_BREAKOUT_NO_SUSTAIN` nao entra mais nesse regime;
- `BLOCK_NO_VOLUME`, `BLOCK_RSI_OVERBOUGHT`, `BLOCK_VWAP_DISTANCE` e `BLOCK_CANDLE_STRETCHED` ficaram menos agressivos;
- a pressao acumulada do `entryBlocker` ficou menor para launches PumpFun perto da migracao.

Em paralelo, o `Fast Lane` tambem passou a reconhecer `compact launch breakout` sem exigir `EMA/MACD` maduros para esse mesmo regime.

## Como a etapa 3 aparece no log

Logs tipicos:

```text
📊 [TA V2 Pre-LLM] TOKEN Score=0/100 Regime=BEARISH
[Pipeline 3/8 - Technical Analysis] ⚠️ REPROVADO | TOKEN (...) Technical Report (Score: 0, Status: WEAK_SETUP, Regime: BEARISH).
```

ou:

```text
📊 [TA V2 Pre-LLM] TOKEN Score=0/100 Regime=INSUFFICIENT_DATA
[Pipeline 3/8 - Technical Analysis] ⏳ DADOS_INSUFICIENTES | TOKEN (...) Technical Report (Score: 0, Status: LOW_DATA, Regime: INSUFFICIENT_DATA).
```

## Consequencia operacional

Para launches PumpFun de perfil claramente `scalper`, a etapa 3 atual pode ficar mais conservadora do que o desejado porque ela exige combinacao de:

- microtendencia;
- VWAP;
- EMA;
- MACD;
- volume relativo;
- breakout;
- follow-through;
- numero minimo de candles.

Isso melhora a robustez em ambiente normal, mas pode atrasar ou degradar setups de explosao curta perto da migracao.

Por isso, desde `24/03/2026`, o comportamento esperado ficou assim:

- fora de PumpFun near-migration: pipeline tecnico segue mais completo;
- em PumpFun near-migration: etapa 3, `entryBlocker`, `Fast Lane`, `post_llm_score` e `micro-confirm` operam em versao mais curta e menos redundante;
- o bot continua protegendo contra exaustao e fluxo fraco, mas para de exigir maturacao tecnica que um scalper de launch nao pode esperar.

## Efeito no pos-LLM

Os ajustes nao ficaram restritos ao `3/8`.

No mesmo regime PumpFun near-migration:

- o `post_llm_score` passou a usar recheck mais curto;
- `score timeout` pode ser contornado quando o launch continua forte mesmo sem segunda janela completa;
- a `micro-confirm` passou a usar janela menor e menos punitiva;
- probes frageis fora desse regime continuam usando janela mais longa e conservadora.

Resumo:

- a etapa 3 foi enxugada;
- as camadas redundantes seguintes tambem foram reduzidas;
- o objetivo e devolver ao bot um comportamento mais coerente com `scalper`, sem desligar as protecoes estruturais.

## Arquivos fonte da etapa 3

- `utils/agentOrchestrator.ts`
- `utils/technicalScore.ts`
- `utils/technicalConfig.ts`
- `utils/volatilityMonitor.ts`
- `utils/entryBlocker.ts`

## Uso recomendado deste documento

Use este doc quando quiser responder:

- o que exatamente a etapa 3 esta medindo hoje;
- quais componentes estao penalizando launch rapido;
- o que comparar contra o baseline operacional de `21/03/2026 10:04`;
- quais itens devem continuar como score;
- quais itens devem virar apenas contexto para a LLM;
- quais itens precisam sair da leitura `scalper` de PumpFun.
