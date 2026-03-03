# Skills System — Guia Completo

O sistema de Skills permite adicionar conhecimento especializado ao agente de IA de forma modular e plugável.

---

## Visão Geral

```
.agents/skills/          ← Diretório de skills
├── PumpFunScalper.md    ← Estratégia de scalping (core)
├── RiskAnalyzer.md      ← Análise de risco
├── VolumeAnalysis.md    ← Detecção de wash trading
└── WalletTracker.md     ← Análise de whales

utils/
├── skillLoader.ts       ← Descobre e parseia skills
└── skillRegistry.ts     ← Seleciona e injeta skills no prompt

tools/
└── import-skill.ts      ← CLI para importar skills do GitHub
```

---

## Comandos

```bash
# Listar skills instaladas
npm run skill:list

# Importar skill de URL direta
npm run skill:import -- --url https://raw.githubusercontent.com/user/repo/main/skill.md

# Importar de repositório GitHub
npm run skill:import -- --repo user/repo --file path/to/Skill.md

# Deletar uma skill
npm run skill:delete -- SkillName
```

---

## Criando uma Skill

Crie um arquivo `.md` em `.agents/skills/` com este formato:

```markdown
---
name: MinhaSkill
description: O que esta skill faz
version: "1.0"
tags: [trading, analysis]
author: seu-nome
priority: 10
---

# Instruções para o agente

Aqui vai o texto detalhado que será injetado no prompt do LLM.
Quanto mais específico, melhor.
```

### Campos do Frontmatter

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `name` | Sim | Identificador único da skill |
| `description` | Sim | Descrição curta para o catálogo |
| `version` | Não | Versão (default: "1.0") |
| `tags` | Não | Tags para filtragem `[tag1, tag2]` |
| `author` | Não | Autor da skill |
| `priority` | Não | Prioridade (menor = mais importante, default: 50) |

### Prioridades Recomendadas

| Prioridade | Uso |
|------------|-----|
| 1-5 | Core (estratégia principal) |
| 5-20 | Análise e segurança |
| 20-50 | Skills complementares |
| 50+ | Skills experimentais |

---

## Como Funciona

1. **Boot**: `skillLoader.ts` escaneia `.agents/skills/` e carrega metadados
2. **Análise de Token**: `agentOrchestrator.ts` chama `getActiveSkillsPrompt()`
3. **Seleção**: `skillRegistry.ts` filtra skills por tags/prioridade
4. **Injeção**: Conteúdo das skills é injetado no system prompt do LLM
5. **Hot-reload**: Novos arquivos `.md` são detectados automaticamente (5s delay)

---

## Importando do GitHub

Você pode importar skills de qualquer repositório público:

```bash
# Exemplo: importar uma skill de análise DEX
npm run skill:import -- --url https://raw.githubusercontent.com/trading-community/solana-skills/main/DexAnalyzer.md

# Ou usando repo + path
npm run skill:import -- --repo trading-community/solana-skills --file skills/DexAnalyzer.md
```

### Requisitos para skills externas:
- Deve ser um arquivo `.md` com frontmatter YAML válido
- Deve ter campo `name` no frontmatter
- O arquivo é salvo automaticamente em `.agents/skills/`

---

## Desabilitando Skills em Runtime

No código, use o `skillRegistry`:

```typescript
import { disableSkill, enableSkill } from "./utils/skillRegistry";

// Desabilitar uma skill
disableSkill("WalletTracker");

// Reabilitar
enableSkill("WalletTracker");
```

---

## Skills Built-in

| Skill | Tags | Prioridade | Função |
|-------|------|------------|--------|
| **PumpFunScalper** | trading, scalping | 1 | Estratégia de scalping agressivo |
| **RiskAnalyzer** | risk, security | 5 | Detecção de honeypots e rug pulls |
| **VolumeAnalysis** | analysis, volume | 10 | Identificação de wash trading |
| **WalletTracker** | analysis, wallets | 10 | Análise de whales e concentração |
