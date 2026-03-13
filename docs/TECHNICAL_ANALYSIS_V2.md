# ANÁLISE TÉCNICA V4 — ARQUITETURA QUANT PARA BOT SCALPER PUMP.FUN

> **Versão**: 4.0
> **Data**: 2026-03-13
> **Timeframe operacional**: 1 segundo (buckets de 1s)
> **Objetivo**: Scalping agressivo em lançamentos (80% curve) com injeção de histórico prévio.

---

## SEÇÃO 1 — SETUP BASE RECOMENDADO

| Feature | Parâmetro | Justificativa |
|---|---|---|
| EMA Curta | 5 | Reação imediata ao preço |
| EMA Média | 9 | Tendência micro confirmada |
| EMA Longa | 13 | Filtro de direção micro |
| MACD | 4, 9, 3 | Rápido o suficiente para 1s sem ser puro ruído |
| RSI | 7 | Equilibra sensibilidade e ruído |
| ATR | 7 | Mede explosão de volatilidade recente |
| Donchian | 12 | Detecta breakout de máxima/mínima local |
| Volume Relativo | Janela 10 candles | Detecta burst vs média recente |
| Rolling VWAP | 20 candles | Equilíbrio de preço local |
| ROC | 5 | Aceleração real do movimento |
| ADX | 7 (opcional) | Só se agregar valor estatístico em backtest |

---

## SEÇÃO 2 — PAPEL DE CADA INDICADOR/FEATURE

### A) EMAs 5/9/13

**Função**: Determinar TENDÊNCIA MICRO.

- **Alinhamento bullish**: EMA5 > EMA9 > EMA13 → tendência de alta micro
- **Slope (inclinação)**: Derivada da EMA entre os últimos 3 candles. Slope positivo crescente = impulso. Slope achatado = perda de tendência.
- **Spread entre médias**: `spreadFast = (EMA5 - EMA9) / EMA9 * 100`. Spread abrindo = tendência acelerando. Spread fechando = desaceleração.
- **Distância do preço**: `distEMA5 = (price - EMA5) / EMA5 * 100`. Se > threshold (ex: 2%), preço esticado demais.

**Implementação — cálculo de slope**:
```
slope_ema5 = (EMA5[now] - EMA5[now-3]) / EMA5[now-3] * 100
```

### B) MACD 4,9,3

**Função**: Medir IMPULSO e MOMENTUM.

- **Histograma crescendo**: momentum aumentando → pré-condição para entrada.
- **Histograma desacelerando**: momentum caindo → alerta de exaustão, pré-condição para saída.
- **Cruzamento perto da linha zero**: sinal mais forte que cruzamento distante (menor risco de retorno à média).
- **Divergência curta**: preço faz nova máxima mas histograma faz máxima menor → divergência bearish.
- **Perda de momentum com preço subindo**: histograma diminuindo enquanto preço sobe → trap potencial.

**Variantes a testar em backtest**: 3,8,3 / 4,9,3 / 5,13,4.

### C) RSI 7

**Função**: Medir FORÇA RELATIVA e detectar exaustão.

- **Zona de impulso bullish**: RSI entre 55-75. Mantém força sem estar sobrecomprado.
- **Manutenção acima de 55**: saudável para continuação.
- **Perda da região 50**: sinal de fraqueza — abortar entrada ou preparar saída.
- **RSI > 80**: alerta de sobrecompra, NÃO é gatilho automático de venda, mas bloqueia nova entrada.
- **Divergência**: preço faz novo high, RSI faz lower high → exaustão.
- **Slope do RSI**: `rsiSlope = RSI[now] - RSI[now-3]`. Slope negativo com preço subindo = divergência operacional.

### D) ATR 7

**Função**: Medir VOLATILIDADE e calibrar stops.

- **ATR mínimo**: Se ATR < threshold (ex: 0.05%), mercado morto → bloquear entrada.
- **ATR máximo**: Se ATR > threshold (ex: 5%), volatilidade extrema → reduzir posição ou bloquear.
- **Candle esticado**: Se `candleRange > 2.5 * ATR`, candle já expandiu demais → bloquear entrada.
- **Stop calibrado**: `stopLoss = entryPrice - (ATR * stopMultiplier)`.
- **Trailing**: `trailingDistance = ATR * trailingMultiplier`.

