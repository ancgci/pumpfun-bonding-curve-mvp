# 🛠️ Protocolo de Desenvolvimento e Manutenção

Para garantir que o robô e seus agentes de IA permaneçam sincronizados com nossas melhores práticas de trading, os seguintes passos devem ser executados para CADA nova funcionalidade ou alteração de lógica:

## 1. Atualização da Documentação
*   **README.md**: Adicionar um resumo da nova funcionalidade na seção "Recent Changes" ou "Features".
*   **Pasta `/docs`**: Criar ou atualizar o arquivo técnico correspondente com os detalhes da implementação.

## 2. Atualização da Memória do Agente (Patterns)
*   **Arquivo**: `data/agent/patterns.json`
*   **Ação**: Sempre que chegarmos a um consenso sobre uma nova estratégia ou "heurística" (ex: "Não comprar topos", "Aguardar cruzamento da EMA9"), essa regra deve ser injetada manualmente na memória de padrões.
*   **Propósito**: Isso garante que o LLM utilize esses novos "insights" no próximo ciclo de tomada de decisão.

## 3. Validação Técnica
*   **Ação**: Rodar `npx tsc --noEmit` para garantir que as atualizações de documentação ou lógica não quebraram a tipagem do projeto.
