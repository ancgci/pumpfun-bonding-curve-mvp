# Correção de Conectividade LLM - 2026-03-23

## Status

Aplicado **somente no ambiente local**.

- nenhum deploy foi feito para a VPS nesta etapa;
- a meta foi corrigir a conectividade do provider primário NVIDIA-compatible e ativar o fallback real do Google;
- as chaves reais foram mantidas apenas no `.env` local privado.

---

## Problema observado

Após o último deploy na VPS, o bot continuava ativo, mas deixava de entrar em trades.

O fluxo observado era:

1. `Discovery` aprovado
2. `RiskEngine` aprovado
3. `Technical Analysis` com `Score: 0`
4. `Killer Mode` liberando o token para a LLM
5. `Agent-Orchestrated` retornando `SKIP` com `Reasoning: Request failed with status code 404`

Conclusão da avaliação:

- o bloqueio real não estava no `Pipeline 3/8`;
- o bloqueio estava na chamada da LLM primária.

---

## Causa técnica local reproduzida

O modelo configurado localmente e na VPS estava como:

```env
LLM_MODEL=z-ai/glm-5
```

O teste direto ao endpoint NVIDIA-compatible confirmou:

- `z-ai/glm-5` -> `HTTP 404`
- `z-ai/glm5` -> `HTTP 200`

Logo, havia incompatibilidade entre o identificador do modelo e o endpoint legado usado pelo gateway.

---

## O que foi ajustado localmente

### 1. Provider primário NVIDIA-compatible

No `.env` local:

```env
LLM_PROVIDER_ORDER=legacy,google
LLM_MODEL=z-ai/glm5
LEGACY_LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
```

No gateway:

- adicionado suporte a `LEGACY_LLM_API_URL`;
- adicionada normalização defensiva de alias:
  - `z-ai/glm-5` -> `z-ai/glm5`

Isso reduz a chance de repetir a regressão de `404` por nome incorreto do modelo.

### 2. Provider secundário Google

No `.env` local:

```env
GOOGLE_LLM_MODEL=gemini-2.5-flash
GOOGLE_GENERATIVE_AI_API_KEY=<local-only>
```

No gateway:

- com tools: Google usa `generateText()` e o gateway faz parse do JSON retornado;
- sem tools: Google usa `generateObject()`;
- se o provider não devolver objeto limpo sem tools, o gateway cai para parse textual como fallback local.

Esse ajuste foi necessário porque o Gemini não aceita `tool calling` combinado com `response mime type application/json`.

---

## Validação local executada

### NVIDIA primária

Validado com sucesso:

- chamada HTTP compatível ao endpoint legado;
- chamada real pelo `utils/llmGateway.ts`.

### Google secundária

Validado com sucesso:

- structured output sem tools;
- tool calling com resposta estruturada;
- fallback `legacy -> google` quando o legado falha propositalmente.

### Tipagem

Validado com:

```bash
npx tsc --noEmit
```

---

## Estado local após a correção

- primário: NVIDIA-compatible (`legacy`)
- modelo primário: `z-ai/glm5`
- URL primária: `https://integrate.api.nvidia.com/v1/chat/completions`
- secundário: Google (`gemini-2.5-flash`)
- ordem: `legacy,google`
- fallback real: validado localmente

---

## Observação operacional

Essa correção ainda **não está na VPS**.

Antes do próximo deploy, o runtime de produção deve receber os mesmos valores de `.env` e o restart deve ser feito com atualização de ambiente.
