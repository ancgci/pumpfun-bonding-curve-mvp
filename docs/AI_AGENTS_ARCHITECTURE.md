# 🤖 Arquitetura de Agentes de IA

Este documento descreve o ecossistema de agentes inteligentes que compõem o motor de decisão do bot. O sistema utiliza uma abordagem de **Pipeline de 8 Etapas**, refletida diretamente nos logs do terminal (ex: `[Pipeline 4/8]`).

Além do pipeline online, o bot agora possui um **ciclo offline de feedback** para trades perdedores. Esse fluxo roda fora do caminho crítico, reconstrói o contexto do trade e alimenta o aprendizado contínuo sem impactar a latência operacional.

Em paralelo, o bot também pode ativar um **worker assíncrono de reentrada em winners recentes**. Esse worker não compra direto por memória de sucesso: ele monta uma fila curta de candidatos e reaplica o mesmo pipeline principal antes de qualquer nova entrada.

## 🗺️ Mapa de Diretórios

- `.agents/agents/` e `.agents/orchestrator/`: código-fonte do sistema multi-agente.
- `data/agent/`: estado persistido real do runtime, incluindo `patterns.json`, `learner-state.json`, `status.json`, `config.json` e `health.json`.
- `.agents/shared-memory/`: diretório legado mantido apenas por histórico; o runtime atual não lê nem grava estado aqui.
- `.agent/`: tooling local de desenvolvimento/ECC. Não participa do boot nem da persistência operacional do bot.

## 🔄 Fluxo de Execução (Pipeline 8/8)

Para cada token detectado via gRPC, o bot percorre as seguintes fases:

```mermaid
graph TD
    Stage1[1. Token Discovery] --> Stage2[2. Pre-Filtering]
    Stage2 --> Stage3[3. Technical Analysis V2]
    Stage3 --> Stage4[4. AI Agent Orchestration]
    Stage4 --> Stage5[5. Hard Blocks Validation]
    Stage5 --> Stage6[6. Organicity Protocol]
    Stage6 --> Stage7[7. Micro-Confirmation]
    Stage7 --> Stage8[8. Execution / Position Sizing]
```

---

## 🧩 Detalhamento das Etapas

### 1. Token Discovery
*   **Log**: `🔍 [Discovery]`
*   **Função**: Captura de novos mints via gRPC Subscription na Solana Mainnet.

### 2. Pre-Filtering (Nivel 0)
*   **Log**: `⚡ [PreFilter]`
*   **Função**: Rejeição instantânea (<1ms) de tokens com liquidez < 1 SOL, honeypots óbvios ou criadores em cooldown.

### 3. Technical Analysis V2 (Pipeline 3/8)
*   **Log**: `📊 [Pipeline 3/8 - Technical Analysis]`
*   **Função**: Coleta snapshot técnico de 1s e aplica score em dois regimes: completo para contextos gerais e compacto para `pumpfun` near-migration.
*   **Veredito**: `VALID`, `LOW_DATA` ou `WEAK_SETUP`, com peso maior em `microTrend`, `VWAP` e `volume` no modo compacto.
*   **Detalhamento**: ver [Pipeline 3/8 - Technical Analysis](PIPELINE_3_TECHNICAL_ANALYSIS.md)

### 4. AI Agent Orchestration (Pipeline 4/8)
*   **Log**: `🧠 [Pipeline 4/8 - AI Agent]`
*   **Função**: O "Cérebro" do sistema. Orquestra sub-agentes (Risk, Scalper, Sentiment, Whale) para gerar uma decisão LLM.
*   **Veredito**: `BUY`, `SKIP` ou `WAIT_FOR_DIP`.

### 5. Hard Blocks Validation (Pipeline 5/8)
*   **Log**: `🛡️ [Pipeline 5/8 - Hard Blocks]`
*   **Função**: Re-validação imediata pós-LLM. Como a IA demora ~2-4s, este estágio garante que o token não se tornou um "scam" ou atingiu limites de segurança nesse intervalo.
*   **Observação**: no regime compacto PumpFun launch, os bloqueios lentos e redundantes foram reduzidos para não sabotar setups claramente scalper.

