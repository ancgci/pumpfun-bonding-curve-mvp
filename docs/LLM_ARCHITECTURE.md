# Arquitetura de LLM e Estratégia de Agentes

Este documento descreve a arquitetura atual de Inteligência Artificial do bot e as considerações sobre o uso de modelos de linguagem únicos vs. especializados para diferentes agentes.

## Configuração Atual

Atualmente, o bot utiliza uma **Arquitetura de LLM Única**:

- **Provedor:** NVIDIA NIM (Acelerador de Inferência).
- **Modelo:** `moonshotai/kimi-k2.5`.
- **Escopo:** Todos os agentes (`BaseAgent.ts`) e o orquestrador principal (`agentOrchestrator.ts`) compartilham a mesma chave de API e o mesmo modelo.

### Por que esta escolha é prudente agora?
1. **Consistência:** Garante que todos os agentes operem com o mesmo nível de "QI" e lógica de raciocínio.
2. **Qualidade de Custo/Benefício:** O `Kimi-K2.5` via NVIDIA oferece inteligência de nível Tier-1 a um custo de latência e financeiro muito baixo.
3. **Simplicidade:** Facilita a gestão de créditos e a depuração do sistema.

## Evolução: Planejamento de Agentes Especializados

Para escalas maiores ou necessidades de ultra-baixa latência, a arquitetura pode evoluir para um modelo **Híbrido/Especializado**.

### Comparativo de Estratégias

| Estratégia | Vantagens | Desvantagens | Recomendação |
| :--- | :--- | :--- | :--- |
| **LLM Única (Atual)** | Simplicidade, Consistência, Manutenção facilitada. | Possível gargalo de latência se o modelo for muito pesado. | Ideal para validação de estratégia e volumes médios. |
| **LLMs Múltiplas** | Otimização de custo, Redução de latência, Redundância de provedores. | Complexidade na gestão de chaves e prompts, Raciocínio fragmentado. | Recomendado para sistemas de alta frequência ou escaláveis. |

### Sugestão de Hierarquia (Futuro)

Se o bot precisar de mais velocidade, a distribuição prudente seria:

1. **Camada de Triagem (Scout/Risk Agents):**
   - **Modelos:** `GPT-4o-mini`, `Llama-3-70B` ou `Flash-models`.
   - **Foco:** Resposta instantânea (<0.5s) para filtrar tokens "lixo".
2. **Camada de Decisão (Tactical/Orchestrator):**
   - **Modelos:** `Kimi-K2.5`, `Claude 3.5 Sonnet` ou `GPT-4o`.
   - **Foco:** Raciocínio profundo, análise de padrões e contexto longo.

## Considerações sobre Latência
O tempo de decisão da IA é o fator que mais influencia na "agilidade" do bot. Atualmente, com o `Kimi-K2.5`, a resposta varia entre 1.5s a 3.5s em ambiente estável. Reduzir a latência dos agentes iniciais para a casa dos milissegundos é a principal vantagem de adotar LLMs variadas.
