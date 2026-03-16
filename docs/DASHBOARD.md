# 📊 Dashboard Guide (Premium & Classic)

## Overview

O Dashboard do PumpFun Bot foi completamente modernizado para oferecer uma experiência de trading institucional. Atualmente, existem duas interfaces disponíveis:

1.  **Premium Dashboard (Default):** Focado em métricas financeiras, gráficos de alta precisão e estética glassmorphism.
2.  **Classic Dashboard:** A interface funcional em abas (Overview, Trading, Logs).

**Stack:** React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts, Socket.io-client, Lucide Icons.

---

## 🚀 Como Iniciar

### Desenvolvimento
```bash
# Na raiz do projeto
npm run start:all
```

**Acessos:** 
- **Premium:** http://localhost:5174
- **Classic:** http://localhost:5174/classic

> **Dica:** O backend API roda na porta `3001` e serve os arquivos de build do frontend em produção.

---

## 💎 Premium Dashboard (Default)

A interface padrão agora é modular e organizada em abas, permitindo controle total sem sair da estética premium.

### Estrutura de Abas:

1. **Overview (Comando Central):**
   - **Market Performance & Balance Chart:** Histórico de P&L em tempo real.
   - **Bot Health:** Status de LLM, Latência RPC e Circuit Breaker.
   - **SOL/Token Converter:** Ferramenta de cálculo para swaps de alta precisão integrada com **DexScreener API** para preços em tempo real e busca por contrato.
   - **Trade Performance Chart:** Visualização em bolhas que escalam conforme o lucro/perda (PnL).
   - **Draggable Cards:** Personalize a ordem dos widgets arrastando-os pelo ícone lateral.
   - **Quick Positions:** Visão rápida das posições abertas.

2. **Trading (Configurações Ativas):**
   - **Trading Parameters:** Ajuste de TP%, SL%, Slippage e Jito Tip.
   - **Automation Controls:** Toggles de Auto-Buy, Emergency Stop e Circuit Breaker.
   - **Active Protocols:** Ativação/Desativação de PumpFun, Meteora, etc.
   - **Detailed Asset Management:** Lista completa e detalhada de todas as posições.

3. **Logs (Terminal Vivo):**
   - **Agent Live Terminal:** Stream direto de todos os logs do bot e da IA.
   - **Full Trade History:** Histórico completo de todas as operações realizadas.

4. **AI Agent (Inteligência):**
    - **Agent Intelligence Status:** Métricas de confiança e padrões detectados pela IA em layout horizontal otimizado.

5. **Wallet (Gestão de Ativos):**
   - **Saldo Multi-Assets:** Visualização detalhada de SOL e tokens (PUMP, etc.) com conversão para USD.
   - **Depositar:** Interface com QR Code e endereço para transferências.
   - **Sacar:** Formulário para retirada de fundos com validação de endereço.
   - **Histórico de Transações:** Lista completa com filtros por tipo de operação.
   - **Configurações de Segurança:** Limites de saque e notificações.

---

## 🗂️ Classic Dashboard

Acessível via `/classic`, mantém a interface legada baseada no layout original do bot para usuários que preferem a visualização antiga.

---

## 🔌 APIs e WebSocket

O dashboard é alimentado por uma API robusta e eventos em real-time:

- **API Base:** `http://localhost:3001/api`
- **WebSocket:** `http://localhost:3001` (Eventos: `dashboardUpdate`)

| Endpoint Importante | Função |
|----------|-------|
| `/api/stats` | Métricas gerais de P&L e win rate |
| `/api/agent/stats` | Status da IA e configurações atuais |
| `/api/agent/logs` | Stream de logs para o terminal |
| `/api/trading-config` | Persistência de parâmetros de trade |

---

## 📁 Estrutura de Código

```
dashboard/src/
├── components/
│   ├── premium/      # Nova interface financeira
│   └── dashboard/    # Interface clássica (abas)
├── stores/
│   └── authStore.ts  # Gerenciamento de sessão
├── hooks/
│   └── useDashboardData.tsx # Integração de dados
└── App.tsx           # Router e Provedores
```

---

*Para detalhes técnicos da API, consulte [API.md](API.md).*
