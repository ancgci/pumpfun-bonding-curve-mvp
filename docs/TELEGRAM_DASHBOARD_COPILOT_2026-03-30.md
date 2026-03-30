# Telegram Copilot com Contexto do Dashboard

Data: `2026-03-30`

## Objetivo

Expandir o agente de IA do Telegram para responder com contexto do dashboard, e não apenas com informações de infraestrutura e logs.

## O que foi criado

- `utils/dashboardSnapshot.ts`
  - snapshot compartilhado com dados de:
  - saúde do bot
  - estado do agente
  - trading config
  - protocol config
  - emergency stop
  - circuit breaker
  - posições
  - trades simulados
  - métricas de simulação
  - funil do agente
  - logs recentes

- `utils/telegramCopilot.ts`
  - camada que consulta o snapshot e chama o gateway LLM no modo `chatops_copilot`

## O que foi atualizado

- `utils/telegramBot.ts`
  - adicionados comandos:
  - `/dashboard`
  - `/agent`
  - `/positions`
  - `/sim`
  - `/ask <pergunta>`
  - em chat privado autorizado, texto livre também vira pergunta para o copilot

- `scripts/telegram-chatops.ts`
  - passou a usar o mesmo copilot baseado no snapshot do dashboard
  - ganhou os mesmos resumos operacionais e suporte a `/ask`

- `.env.example`
  - documentação de:
  - `TELEGRAM_CHATOPS_TOKEN`
  - `TELEGRAM_ADMIN_ID`
  - `CHATOPS_LLM_PROVIDER_ORDER`
  - `CHATOPS_GOOGLE_LLM_MODEL`

## Resultado prático

O Telegram agora consegue responder perguntas como:

- "por que não saíram trades?"
- "o agente está rate limited?"
- "quantas posições estão abertas?"
- "a simulação já está pronta para live?"
- "qual foi a última decisão do pipeline?"

Com base em dados reais locais do dashboard e do runtime.

## Validação local

- `npm run typecheck`
- `npx jest --config jest.config.js test/unit/dashboardSnapshot.test.ts`

## Observações

- O copilot continua somente leitura.
- Nenhum comando sensível de alteração operacional foi exposto pela IA.
- O deploy precisa reiniciar `bot`, `dashboard-api` e `chatops` para os novos comandos entrarem em vigor.