### 6. Organicity Protocol (Pipeline 6/8)
*   **Log**: `🧬 [Pipeline 6/8 - Organicity]`
*   **Função**: Detecta manipulação de volume (staircase bots) e crescimento artificial. Bloqueia tokens que não possuem fluxo orgânico de holders reais.

### 7. Micro-Confirmation (Pipeline 7/8)
*   **Log**: `⏱️ [Pipeline 7/8 - Micro-Confirm]`
*   **Função**: Uma janela de observação final observando a saúde do token. Essencial para evitar "Dev Dumps" de lançamento.
*   **Observação**: agora usa configuração adaptativa. Em `pumpfun` near-migration, a janela é mais curta; fora desse regime, probes frágeis continuam usando confirmação mais conservadora.

### 8. Execution & Sizing (Pipeline 8/8)
*   **Log**: `🚀 [Pipeline 8/8 - Execution]`
*   **Função**: Cálculo dinâmico do lote com base na confiança da IA e envio da transação (Live ou Simulation).

---

## Offline Feedback Loop

Após o fechamento de um trade, o sistema executa uma esteira assíncrona de aprendizado:

```mermaid
graph TD
    A[Trade Closed] --> B[Snapshot Persistence]
    B --> C[PostMortemAgent]
    C --> D[LearnerAgent]
    D --> E[data/agent/patterns.json]
    E --> F[Prompt Injection no Pipeline 4/8]
    B --> G[WinnerReentryAgent]
    G --> H[Fila curta de reentrada]
    H --> I[Reavaliacao pelo pipeline principal]
```

### PostMortemAgent
*   **Log**: `🧠 [PostMortemAgent]`
*   **Função**: Analisa trades perdedores com contexto rico de entrada, saída, candles de 1s, TA, organicidade e trilha de monitoramento.
*   **Saída**: causa raiz provável, melhor janela de entrada, evidências, recomendações e regras candidatas.

### LearnerAgent
*   **Log**: `🧠 [LearnerAgent]`
*   **Função**: Consome os post-mortems gerados, sintetiza aprendizados recorrentes e injeta regras no prompt do agente principal.
*   **Observação**: O `PostMortemAgent` roda primeiro; o `LearnerAgent` usa essa análise enriquecida para produzir regras melhores.
*   **Persistência real**: regras e checkpoint ficam em `data/agent/patterns.json` e `data/agent/learner-state.json`.

## ❤️ Health Snapshot

- `data/agent/health.json` centraliza a saúde operacional dos subagentes.
- O snapshot registra `status`, `enabled`, `lastRunAt`, `lastSuccessAt`, `lastHeartbeatAt`, `lastError`, `queueSize` e `details` por agente.
- Hoje ele cobre pelo menos: `orchestrator`, `learner`, `postMortem`, `winnerReentry` e `dipMonitor`.

### WinnerReentryAgent
*   **Log**: `🧠 [WinnerReentryAgent]`
*   **Função**: Observa trades `CLOSED_TP` recentes, seleciona winners elegíveis para segunda entrada e coloca só os melhores em uma fila curta.
*   **Guardrails**: cap de fila, dedupe por mint, TTL, cooldown por mint e limite de reentradas.
*   **Observação**: Ele não executa compra cega; o mint volta a passar por `getAgentDecision()` e `executeAgentTrade()`.

---

## 🔗 Veja Também
- [Configuração de Estratégia](SCALPER_STRATEGY_OPTIMIZATION.md)
- [Proteção contra Manipulação](ORGANICITY_PROTECTION.md)
- [Documentação Técnica do AI Agent](AI_AGENT.md)
- [Pipeline 3/8 - Technical Analysis](PIPELINE_3_TECHNICAL_ANALYSIS.md)
- [Implementação do Loss Post-Mortem Agent](LOSS_POSTMORTEM_AGENT.md)
- [Winner Reentry Agent](WINNER_REENTRY_AGENT.md)
