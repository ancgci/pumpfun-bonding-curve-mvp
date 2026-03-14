# Changelog - 13 de Março de 2026 (Sprint 12)
## Objetivo: Rollback para Estratégia Agressiva ("Modo Nuclear / Rambo")

Nesta data, realizamos uma transformação completa no core de decisão do bot para eliminar a "prudência excessiva" que o impedia de entrar em trades rápidos e voláteis da Pump.fun. O bot foi revertido de um perfil conservador (estilo Binance) para um perfil altamente agressivo ("Soldado de Infantaria").

### 1. Desativação de Filtros Restritivos (Nuclear Strike)
- **Arquivo**: `utils/agentOrchestrator.ts`
- **Mudança**: Removidos os Pre-Filters que bloqueavam tokens com baixa liquidez (< 1 SOL) ou baixo número de holders em modo ultra-agressivo.
- **Racional**: Lançamentos novos da Pump.fun naturalmente possuem métricas baixas nos primeiros segundos. Bloquear isso impedia o bot de pegar a "vibe" inicial.

### 2. Flexibilização do Motor de Risco (RiskEngine Bypass)
- **Arquivo**: `index.ts`
- **Mudança**: Adicionado bypass para bloqueios de `LP_LOCKED` e `High Risk Score`. No Modo Killer, o bot avança mesmo sem o lock da LP, parando apenas se houver detecção 100% confirmada de Honeypot.
- **Racional**: A maioria dos tokens Pump.fun não locka LP instantaneamente; esperar por isso causava perda de timing.

### 3. Redesenho da Análise Técnica (Technical Overhaul)
- **Arquivo**: `utils/technicalScore.ts`
- **Mudança**: 
    - Desativadas as `invalidations` (bloqueios absolutos) por distância de VWAP, RSI sobrecomprado ou ATR morto quando o bot está em modo agressivo.
    - O bônus de "Micro Trend / Lançamento" foi elevado de **35 para 65 pontos**.
- **Racional**: Em pumps agressivos, o preço *vai* ficar esticado e longe da VWAP. Isso não é um erro, é o momentum.

### 4. Re-Tuning das IAs (Killer Mode Prompt)
- **Arquivos**: `.agents/agents/ScalperAgent/prompt.md` e `RiskAgent/prompt.md`
- **Mudança**: Atualizados os prompts do sistema para instruir a IA a ignorar a falta de indicadores perfeitos se houver momentum forte. Alta concentração de holders (até 90%) passou a ser aceita como normal em lançamentos.

### 5. Correção de Bugs Críticos (Stabilization)
- **Duplicidade Gyser/gRPC**: Implementado o conjunto `currentlyProcessing` no `index.ts` e cheque de `getOpenTradeForToken` no orchestrator. Isso evita que o bot abra 10+ posições do mesmo token por receber atualizações rápidas demais.
- **P&L Status Sync**: Corrigido bug onde o bot marcava prejuízo como `CLOSED_TP`. Agora o monitoramento de Stop Loss foi re-ativado e há validações que garantem que o lucro só é batido se o preço for maior que a entrada.

### 6. Modernização do Dashboard (UI Premium)
- **Active Protocols em Horizontal**: Extração da lista de protocolos do grid lateral para uma barra de comando horizontal no topo da aba Overview.
- **Visual Glassmorphism**: Implementação de "chips" translúcidos com indicadores de status (pulsante verde para ON) para melhor visibilidade do feed live.
- **Funcionalidade Instantânea**: Botões funcionais que permitem alternar a origem dos tokens (PumpFun, Meteora, etc.) sem recarregar a página.

### 7. Correção de Bug de Lucro (TP Minimum Floor)
- **Problema**: O bot estava saindo de operações com ~8% de lucro porque a IA sugeria uma saída defensiva, ignorando o alvo de 30-50% do Dashboard.
- **Mudança**: Implementada uma "Trava de Piso" no `agentOrchestrator.ts`. O bot agora só aceita sugestões da IA se o lucro for **superior** ao alvo global configurado.
- **Racional**: Garantir que o usuário tenha controle total sobre a lucratividade mínima das operações.

### 8. Configuração Final de Produção (Teste)
- **Take Profit**: 30% (mínimo obrigatório).
- **Stop Loss**: Desativado (Monitoramento de timeout).
- **Timeout**: **120 minutos** (2 horas).
- **Investimento**: 0.05 SOL por operação.

---
**Data de Registro**: 13/03/2026
**Status**: Compilado e pronto para deploy histórico.
