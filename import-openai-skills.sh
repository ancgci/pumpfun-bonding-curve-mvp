#!/bin/bash
echo "🚀 Importando skills OpenAI que ainda existem (atualizado 09/mar/2026)..."

declare -A skills=(
  ["skill-creator"]="https://raw.githubusercontent.com/openai/skills/main/skills/.system/skill-creator/SKILL.md"
  ["skill-installer"]="https://raw.githubusercontent.com/openai/skills/main/skills/.system/skill-installer/SKILL.md"
  ["playwright-interactive"]="https://raw.githubusercontent.com/openai/skills/main/skills/.curated/playwright-interactive/SKILL.md"
  ["jupyter-notebook"]="https://raw.githubusercontent.com/openai/skills/main/skills/.curated/jupyter-notebook/SKILL.md"
  ["spreadsheet"]="https://raw.githubusercontent.com/openai/skills/main/skills/.curated/spreadsheet/SKILL.md"
  ["openai-docs"]="https://raw.githubusercontent.com/openai/skills/main/skills/.curated/openai-docs/SKILL.md"
  ["notion-research-documentation"]="https://raw.githubusercontent.com/openai/skills/main/skills/.curated/notion-research-documentation/SKILL.md"
)

SUCCESS=0
FAIL=0

for name in "${!skills[@]}"; do
  url="${skills[$name]}"
  echo "📥 $name → $url"
  npm run skill:import -- --url "$url"
  if [ $? -eq 0 ]; then
    echo "✅ Importada!"
    ((SUCCESS++))
  else
    echo "⚠️ Falhou (404 ou erro)"
    ((FAIL++))
  fi
  echo "----------------------------------------"
done

echo "Resumo: $SUCCESS sucessos / $FAIL falhas"
echo "Dica: Rode 'npm run skill:list' para ver as novas."