### E) Donchian Channel 12

**Função**: Detectar BREAKOUT micro.

- **Upper band**: Máxima dos últimos 12 candles.
- **Lower band**: Mínima dos últimos 12 candles.
- **Breakout bullish**: `price > donchianUpper[anterior]` → rompimento de máxima local.
- **Sustentação**: Breakout válido somente se preço se mantém acima por N candles (ex: 3).
- **Rompimento sem volume**: breakout com volume abaixo da média → bloqueio.

### F) Volume Relativo / Volume Burst

**Função**: Medir CONFIRMAÇÃO por fluxo.

- **Volume Relativo (VR)**: `VR = volumeAtual / mediaVolume(10)`. VR > 1.5 = burst. VR > 3.0 = explosão.
- **Volume alto sem continuação**: burst seguido de retração do preço → trap.
- **Volume decrescente com preço subindo**: divergência de volume → exaustão.

**Nota para pump.fun**: Volume = número/valor de transações de buy/sell na bonding curve. Mapear como proxy de volume real.

### G) Rolling VWAP 20

**Função**: Medir EQUILÍBRIO local.

- **Cálculo**: `VWAP = Σ(price * volume) / Σ(volume)` nos últimos 20 candles.
- **Preço acima da VWAP**: viés bullish, buyers no controle.
- **Preço abaixo da VWAP**: viés bearish.
- **Distância excessiva**: `distVWAP = (price - VWAP) / VWAP * 100`. Se > threshold (ex: 3%), preço esticado → bloquear entrada.
- **Reaceitação**: preço retorna e se mantém acima da VWAP após toque → suporte de equilíbrio.

### H) ROC 5 (Rate of Change)

**Função**: Medir ACELERAÇÃO.

- **ROC positivo e crescendo**: aceleração bullish.
- **ROC positivo mas desacelerando**: perda de impulso.
- **ROC negativo**: momentum bearish.
- **Cálculo**: `ROC = (price[now] - price[now-5]) / price[now-5] * 100`.

### I) ADX 7 (Opcional)

**Função**: Diferenciar TENDÊNCIA de CHOP.

- **ADX > 25**: tendência presente → habilitar estratégia de follow.
- **ADX < 20**: chop/consolidação → bloquear entradas ou usar lógica diferente.
- **Cautela**: Em 1s, ADX pode ser ruidoso. Só manter se backtest provar valor.

---

## SEÇÃO 3 — REGRAS DE ENTRADA LONG

### Condições OBRIGATÓRIAS (todas devem ser verdadeiras):

```
BLOCO 1 — TENDÊNCIA MICRO:
  ✅ EMA5 > EMA9 > EMA13 (alinhamento bullish)
  ✅ slope_ema5 > 0 (inclinação positiva)
  ✅ price > VWAP (acima do equilíbrio local)

BLOCO 2 — IMPULSO:
  ✅ MACD histograma > 0 E crescendo (hist[now] > hist[now-1])
  ✅ RSI > 55 E RSI < 80
  ✅ ROC > 0 (momentum positivo)

BLOCO 3 — CONFIRMAÇÃO:
  ✅ volumeRelativo > 1.5 (burst de volume)
  ✅ ATR > atrMinimo (mercado não está morto)
  ✅ candleRange < ATR * 2.5 (candle não está esticado)
```

### Condições de REFORÇO (score extra, não obrigatórias):

```
  ➕ Breakout Donchian (price > donchianUpper)
  ➕ MACD cruzamento perto da linha zero
  ➕ RSI slope positivo
  ➕ Spread EMA5-EMA9 abrindo
  ➕ Volume relativo > 2.5
  ➕ distVWAP < 1% (entry muito perto do equilíbrio)
```

---

## SEÇÃO 4 — REGRAS DE ENTRADA SHORT

**Pump.fun NÃO permite operação short direta.**

A lógica short se aplica apenas como **LÓGICA DE SAÍDA** de posições long:
- Detectar sinais bearish para fechar a posição existente.
- Sinais bearish = EMA invertendo, MACD desacelerando, RSI perdendo 50, ROC negativo, preço abaixo da VWAP.

