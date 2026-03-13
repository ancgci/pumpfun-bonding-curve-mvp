# Otimização de Lançamentos (Sprint 4)

Este documento detalha o conjunto de melhorias implementadas para permitir que o bot execute trades de scalping em tokens de lançamentos rápidos (80% bonding curve) com alta precisão e sem atrasos.

---

## 🚀 Problema Original
Tokens explosivos como o **PUMPER** subiam >100% em poucos minutos após atingirem 80% da curva. No entanto, o bot frequentemente dava "SKIP" ou atribuía **Score 0** devido a:
1.  **Trava de Dados**: Exigência de 3-15 segundos de observação própria via gRPC para estabilizar indicadores.
2.  **Sinais Lentos**: MACD e RSI demoram a responder em tokens com pouco histórico de preço na memória do bot.

---

## 🛠️ Soluções Implementadas

### 1. Backfill de Histórico (Discovery Lane)
Ao detectar um token qualificado (Pipeline Step 1), o bot agora realiza um **backfill instantâneo**:
*   **Ação**: Chama a API da PumpFun (`/trades/all/{mint}`) para buscar os últimos **50 trades**.
*   **Injeção**: Popula retroativamente os monitores de volatilidade e organicidade.
*   **Benefício**: O Step 3 (TA) já inicia com MACD, RSI e VWAP calculados e estáveis.

### 2. Launch Momentum Bonus
Introduzimos um bônus agressivo para tokens em fase de descoberta:
*   **Regra**: Se o token for recém-descoberto E o `microTrend` (variação em 10s) for > 1.5%.
*   **Pontuação**: Bônus de **+40 pontos** no score de confluência.
*   **Objetivo**: Permitir aprovação imediata para tokens com alto FOMO, mesmo que os indicadores técnicos tradicionais ainda estejam frios.

### 3. Redução de Rigidez Técnica
*   **Min Candles**: A exigência mínima de candles de 1s para o motor de TA foi reduzida de **3 para 2**.
*   **Hard Blocks**: O bloqueio `BLOCK_INSUFFICIENT_DATA` agora é acionado apenas se o backfill falhar e o token tiver menos de 2 segundos de vida.

---

## 📊 Impacto no Pipeline

| Step | Mudança | Resultado |
|---|---|---|
| **Step 1: Discovery** | Adicionado call `backfillTokenHistory` | Memória populada com 50 trades do passado. |
| **Step 3: TA** | Bônus de Momento + Relaxamento de Trava | Score alto imediato em tokens explosivos. |
| **Step 5: Hard Blocks** | Relaxamento para 2s | Menos rejeições falsas em tokens ultra-novos. |

---

## 📋 Como Monitorar nos Logs
Fique atento às etiquetas coloridas no terminal:
*   `🔄 [History] Buscando backfill...`: Indica que o bot está buscando o passado do token.
*   `📊 [TA V2] Score=75/100 (Bonus Launch Active)`: Indica que o bônus de momento foi aplicado.
*   `✅ APROVADO | [Pipeline 3/8 - Technical Analysis]`: Confirma que a otimização funcionou e o token seguiu no fluxo.

---
**Versão Doc**: 1.0 (2026-03-13)
