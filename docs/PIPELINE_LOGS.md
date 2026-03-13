# 8-Step Verification Pipeline Tracking

Esta documentação detalha a implementação do rastreamento visual das 8 etapas do funil de aprovação do Agent de Inteligência Artificial para trades no ecossistema PumpFun.

## Objetivo
O objetivo dessa implementação (concluída em 13/03/2026) foi adicionar transparência extrema ao **Live Terminal** no Dashboard. Anteriormente, o terminal exibia apenas mensagens genéricas do Motor de Risco (`[RiskEngine]`) e do Agente (`[Agent]`). Com os filtros estritos que o bot aplica, frequentemente oportunidades eram derrubadas de forma silenciosa e o usuário da plataforma não sabia o momento exato e nem o motivo exato de uma transação não ter sido efetivada.

## As 8 Etapas do Funil (Pipeline)

A jornada de um Token desde a sua descoberta (geralmente nos 80% da curva de bonding) até a emissão da ordem de compra passa por uma cascata sequencial. Se o token falha em qualquer etapa, a avaliação é abortada.

| Etapa | Responsável | Descrição / Motivo de Bloqueio | Exemplo de Log no Terminal |
| :--- | :--- | :--- | :--- |
| **Step 1** | Motor de Descoberta (`index.ts`) | Observa transações novas da blockchain RPC. Descarta tokens abaixo de `%` de curva exigido (ex: <80%). | `[Pipeline 1/8 - Discovery] 🔍 APROVADO | Token ABC (9zbDuv...) descoberto aos 80.0% da curva.` |
| **Step 2** | RiskEngine (`index.ts` -> `riskEngine.ts`) | Filtro contra Scam, Honeypot e Risco Fundamentalista (LP Não Trancada, Concentração Top 10, etc). | `[Pipeline 2/8 - RiskEngine] 🛑 REPROVADO | Token ABC (9zbDuv...) BLOQUEADO (RiskEngine: LP não lockado).` |
| **Step 3** | Análise Técnica (`agentOrchestrator.ts`) | Pre-LLM Filters (TA V2). Verificação de histórico mínimo (Velas) e oscilações brutas (RSI/MACD/VWAP). | `[Pipeline 3/8 - Technical Analysis] ✅ APROVADO | ABC (9zbDuv...) passou pela Análise Técnica Pre-LLM (Score: 65).` |
| **Step 4** | Agente IA/LLM (`agentOrchestrator.ts`) | O modelo (ex: OpenAI/Gemini) toma a decisão de aprovação de `BUY` ou `SKIP` avaliando todos dados. | `[Pipeline 4/8 - AI Agent] 🧠 APROVADO (BUY) | ABC (9zbDuv...) gerou decisão LLM: BUY (82%).` |
| **Step 5** | Hard Blocks (`agentOrchestrator.ts`) | Regras de ouro estáticas pós-decisão. Retratações do mercado repentinas, limites de perdas (Cooldown). | `[Pipeline 5/8 - Hard Blocks] 🛑 REPROVADO | ABC (9zbDuv...) BLOQUEADO por regra estática (BLOCK_VWAP_DISTANCE).` |
| **Step 7** | Micro-Confirmação (`agentOrchestrator.ts`) | Observa os últimos milissegundos. Evita que a IA compre um token que acabou de levar dump (Despejo) durante a avaliação da LLM. | `[Pipeline 7/8 - Micro-Confirm] 🛑 REPROVADO | ABC (9zbDuv...) falhou na Micro-Confirmação (Sinais de Despejo).` |
| **Step 8** | Execution (`agentOrchestrator.ts`) | Envio da transação final para a Blockchain (Solana) com SL/TP definidos. | `[Pipeline 8/8 - Execution] 🚀 EXECUTADO TRADE | ABC (9zbDuv...) aprovado em todas as etapas! Enviando Ordem (COMPRA)!` |

## Codificação de Cores (ANSI)

Para facilitar a leitura rápida no terminal, as mensagens agora utilizam códigos de cores padrão:
- 🔵 **Ciano (Cyan)**: `APROVADO` - Indica sucesso em uma etapa intermediária.
- 🔴 **Vermelho (Red)**: `REPROVADO` - Indica bloqueio por risco, técnica ou regra de negócio.
- 🟢 **Verde (Green)**: `EXECUTADO TRADE` - Indica sucesso final e envio da ordem para a blockchain.

## Como Visualizar

As mensagens agora têm o prefixo `[Pipeline X/8]` onde `X` é a etapa do processo. 

A API de Backend do Dashboard (`dashboard-api/server.ts`) teve seu mecanismo de injeção atualizado para interceptar do log geral toda e qualquer frase contendo `[Pipeline`. 

Estas mensagens são enviadas em tempo real (Timezone Local / GMT-3) para o componente de frontend `AgentLiveTerminal.tsx`, permitindo auditoria ao vivo da tomada de decisão.