**Não implementar short como trade autônomo.**

---

## SEÇÃO 5 — REGRAS DE BLOQUEIO DE ENTRADA

```
🚫 BLOCK_NO_VOLUME: volumeRelativo < 1.0 em breakout
🚫 BLOCK_CANDLE_STRETCHED: candleRange > ATR * 2.5
🚫 BLOCK_VWAP_DISTANCE: distVWAP > maxDistVWAP (ex: 3%)
🚫 BLOCK_EMA_DISTANCE: distEMA5 > maxDistEMA (ex: 2.5%)
🚫 BLOCK_RSI_OVERBOUGHT: RSI > 82
🚫 BLOCK_3RD_LEG: 3 pernas consecutivas sem pullback (contagem de expansões sem retração > 2)
🚫 BLOCK_HISTOGRAM_DECEL: histograma MACD diminuindo por 3+ candles
🚫 BLOCK_RSI_SLOPE_NEG: RSI slope negativo com preço subindo (divergência)
🚫 BLOCK_BREAKOUT_NO_SUSTAIN: preço rompeu Donchian mas não sustentou por sustainCandles (ex: 3)
🚫 BLOCK_VOLUME_SPIKE_NO_FOLLOW: VR > 3.0 mas preço não avançou > 0.5% nos próximos 3 candles
🚫 BLOCK_ATR_DEAD: ATR < atrMinimo (mercado morto)
🚫 BLOCK_ATR_EXTREME: ATR > atrMaximo (volatilidade extrema)
🚫 BLOCK_COOLDOWN: últimos N trades foram loss → cooldown ativo
🚫 BLOCK_CONSECUTIVE_STOPS: 3+ stops consecutivos → pausa de X segundos
```

---

## SEÇÃO 6 — REGRAS DE SAÍDA E GESTÃO

### 6.1 Stop Loss Técnico
```
stopPrice = entryPrice - (ATR * stopMultiplier)
Default stopMultiplier = 1.5
```

### 6.2 Take Profit por Alvo
```
tp1 = entryPrice + (ATR * tpMultiplier1)  // Saída parcial (50%)
tp2 = entryPrice + (ATR * tpMultiplier2)  // Saída total
Default tpMultiplier1 = 2.0, tpMultiplier2 = 3.5
```

### 6.3 Trailing Stop Adaptativo
```
SE posição em lucro > ATR * 1.0:
  trailingDistance = ATR * trailingMultiplier
  trailingStop = max(trailingStop, highestPrice - trailingDistance)
  SE price < trailingStop → SAIR
Default trailingMultiplier = 1.2
```

### 6.4 Saída por Falha de Follow-Through
```
SE após entrada, em 5 candles o preço não avançou > minFollowThrough (ex: 0.3%):
  → SAIR (trade morto, liberar capital)
```

### 6.5 Saída por Perda de Momentum
```
SE MACD histograma desacelerando por 3+ candles E RSI caiu abaixo de 50:
  → SAIR
SE ROC torna-se negativo:
  → SAIR ou apertar trailing
```

### 6.6 Saída por Reversão Técnica
```
SE EMA5 cruza abaixo de EMA9:
  → SAIR
SE price fecha abaixo da VWAP por 3+ candles:
  → SAIR
```

### 6.7 Time Stop
```
SE tempo_em_trade > maxTradeTime (ex: 120 candles = 2 min):
  → SAIR independente do resultado
```

### 6.8 Saída Parcial (Split Exit)
```
Em TP1: vender 50% da posição, mover stop para breakeven
Em TP2: vender restante
SE trailing stop ativado: vender tudo
```

---

## SEÇÃO 7 — SCORE DE CONFLUÊNCIA

### Sistema de Pontuação (0-100):

