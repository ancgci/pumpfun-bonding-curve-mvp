# Integração AI SDK Google - 2026-03-20

## Status

Implementação concluída **somente no ambiente local**.

- nenhum deploy foi feito para a VPS nesta etapa;
- o objetivo foi preparar a camada de LLM para uso com `ai` + `@ai-sdk/google` sem perder o fallback legado já existente.

---

## Objetivo

Aplicar o melhor uso prático de `ai` + `@ai-sdk/google` em quatro frentes:

1. padronizar a camada de LLM;
2. forçar saída estruturada;
3. manter fallback entre providers;
4. habilitar tool calling onde isso traz contexto útil ao agente.

---

## O que foi implementado

### 1. Gateway unificado de LLM

Novo arquivo:

- `utils/llmGateway.ts`

Responsabilidades:

- centraliza chamadas de LLM para `agent`, `learner` e `postmortem`;
- resolve ordem de providers por tarefa;
- usa `legacy,google` por padrão no perfil local atual;
- registra tentativas, provider final, modelo e tools usadas;
- normaliza o retorno para um formato único por tarefa.

---

### 2. Structured output

O gateway passou a trabalhar com respostas estruturadas por schema.

Aplicações:

- `utils/agentOrchestrator.ts`
  - decisão de entrada (`action`, `confidence`, `reason`, `takeProfitPercent`, `stopLossPercent`);
- `utils/learnerAgent.ts`
  - `insights` e `learnedRules`;
- `utils/postMortemAgent.ts`
  - `summary`, `findings`, `recommendations`, `candidateRules`, `betterEntry`, `llmInsights`.

No caminho Google, isso usa:

- `generateText()`
- `Output.object(...)`

No caminho legado, a resposta JSON continua sendo parseada da API compatível com Chat Completions e normalizada para o mesmo formato.

---

### 3. Fallback de provider

Fluxo padrão:

1. tenta o provider legado primeiro;
2. se faltar chave, falhar modelo ou houver erro do provider, tenta Google (`@ai-sdk/google`);
3. se nenhum provider responder corretamente, a exceção sobe com o resumo das tentativas.

Variáveis adicionadas ao `.env` de exemplo:

- `LLM_PROVIDER_ORDER`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `GOOGLE_LLM_MODEL`
- `AGENT_GOOGLE_LLM_MODEL`
- `LEARNER_LLM_PROVIDER_ORDER`
- `LEARNER_GOOGLE_LLM_MODEL`
- `POSTMORTEM_LLM_PROVIDER_ORDER`
- `POSTMORTEM_GOOGLE_LLM_MODEL`

O provider legado continua usando:

- `LLM_MODEL`
- `NV_LLM_API_KEY`
- `POSTMORTEM_LLM_API_URL`
- `POSTMORTEM_LLM_MODEL`
- `POSTMORTEM_LLM_API_KEY`

### Configuração local aplicada

No ambiente local, a decisão final ficou:

- `LLM_PROVIDER_ORDER=legacy,google`
- `LEARNER_LLM_PROVIDER_ORDER=legacy,google`
- `POSTMORTEM_LLM_PROVIDER_ORDER=legacy,google`
- `GOOGLE_LLM_MODEL=gemini-2.5-flash`
- `GOOGLE_GENERATIVE_AI_API_KEY=` vazio por enquanto

Isso mantém o provider NVIDIA-compatible como cérebro principal e deixa Gemini apenas como fallback opcional.

---

### 4. Tool calling

Tool calling foi ligado no caminho Google para reduzir acoplamento de contexto ao prompt e expor dados internos de forma reutilizável.

#### Agente principal

Tools adicionadas em `utils/agentOrchestrator.ts`:

- `getTechnicalContext`
- `getRiskContext`
- `getLearnedRulesContext`
- `getExecutionPolicy`
- `getOrganicityContext`

Uso esperado:

- borderline setups;
- validação de confiança alta com dado técnico fraco;
- consulta de regras aprendidas sem inflar o prompt fixo.

#### LearnerAgent

Tools:

- `getLossBatch`
- `getExistingRules`

Uso esperado:

- consultar o batch bruto de losses;
- evitar repetir ou contradizer regras já persistidas.

#### PostMortemAgent

Tools:

- `getDeterministicAutopsy`
- `getTradeEvidence`

Uso esperado:

- separar claramente a autópsia determinística do refinamento LLM;
- permitir que o modelo consulte snapshots e trace somente quando necessário.

---

## Arquivos alterados

### Código

- `utils/llmGateway.ts`
- `utils/agentOrchestrator.ts`
- `utils/learnerAgent.ts`
- `utils/postMortemAgent.ts`

### Configuração e documentação

- `.env.example`
- `README.md`
- `docs/README.md`
- `docs/CONFIGURATION.md`
- `docs/AI_AGENT.md`
- `docs/CHANGELOG.md`

---

## Comportamento esperado

### Sem chave Google

- o projeto continua funcionando com o provider legado;
- os testes atuais continuam válidos;
- o fallback permanece compatível com os mocks existentes de `axios`.

### Com chave Google

- o gateway continua tentando `legacy` primeiro;
- se o provider legado falhar, o gateway pode usar `generateText()` com schema estruturado;
- os agentes podem chamar tools internas;
- logs passam a exibir provider, modelo, quantidade de steps e tools chamadas.

Exemplo de log:

```text
[Agent] LLM provider=google model=gemini-2.5-flash tools=getTechnicalContext,getRiskContext steps=2
```

---

## Validação local

Executado com sucesso:

```bash
npx tsc --noEmit
npx jest --config jest.config.js test/ai-agent/advanced/full-learning-cycle.test.ts --runInBand
```

Observação:

- o Jest reportou `open handles` ao final, mas a suíte passou; isso já existia no fluxo de monitoramento assíncrono e não bloqueou a validação funcional desta integração.

---

## Próximo passo recomendado

Antes de qualquer deploy:

1. revisar o diff local;
2. decidir se a VPS seguirá `legacy,google` ou terá exceções por agente;
3. preencher `GOOGLE_GENERATIVE_AI_API_KEY` se o fallback Gemini for desejado em produção;
4. só então versionar e promover para a VPS.
