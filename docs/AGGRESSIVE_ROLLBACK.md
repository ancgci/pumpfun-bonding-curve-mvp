# Documentação de Rollback e Otimização Agressiva (Modo Killer)
**Data: 13 de Março de 2026**

## Contexto do Rollback
Identificamos que as atualizações de segurança e organicidade introduzidas após meados de Março tornaram o bot excessivamente conservador, resultando em perda de oportunidades em tokens de alta volatilidade e momentum. Conforme solicitado, realizamos um rollback conceitual e técnico para restaurar a agilidade observada no **Commit `79efe31`** (anterior à Sprint 3).

## Alterações Implementadas

### 1. Descoberta e Monitoria (`index.ts`)
- **Ação**: Alterado `AI_DISCOVERY_MIN_PROGRESS` de 80% para **90%**.
- **Objetivo**: Focar exclusivamente em tokens no ápice do volume e próximos da migração, reduzindo o ruído de tokens novos na fila de análise.

### 2. Configuração Ultra-Agressiva (`ta-config.json`)
- **Ação**: Modificado o modo `AGGRESSIVE` com parâmetros de barreira mínima.
  - `scoreMinimo`: Reduzido de 35 para **1**.
  - `minOrganicScore`: Reduzido para **1**.
- **Objetivo**: Garantir que o Step 3 (Technical Analysis) seja puramente informativo, não bloqueando o envio do token para a decisão da LLM.

### 3. Flexibilização de Bloqueios Estáticos (`entryBlocker.ts`)
- **Ação**: Conversão de bloqueios `HARD` para `SOFT` quando o bot está em modo Ultra-Agressivo.
  - **VWAP Distance**: Não bloqueia mais compras em velas de explosão.
  - **RSI Overbought**: Permitida entrada mesmo em regime de sobrecompra extrema (>90).
  - **Linearity & Order Repetition**: Padrões de "bot staircase" ou repetição de ordens não bloqueiam mais a execução, servindo apenas como aviso para a IA.

### 4. Orquestração de Execução (`agentOrchestrator.ts`)
- **Ação**: Bypass de detours para o `DipMonitor` em modo agressivo.
  - Se a LLM decidir por **BUY**, o bot agora segue para execução imediata mesmo se o setup técnico tiver oscilado levemente durante a resposta.
  - **Price Spike Tolerance**: Aumentada de 10% para **25%** durante a janela de decisão da IA.

## Conclusão
O bot foi re-calibrado para priorizar **velocidade e frequência** em detrimento da filtragem ultra-conservadora de riscos orgânicos. A infraestrutura atual preserva a estabilidade do gRPC, mas com a "alma" agressiva das versões iniciais.

---
*Assinado: Antigravity AI Agent*