```
BLOCO 1 — TENDÊNCIA MICRO (máx 30 pts):
  EMA alinhadas (5>9>13)        → +10 pts
  Slope EMA5 positivo            → +5 pts
  Slope EMA5 crescendo           → +5 pts
  Spread EMA5-EMA9 abrindo       → +5 pts
  Price > VWAP                   → +5 pts

BLOCO 2 — IMPULSO (máx 30 pts):
  MACD histograma > 0            → +5 pts
  MACD histograma crescendo      → +5 pts
  MACD perto da linha zero       → +5 pts (bônus)
  RSI entre 55-75                → +5 pts
  RSI slope positivo             → +5 pts
  ROC > 0 e crescendo            → +5 pts

BLOCO 3 — CONFIRMAÇÃO (máx 25 pts):
  Volume relativo > 1.5          → +8 pts
  Volume relativo > 2.5          → +4 pts (bônus)
  Breakout Donchian              → +8 pts
  ATR em range saudável          → +5 pts

BLOCO 4 — FILTRO (penalidades):
  distVWAP > maxDistVWAP / 2     → -5 pts
  distVWAP > maxDistVWAP         → -999 (INVALIDA)
  Candle > ATR * 2.0             → -5 pts
  Candle > ATR * 2.5             → -999 (INVALIDA)
  3ª perna sem pullback           → -999 (INVALIDA)
  RSI > 80                       → -10 pts
  Histograma desacelerando 2+    → -5 pts
  Volume spike sem follow        → -999 (INVALIDA)

BÔNUS:
  Micro-trend positivo (10s)     → +5 pts
  🚀 Launch Momentum (NEW)       → +35 pts (Total +40 se for launch sem MACD/EMA pronto)
  ADX > 25 (se habilitado)       → +5 pts
```

### Decisão:
```
score >= scoreMinimo (default 55) → ENTRADA PERMITIDA
score < scoreMinimo               → BLOQUEADA
score = -999 (invalidação)        → BLOQUEADA ABSOLUTA
```

### Sizing por Score:
```
score 55-65  → posição mínima (50% do capital por trade)
score 80+    → posição máxima (100%)
```

---

## SEÇÃO 7.1 — FLUXO DE EXECUÇÃO E LATÊNCIA LLM

Devido à latência natural da análise e decisão da Inteligência Artificial (LLM), que pode levar de 1 a 3 segundos, o sistema é dividido em dois momentos de avaliação técnica para evitar comprar um token que já esgotou seu movimento durante a "demora" da resposta.

### 1. Pré-Filtros (Antes da LLM)
*   Execução ultrarrápida (< 1ms).
*   **Filtros de Gestão**: Cooldown pós-loss e pausa por stops consecutivos.
*   **Filtros de Rejeição Imediata**: Micro-dump extremo (> 8-15% negativo), baixa liquidez, honeypot.
*   **Objetivo**: Bloquear entradas lixo antes de gastar recursos e tempo de API. O Score de TA é calculado apenas para *enviar ao conhecimento da LLM*.

### 2. Re-validação Técnica (Pós-LLM)
*   Se a LLM aprova a compra (`action: "BUY"`), a análise técnica é refeita *no momento exato da execução*.
*   **Bloqueios HARD avaliados**: Se qualquer bloqueio (ex: VWAP distance, candle esticado, ATR morto) for acionado nesse segundo exato, a compra é abortada.
*   **Score reavaliado**: Se o score técnico nesse novo segundo for menor que o `scoreMinimo` (ex: 55), a compra é abortada.
*   **🚀 Backfill de Histórico (Discovery Lane)**: O sistema agora **não exige espera**. Ao descobrir o token (Step 1), o bot busca automaticamente os últimos **50 trades** via API. Isso popula os indicadores (MACD/RSI) instantaneamente.
*   **Min Candles**: A trava técnica mínima foi baixada para **2 candles de 1s** (devido ao backfill).
*   **Ação**: Tokens aprovados pela LLM mas abortados na re-validação técnica são imediatamente enviados para a fila do **DipMonitor**.

---

## SEÇÃO 8 — PARÂMETROS AJUSTÁVEIS

