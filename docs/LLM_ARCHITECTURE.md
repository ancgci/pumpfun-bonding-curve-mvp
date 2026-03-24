# Arquitetura de LLM e Estratégia de Agentes

Este documento descreve a arquitetura atual de Inteligência Artificial do bot e as considerações sobre o uso de modelos de linguagem únicos vs. especializados para diferentes agentes.

## Configuração Atual

Atualmente, o perfil local do bot utiliza uma **Arquitetura de Gateway Unificado**:

- **Primário:** NVIDIA-compatible Chat Completions.
- **Modelo primário local:** `z-ai/glm5`.
- **Endpoint primário local:** `https://integrate.api.nvidia.com/v1/chat/completions`.
- **Secundário:** Google Gemini via `@ai-sdk/google`.
- **Ordem local validada:** `legacy,google`.
- **Escopo:** `agentOrchestrator.ts`, `learnerAgent.ts` e `postMortemAgent.ts` compartilham o mesmo gateway e podem cair para o provider secundário quando o primário falha.

### Por que esta escolha é prudente agora?
1. **Consistência:** Todos os agentes compartilham o mesmo gateway, schema e telemetria de tentativas.
2. **Resiliência:** Se o provider primário falhar, o sistema pode cair para Gemini.
3. **Simplicidade operacional:** A troca entre providers agora depende mais de `.env` do que de mudanças de código.

## Evolução: Planejamento de Agentes Especializados

Para escalas maiores ou necessidades de ultra-baixa latência, a arquitetura pode evoluir para um modelo **Híbrido/Especializado**.

### Comparativo de Estratégias

| Estratégia | Vantagens | Desvantagens | Recomendação |
| :--- | :--- | :--- | :--- |
| **Gateway Unificado (Atual)** | Simplicidade, Consistência, fallback entre providers, manutenção facilitada. | Maior cuidado com compatibilidade entre schema, tools e providers. | Ideal para validação de estratégia e operação com redundância moderada. |
| **LLMs Múltiplas** | Otimização de custo, Redução de latência, Redundância de provedores. | Complexidade na gestão de chaves e prompts, Raciocínio fragmentado. | Recomendado para sistemas de alta frequência ou escaláveis. |

### Sugestão de Hierarquia (Futuro)

Se o bot precisar de mais velocidade, a distribuição prudente seria:

1. **Camada de Triagem (Scout/Risk Agents):**
   - **Modelos:** `GPT-4o-mini`, `Llama-3-70B` ou `Flash-models`.
   - **Foco:** Resposta instantânea (<0.5s) para filtrar tokens "lixo".
2. **Camada de Decisão (Tactical/Orchestrator):**
   - **Modelos:** `z-ai/glm5`, `Gemini Flash`, `Claude Sonnet` ou `GPT-4o`.
   - **Foco:** Raciocínio profundo, análise de padrões e contexto longo.

## Considerações sobre Latência
O tempo de decisão da IA é o fator que mais influencia na "agilidade" do bot. O baseline local atual usa `z-ai/glm5` como cérebro principal e Gemini como redundância. Reduzir a latência dos agentes iniciais para a casa dos milissegundos continua sendo a principal vantagem de arquiteturas mais especializadas.
