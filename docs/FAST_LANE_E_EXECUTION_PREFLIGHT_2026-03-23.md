# Fast Lane e Execution Preflight

**Data:** 23/03/2026  
**Escopo:** somente local, sem deploy  
**Objetivo:** melhorar a performance operacional do bot com uma camada mais determinística inspirada em `go-trader` e `Hummingbot`

---

## 1. Motivação

O bot já tinha:

- LLM para decisão principal;
- RiskEngine;
- governança adaptativa de entrada;
- proteção de organicidade;
- micro-confirmação antes da compra.

O problema restante era outro: setups claramente ruins ainda podiam consumir latência do LLM e parte das entradas ainda dependia demais do cérebro probabilístico para responder perguntas que são melhores como regra operacional.

Então a melhoria foi separar três papéis:

1. `go-trader` como inspiração para uma camada rápida e determinística de setup
2. `go-trader` como inspiração para um governador de exposição de portfólio
3. `Hummingbot` como inspiração para um preflight operacional antes de executar

---

## 2. O que foi adicionado

### 2.1 Fast Lane

Arquivo: `utils/strategyFastLane.ts`

Camada determinística para:

- bloquear setups estruturalmente ruins antes do LLM;
- reforçar setups bons com leve bônus de confiança depois do LLM;
- limitar sizing quando o contexto técnico não é bom o suficiente para size cheio.

Hoje ela reconhece:

- `momentum_breakout`
- `trend_reclaim`
- `exhaustion_guard`
- `distribution_guard`
- `insufficient_data`

Exemplos de bloqueio:

- poucas velas de 1 segundo;
- RSI exaurido;
- preço muito esticado vs EMA/VWAP;
- fluxo com cara de distribuição.

---

### 2.2 Portfolio Governor

Arquivo: `utils/portfolioGovernor.ts`

Camada de controle inspirada em `go-trader` para não deixar o bot empilhar risco sem perceber.

Ela observa:

- número total de posições abertas;
- exposição ativa total em SOL;
- concentração por `creatorWallet`;
- zona suave de exposição que retorna `RECHECK` em vez de comprar imediatamente.

Resultado possível:

- `ALLOW`
- `RECHECK`
- `BLOCK`

---

### 2.3 Execution Preflight

Arquivo: `utils/executionPreflight.ts`

Camada inspirada em `Hummingbot` que roda imediatamente antes da execução.

Ela combina:

- validação de preço/latência de entrada;
- verificação do `portfolio governor`;
- checagem de saldo da wallet em `LIVE`.

Resultado possível:

- `ALLOW`
- `RECHECK`
- `BLOCK`

---

## 3. Onde entrou no funil

Arquivo principal: `utils/agentOrchestrator.ts`

### Antes do LLM

O `fast lane` agora pode cortar setups claramente ruins sem gastar chamada de modelo.

### Depois do LLM

Se a decisão vier como `BUY`, o bot:

1. revalida hard blocks
2. reavalia score adaptativo
3. passa pelo `fast lane` novamente
4. passa pela proteção de organicidade
5. passa pela micro-confirmação
6. passa pelo `execution preflight`
7. só então calcula o size final e executa

---

## 4. Novo sizing final

O multiplicador final deixou de ser só confiança + score técnico.

Agora ele considera:

`min(confidenceMultiplier, technicalMultiplier, profileCap, fastLaneCap, portfolioCap)`

Isso reduz duas classes de erro:

- size grande demais em setup ainda imaturo;
- nova entrada quando a carteira já está perto do limite de exposição.

---

## 5. Novas variáveis

Adicionadas ao baseline local e ao `.env.example`:

```env
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
```

---

## 6. Persistência adicional para análise

O contexto persistido do trade agora pode carregar:

- `fastLaneVerdict`
- `fastLaneScore`
- `fastLaneReason`
- `preflightStatus`
- `preflightReason`
- `portfolioOpenPositions`
- `portfolioExposureSol`

Isso melhora leitura de post-mortem e comparação entre decisão do LLM e decisão operacional.

---

## 7. Testes

Cobertura adicionada:

- `test/unit/strategyFastLane.test.ts`
- `test/unit/portfolioGovernor.test.ts`

Validação executada localmente:

```bash
npx tsc --noEmit
npx jest --config jest.config.js test/unit/strategyFastLane.test.ts test/unit/portfolioGovernor.test.ts --runInBand
```

---

## 8. Efeito esperado

O ganho esperado não é “mais indicadores”.

O ganho esperado é:

- menos tokens ruins chegando ao LLM;
- menos compras em setups tecnicamente exaustos;
- menos sobreposição de risco entre posições;
- menos entradas aprovadas tecnicamente mas inviáveis operacionalmente;
- menor dependência da LLM para decisões que devem ser determinísticas.

---

## 9. Status

Implementado **apenas no ambiente local**.  
Nenhum deploy foi feito nesta etapa.