```typescript
interface TechnicalAnalysisConfig {
  // Períodos dos indicadores
  emaPeriods: [number, number, number];      // default: [5, 9, 13]
  macdPeriods: [number, number, number];     // default: [4, 9, 3]
  rsiPeriod: number;                         // default: 7
  atrPeriod: number;                         // default: 7
  donchianPeriod: number;                    // default: 12
  volumeRelativeWindow: number;              // default: 10
  vwapWindow: number;                        // default: 20
  rocPeriod: number;                         // default: 5
  adxPeriod: number;                         // default: 7
  adxEnabled: boolean;                       // default: false

  // Thresholds de entrada
  rsiBullishMin: number;                     // default: 55
  rsiBullishMax: number;                     // default: 80
  rsiOverboughtBlock: number;                // default: 82
  volumeRelativeMin: number;                 // default: 1.5
  volumeRelativeBurst: number;               // default: 2.5

  // Thresholds de distância
  maxDistVWAP: number;                       // default: 3.0 (%)
  maxDistEMA: number;                        // default: 2.5 (%)

  // ATR thresholds
  atrMinPct: number;                         // default: 0.05 (%)
  atrMaxPct: number;                         // default: 5.0 (%)
  candleStretchMultiplier: number;           // default: 2.5

  // Stop/Take Profit
  stopMultiplier: number;                    // default: 1.5 (x ATR)
  tpMultiplier1: number;                     // default: 2.0 (x ATR)
  tpMultiplier2: number;                     // default: 3.5 (x ATR)
  trailingMultiplier: number;                // default: 1.2 (x ATR)
  partialExitPct: number;                    // default: 50

  // Sustentação e follow-through
  sustainCandles: number;                    // default: 3
  minFollowThroughPct: number;               // default: 0.3 (%)
  followThroughCandles: number;              // default: 5
  slopeWindow: number;                       // default: 3

  // Score
  scoreMinimo: number;                       // default: 55
  scoreSizingMid: number;                    // default: 65
  scoreSizingMax: number;                    // default: 80

  // Gestão de risco
  maxTradeTimeCandles: number;               // default: 120 (2 min em 1s)
  cooldownAfterLossMs: number;               // default: 30000
  maxConsecutiveStops: number;               // default: 3
  consecutiveStopPauseMs: number;            // default: 60000
  maxLegsWithoutPullback: number;            // default: 2
  volumeSpikeNoFollowThreshold: number;      // default: 3.0
  volumeSpikeFollowMinPct: number;           // default: 0.5
  volumeSpikeFollowCandles: number;          // default: 3
}
```

---

## SEÇÃO 9 — PSEUDOCÓDIGO

