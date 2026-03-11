# 🧠 Sistema Multi-Agentes PRO (Orquestração de IA)

O bot evoluiu de uma IA de decisão única para um ecossistema de **5 agentes especializados** que trabalham em paralelo para analisar cada oportunidade de trade.

## 🏗️ Arquitetura de Agentes

O sistema utiliza um **Orquestrador Central** que gerencia o fluxo de dados entre diferentes "especialistas":

| Agente | Especialidade | Função |
|--------|---------------|--------|
| **RiskAgent** | Segurança & Anti-Rug | O primeiro a falar. Analisa contratos, carteira do Dev e histórico de golpes. Tem poder de veto (BLOCK). |
| **ScalperAgent** | Micro-Tendências | Focado em janelas de 1s a 5s. Busca padrões de Dip & Rip e momentum de curto prazo. |
| **SentimentAgent** | Social & Hype | Avalia o burburinho em torno do token para medir a força da subida. |
| **WhaleTrackerAgent** | Grandes Movimentações | Monitora se baleias estão entrando ou se preparando para despejar (dump). |
| **CopyTradingAgent** | **Juiz Central** | Consolida as análises de todos os outros agentes e toma a decisão final de EXECUÇÃO. |

## 🤝 Mecanismo de Consenso

Diferente do sistema antigo, onde um único prompt tentava entender tudo, agora a inteligência é distribuída:
1. O **RiskAgent** valida a segurança. Se for perigoso, o trade é abortado imediatamente.
2. Os agentes de **Estratégia** (Scalper, Sentiment, Whale) geram contexto.
3. O **CopyTradingAgent** ouve todos os "membros do conselho" e gera a ordem final de compra com **Take Profit e Stop Loss dinâmicos**.

## 🛡️ Resiliência & Fail-Safe

O sistema foi projetado com uma camada de **Resiliência Crítica**:
- **Auto-Fallback**: Caso o sistema de múltiplos agentes falhe ou atinja o tempo limite de resposta, o orquestrador reverte automaticamente para o motor de IA original (`callLlm`).
- **Continuidade**: Isso garante que o bot nunca pare de operar por problemas técnicos na orquestração, mantendo a agressividade e a presença no mercado.

## 🛠️ Implementação Técnica

- **BaseAgent**: Classe abstrata que centraliza a lógica de comunicação com a LLM da NVIDIA, controle de latência (3 req/s) e extração de JSON.
- **Orquestrador**: Localizado em `.agents/orchestrator/main-orchestrator.ts`, gerencia a sequência de chamadas (Risco → Estratégia → Decisão).

---
*Este sistema é a base para a autonomia total do bot, permitindo que cada agente evolua e aprenda de forma independente.*