```
function onNewCandle(mint, candle):
  // ===== PASSO 1: ATUALIZAR FEATURES =====
  updatePriceStore(mint, candle)
  
  ema5  = calculateEMA(closes, 5)
  ema9  = calculateEMA(closes, 9)
  ema13 = calculateEMA(closes, 13)
  slopeEma5 = (ema5[now] - ema5[now - slopeWindow]) / ema5[now - slopeWindow] * 100
  spreadFast = (ema5 - ema9) / ema9 * 100
  
  macd = calculateMACD(closes, 4, 9, 3)
  rsi  = calculateRSI(closes, 7)
  rsiSlope = rsi[now] - rsi[now - slopeWindow]
  atr  = calculateATR(periods, 7)
  donchian = calculateDonchian(periods, 12)
  vr   = calculateVolumeRelative(volumes, 10)
  vwap = calculateRollingVWAP(candles, 20)
  roc  = calculateROC(closes, 5)
  
  distVWAP = abs(price - vwap) / vwap * 100
  distEMA5 = abs(price - ema5) / ema5 * 100
  candleRange = candle.high - candle.low
  
  // ===== PASSO 2: POSIÇÃO ABERTA? =====
  if hasOpenPosition(mint):
    managePosition(mint, features)
    return
  
  // ===== PASSO 3: VERIFICAR BLOQUEIOS =====
  blocks = checkBlocks(features)
  if blocks.length > 0:
    log("ENTRY BLOCKED:", blocks)
    return
  
  // ===== PASSO 4: CALCULAR SCORE =====
  score = 0
  
  // Bloco 1 — Tendência
  if ema5 > ema9 > ema13:           score += 10
  if slopeEma5 > 0:                  score += 5
  if slopeEma5 > slopeEma5[prev]:    score += 5
  if spreadFast abrindo:             score += 5
  if price > vwap:                   score += 5
  
  // Bloco 2 — Impulso
  if macd.histogram > 0:             score += 5
  if macd.histogram > macd.hist[prev]: score += 5
  if abs(macd.macdLine) < macdZeroZone: score += 5
  if rsi > 55 AND rsi < 75:         score += 5
  if rsiSlope > 0:                   score += 5
  if roc > 0 AND roc > roc[prev]:    score += 5
  
  // Bloco 3 — Confirmação
  if vr > 1.5:                       score += 8
  if vr > 2.5:                       score += 4
  if price > donchian.upper:         score += 8
  if atr > atrMinPct AND atr < atrMaxPct: score += 5
  
  // Bloco 4 — Penalidades
  if distVWAP > maxDistVWAP / 2:     score -= 5
  if rsi > 80:                       score -= 10
  if macd.histogram desacelerando 2+: score -= 5
  
  // ===== PASSO 5: DECIDIR =====
  if score >= scoreMinimo:
    sizing = calculateSizing(score)
    ENTER_LONG(mint, sizing)
    setStopLoss(entryPrice - atr * stopMultiplier)
    setTakeProfit1(entryPrice + atr * tpMultiplier1)
    setTakeProfit2(entryPrice + atr * tpMultiplier2)
    startTrailingMonitor(atr * trailingMultiplier)
    startTimeStop(maxTradeTimeCandles)
    log("ENTRY", score, sizing)
  
function managePosition(mint, features):
  pos = getPosition(mint)
  pnl = (price - pos.entryPrice) / pos.entryPrice * 100
  
  // Check Stop Loss
  if price <= pos.stopLoss:
    EXIT_ALL(mint, "STOP_LOSS")
    applyCooldown()
    return
  
  // Check TP1 (parcial)
  if price >= pos.tp1 AND NOT pos.tp1Hit:
    EXIT_PARTIAL(mint, partialExitPct, "TP1")
    pos.stopLoss = pos.entryPrice  // Move stop para breakeven
    pos.tp1Hit = true
    return
  
  // Check TP2 (total)
  if price >= pos.tp2:
    EXIT_ALL(mint, "TP2")
    return
  
  // Trailing Stop
  if pos.trailingActive:
    pos.highestPrice = max(pos.highestPrice, price)
    trailingStop = pos.highestPrice - (atr * trailingMultiplier)
    if price < trailingStop:
      EXIT_ALL(mint, "TRAILING_STOP")
      return
  
  // Time Stop
  if candlesSinceEntry > maxTradeTimeCandles:
    EXIT_ALL(mint, "TIME_STOP")
    return
  
  // Saída por perda de momentum
  if macd.histogram desacelerando 3+ AND rsi < 50:
    EXIT_ALL(mint, "MOMENTUM_LOSS")
    return
  
  // Saída por reversão de tendência
  if ema5 < ema9:
    EXIT_ALL(mint, "TREND_REVERSAL")
    return
  
  // Follow-through check
  if candlesSinceEntry >= followThroughCandles:
    if pnl < minFollowThroughPct:
      EXIT_ALL(mint, "NO_FOLLOW_THROUGH")
      return
```

---

## SEÇÃO 10 — PLANO DE BACKTEST E VALIDAÇÃO

### 10.1 Segmentação por Regime

| Regime | Critério | Comportamento Esperado |
|---|---|---|
| Volume Alto + Tendência | VR > 2, ADX > 25 | Melhor cenário; entradas devem performar |
| Volume Alto + Chop | VR > 2, ADX < 20 | Falsos breakouts; filtros devem bloquear |
| Volume Baixo + Tendência | VR < 1, ADX > 25 | Slippage alto; entradas arriscadas |
| Volume Baixo + Chop | VR < 1, ADX < 20 | Mercado morto; ZERO entradas esperadas |
| Topo Exausto | RSI > 80, histograma desacelerando | Bloqueio obrigatório |
| Reversão Imediata | Pump > 5% seguido de dump > 3% em 5s | Stop deve atuar rápido |

### 10.2 Métricas Obrigatórias

```
winrate              → % de trades lucrativos (meta > 50%)
payoff               → média de ganho / média de perda (meta > 1.2)
expectativa_mat      → (winrate * avgWin) - ((1-winrate) * avgLoss) → DEVE SER > 0
drawdown_max         → maior sequência de perda acumulada
profit_factor        → gross profit / gross loss (meta > 1.5)
avg_MAE              → Maximum Adverse Excursion (quanto o trade andou contra antes de fechar)
avg_MFE              → Maximum Favorable Excursion (quanto o trade andou a favor no pico)
slippage_medio       → diferença entre preço target e preço execução
tempo_medio_trade    → em candles (1s cada)
taxa_stop_armadilha  → % de stops causados por falso breakout
taxa_bloqueio        → % de oportunidades corretamente bloqueadas
```

### 10.3 Protocolo de Validação

1. **Walk-Forward**: Treinar parâmetros em janela 1, testar na janela seguinte. Repetir.
2. **Out-of-sample**: Nunca otimizar nos dados de teste final.
3. **Monte Carlo**: Simular 1000 sequências aleatórias de trades para estimar drawdown provável.
4. **Slippage adjustment**: Aplicar slippage sintético de 0.5-2% em todas as execuções.
5. **Latency simulation**: Adicionar delay de 50-200ms entre sinal e execução.

---

## SEÇÃO 11 — MELHORIAS FUTURAS

| Melhoria | Descrição | Prioridade |
|---|---|---|
| **Filtro de regime por liquidez** | Classificar token por liquidez da bonding curve antes de operar | ALTA |
| **ML pattern classification** | Treinar modelo em features para classificar setup good/bad | MÉDIA |
| **Feature engineering microestrutura** | Order flow, trade count por segundo, ratio buy/sell | ALTA |
| **Detecção de falso breakout** | Modelo específico para detectar pump-and-dump em 1s | ALTA |
| **Time stop adaptativo** | Ajustar tempo máximo baseado no ATR atual | MÉDIA |
| **Adaptive thresholds** | Parâmetros que se ajustam ao regime de mercado | MÉDIA |
| **Ensemble de sinais** | Combinar múltiplos modelos/scores com pesos adaptáveis | BAIXA |
| **Correlação entre tokens** | Detectar "ondas" de pump em tokens relacionados | BAIXA |
| **Latency-aware execution** | Ajustar lógica de entrada baseado na latência do RPC | ALTA |
| **On-chain flow analysis** | Monitorar wallets grandes em tempo real | ALTA |

---

## MAPEAMENTO: CÓDIGO ATUAL → MUDANÇAS NECESSÁRIAS

### `volatilityMonitor.ts` (arquivo principal de TA):

| Atual | Necessário |
|---|---|
| `getHighResMACD` usa 12,26,9 | Mudar para parametrizável: default 4,9,3 |
| `getHighResRSI` usa período 14 | Mudar default para 7 |
| `getMovingAverage` calcula EMA 9/21 | Adicionar EMA 5/13, exportar slope |
| `getTASnapshot` retorna RSI, MACD, EMA9/21 | Expandir para todo o feature set |
| Buckets de 5s | Adicionar buckets de 1s |
| Não tem Donchian | IMPLEMENTAR |
| Não tem Volume Relativo | IMPLEMENTAR |
| Não tem VWAP | IMPLEMENTAR |
| Não tem ROC | IMPLEMENTAR |
| Não tem Score | IMPLEMENTAR |
| Não tem bloqueios | IMPLEMENTAR |
| ATR usa 14 períodos em 1m | Adicionar ATR em 1s com período 7 |

### `agentOrchestrator.ts`:

| Atual | Necessário |
|---|---|
| `TokenAnalysis` tem rsi/macd básico | Expandir com todo o feature set |
| Decisão baseada em LLM | Combinar com score técnico local |
| Sem score de confluência | IMPLEMENTAR score engine |
| Sem bloqueios pré-entrada | IMPLEMENTAR block checks |

### Novos arquivos necessários:

| Arquivo | Conteúdo |
|---|---|
| `utils/technicalScore.ts` | Engine de score de confluência |
| `utils/entryBlocker.ts` | Lógica de bloqueios pré-entrada |
| `utils/technicalConfig.ts` | Configuração parametrizável de TA |
| `utils/donchianChannel.ts` | Cálculo de Donchian Channel |
| `utils/volumeAnalyzer.ts` | Volume Relativo e VWAP |
| `utils/rocCalculator.ts` | Rate of Change |
