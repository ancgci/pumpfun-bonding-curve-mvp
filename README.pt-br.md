# 🤖 Bot de Trading PumpFun

Bot de trading automatizado para Solana com suporte a múltiplos protocolos DeFi.

> [!WARNING]
> ## ⚠️ Isenção de Responsabilidade Financeira e Termos de Uso
> 
> Este software destina-se apenas a fins educacionais, experimentais e de uso pessoal. A negociação de criptomoedas (especialmente tokens DeFi, pares de baixa liquidez e memecoins) envolve **risco financeiro extremo** e pode resultar na **perda total dos seus fundos**.
> - **Sem Aconselhamento Financeiro:** Os autores, colaboradores e mantenedores deste projeto não fornecem conselhos de investimento ou recomendações financeiras.
> - **Sem Garantias:** Não há absolutamente nenhuma garantia de retorno financeiro, lucratividade, estabilidade do sistema, tempo de atividade ou exatidão.
> - **Uso por sua Conta e Risco:** Você é o único responsável por configurar o bot, gerenciar suas chaves privadas e financiar sua carteira. Os desenvolvedores não se responsabilizam por quaisquer perdas, falhas de sistema, falhas de rede ou perda de capital.
> - **Sem Garantias de Software:** Este software é fornecido "no estado em que se encontra" (AS-IS) e "conforme disponível", sem qualquer tipo de garantia expressa ou implícita.

🇧🇷 **Esta é a versão em português.** Para a versão em inglês, acesse o [README.md](README.md).

---

## 📚 Documentação

Toda a documentação do projeto está localizada na pasta `/docs`:

- **[README](docs/README.md)** - Visão geral e início rápido (em inglês)
- **[ARCHITECTURE](docs/ARCHITECTURE.md)** - Arquitetura técnica do sistema
- **[USAGE](docs/USAGE.md)** - Guia completo de uso
- **[CONFIGURATION](docs/CONFIGURATION.md)** - Referência de variáveis de ambiente
- **[RISK_ENGINE](docs/RISK_ENGINE.md)** - Filtros anti-rug, pontuação de risco e calibração
- **[DIP_SNIPER](docs/DIP_SNIPER.md)** - Lógica técnica para cruzamentos de RSI e EMA Sniper
- **[DEVELOPMENT_PROTOCOL](docs/DEVELOPMENT_PROTOCOL.md)** - Etapas obrigatórias para manutenção do bot
- **[AI_AGENT](docs/AI_AGENT.md)** - Arquitetura do agente de IA, ciclo de aprendizado e trading de precisão
- **[🤖 AI_AGENTS_ARCHITECTURE](docs/AI_AGENTS_ARCHITECTURE.md)** - Entenda o pipeline de 8 etapas dos agentes
- **[🧠 MULTI_AGENT](docs/MULTI_AGENT_ORCHESTRATION.md)** - Orquestração de múltiplos agentes e consenso
- **[🛡️ SECURITY_HARDENING](docs/SECURITY_HARDENING.md)** - Protocolo avançado de proteção Nível 3
- **[📚 VPS_DEPLOYMENT](docs/VPS_DEPLOYMENT.md)** - Guia de instalação e acesso à VPS
- **[📉 AVALIACAO_BANDA_CONTABO](docs/AVALIACAO_BANDA_CONTABO_2026-03-20.md)** - Diagnóstico de throttle de banda (local vs VPS)
- **[🧯 MITIGACAO_BANDA](docs/MITIGACAO_BANDA_E_MONITORAMENTO_2026-03-20.md)** - Ajustes feitos no bot e VPS após o alerta de banda
- **[🎯 GOVERNANCA_ADAPTATIVA_ENTRADA](docs/GOVERNANCA_ADAPTATIVA_ENTRADA_2026-03-20.md)** - Ajuste local do funil de BUY, sizing adaptativo e recheck
- **[⚡ FAST_LANE_E_PREFLIGHT](docs/FAST_LANE_E_EXECUTION_PREFLIGHT_2026-03-23.md)** - Camada determinística inspirada em go-trader e Hummingbot para filtrar setups ruins e evitar superexposição
- **[🧠 AI_SDK_GOOGLE_INTEGRATION](docs/AI_SDK_GOOGLE_INTEGRATION_2026-03-20.md)** - Gateway LLM unificado, structured output, fallback e tool calling
- **[🔌 LLM_CONNECTIVITY_FIX](docs/LLM_CONNECTIVITY_FIX_2026-03-23.md)** - Correção local de conectividade NVIDIA/Gemini e validação de fallback
- **[SKILLS](docs/SKILLS.md)** - Sistema de habilidades modulares (Skills)
- **[API](docs/API.md)** - Documentação da API do painel
- **[DASHBOARD](docs/DASHBOARD.md)** - Guia do Dashboard V2 (React)
- **[LOSS_POSTMORTEM_AGENT](docs/LOSS_POSTMORTEM_AGENT.md)** - Fluxo de autópsia, fila de pós-mortem e aprendizado operacional
- **[SCALPER_STRATEGY](docs/SCALPER_STRATEGY_OPTIMIZATION.md)** - Guia de estratégias de scalping baseado em análise técnica
- **[QA](docs/QA.md)** - Infraestrutura de testes do QAgent
- **[ORGANICITY](docs/ORGANICITY_PROTECTION.md)** - Detecção de manipulação de volume de trading (anti-wash)
- **[📊 P&L_HISTORY](docs/PNL_HISTORY.md)** - Documentação do SQLite P&L
- **[CHANGELOG](docs/CHANGELOG.md)** - Histórico de melhorias

---

## 💾 Recuperação de Desastres (Disaster Recovery)

Este repositório suporta uma estratégia de backup em duas camadas:

- Backup local completo da VPS em `backups/vps-runtime/`
- Snapshot seguro para GitHub do estado de runtime em `recovery/github-state/latest/`
- Bancos de dados brutos são bloqueados no commit; mantemos apenas os artefatos comprimidos de recuperação no Git.

Consulte o guia **[DISASTER_RECOVERY](docs/DISASTER_RECOVERY.md)** para entender o fluxo de backup e restauração.

---

## ✅ Notas Atuais de Negociação

- `BUY_AMOUNT_SOL` define o valor de entrada nominal por trade.
- O custo do ATA (Associated Token Account) não está embutido no valor da entrada; ele é tratado separadamente pela estratégia de saída.
- A recuperação do aluguel do ATA (ATA Rent) está ativa via `ENABLE_ATA_EXIT_STRATEGY=true`.
- Referência atual de custo do ATA: `ATA_RENT_SOL=0.00203928`.
- O mecanismo de preflight exige um saldo adicional (buffer) em SOL na carteira antes de liberar a entrada em modo `LIVE`.
- Para um trade de `0.005 SOL`, a carteira precisa ter saldo acima de `0.020 SOL` para passar no preflight (`0.005` da entrada + `0.015` de buffer).

---

## ⚙️ Perfil VPS Recomendado

Recomendação de perfil de baixo consumo de banda para produção:

- `MONITORING_PROTOCOL=PUMPFUN`
- `METEORA_DBC_MONITORING_ENABLED=false`
- `BONK_FUN_MONITORING_ENABLED=false`
- `DAOS_FUN_MONITORING_ENABLED=false`
- `MOONSHOT_MONITORING_ENABLED=false`
- `ANONCOIN_MONITORING_ENABLED=false`
- `VERBOSE_TRANSACTION_LOGS=false`
- `AGENT_MODE=SIMULATION` por padrão na VPS (modo `LIVE` fica disponível quando você ativa explicitamente para operar em mainnet).
- Governança adaptativa de entradas implementada no código local (`FULL`, `REDUCED`, `PROBE`, e `RECHECK`).
- Fast lane determinístico, governador de portfólio e preflight de execução integrados para reduzir entradas ruins.
- Gateway LLM unificado local com suporte a `legacy -> google`, saídas estruturadas e chamada de ferramentas (tool calling).
- Provedor primário compatível com NVIDIA configurado localmente via `LLM_MODEL=z-ai/glm5` e `LEGACY_LLM_API_URL` explícito.
- Fallback do Google (Gemini) validado localmente para fluxos de saída estruturada e chamadas de ferramentas.
- `vnstat` instalado no VPS com limite de alertas no Telegram configurado para `5 GiB/dia`.
- `tools/vnstat_daily_alert.py` configurado via `cron` para rodar a cada 15 minutos na VPS.

---

## 🚀 Início Rápido

### Opção 1: Inicializar Tudo Junto (Recomendado)

```bash
# 1. Instalar as dependências
npm install

# 2. Configurar o arquivo .env
cp .env.example .env
# Edite o arquivo .env com suas chaves e credenciais

# Configurações padrão de baixo consumo de banda recomendadas para VPS
MONITORING_PROTOCOL=PUMPFUN
VERBOSE_TRANSACTION_LOGS=false
METEORA_DBC_MONITORING_ENABLED=false
BONK_FUN_MONITORING_ENABLED=false
DAOS_FUN_MONITORING_ENABLED=false
MOONSHOT_MONITORING_ENABLED=false
BANDWIDTH_ALERT_THRESHOLD_GIB=5
BANDWIDTH_ALERT_IFACE=eth0
LLM_PROVIDER_ORDER=legacy,google
LLM_MODEL=z-ai/glm5
LEGACY_LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
GOOGLE_LLM_MODEL=gemini-2.5-flash
FAST_LANE_ENABLED=true
PORTFOLIO_GOVERNOR_ENABLED=true
EXECUTION_PREFLIGHT_ENABLED=true
ENABLE_ATA_EXIT_STRATEGY=true
ATA_RENT_SOL=0.00203928

# 3. Iniciar o bot + painel de monitoramento simultaneamente
npm run start:all
```

**Resultado:** O bot e o painel iniciam juntos.
- Painel React Dashboard V2: http://localhost:5174 (rode `cd dashboard && npm run dev`)
- API do Dashboard e interface clássica: http://localhost:3001

---

### Opção 2: Inicializar Separadamente

**Bot:**
```bash
npm start
```

**API do Dashboard (em outro terminal):**
```bash
npm run start:dashboard-api
```

Para reiniciar sob PM2 atualizando as variáveis de ambiente:
```bash
pm2 restart bot --update-env
pm2 restart dashboard-api --update-env
pm2 save
```

---

### Fluxo de Trading em Produção (Live Trading)

1. Deposite SOL na carteira do bot configurada no `.env` (ou gerada em `bot-wallet.json`).
2. Confirme no dashboard qual chave pública de carteira está marcada como ativa.
3. Ajuste `BUY_AMOUNT_SOL` no painel ou no `.env` para o tamanho de posição desejado.
4. Mude o modo do agente para `LIVE` nas configurações do dashboard.
5. Valide se há saldo suficiente para o valor do trade + taxas + buffer operacional de segurança.

---

## 🛡️ Controle de Qualidade e QA

Este projeto impõe padrões de qualidade estritos através de automação de testes.

### Hook Obrigatório Pré-commit (Husky)
Usamos **Husky** e **lint-staged** para certificar que todos os testes passem antes de qualquer commit ser aceito.

Ao executar `git commit`, a suíte de testes é executada:
```bash
npm run test:qa
```
Esse comando executa:
1. **Testes Unitários Core:** Validação de lógicas de trading, controle de risco e P&L.
2. **Testes de Integração:** Validação da API do Dashboard.
3. **Testes E2E de Frontend:** Testes de interface usando Playwright.

**Se algum teste falhar, o commit será bloqueado.** Você precisa corrigir as falhas antes de enviar o código.

### Comandos Manuais de QA
Você pode rodar os testes a qualquer momento usando:
```bash
# Rodar todos os testes de controle de qualidade (QA)
npm run test:qa

# Rodar apenas testes de lógica do bot (core)
npm run test:core

# Rodar testes smoke (conectividade e disjuntor)
npm run test:smoke

# Rodar simulação completa do ciclo de aprendizado do Agente de IA
npm run test:ai-agent:full
```

---

## 🔬 Recursos Adicionais

### 🧪 QAgent (QA Senior)
| Recurso | Descrição |
|---------|-------------|
| **4 Suítes de Teste** | Unitário (Jest), API (Supertest), E2E (Playwright) e Regressão (Playwright). |
| **Scripts npm** | `qa:unit`, `qa:api`, `qa:e2e`, `qa:regression`, `qa:full`. |
| **Auto Regressão** | Suite que valida o layout, interações, integridade da API e garante erros zero. |
| **Relatórios Visuais** | Gera relatórios em formato HTML em `playwright-report/` para fácil inspeção de erros de UI. |

---

### 🎯 Dip Sniper e Validação Pré-Execução
| Recurso | Descrição |
|---------|-------------|
| **Pre-Execution Guard** | Previne a compra de tokens no "topo" avaliando dados de preço instantâneos para mitigar problemas com latência de IA. |
| **Dip Waitlist** | Coloca tokens promissores que valorizaram rápido demais em uma fila de espera para compra nos recuos. |
| **Oversold Sniper** | Monitora (2s) e atira na compra rápida quando o **RSI (< 45) cruza com o preço acima da EMA-9**, confirmando reversão de tendência. |

*Para mais detalhes:* Veja a documentação técnica em [docs/DIP_SNIPER.md](docs/DIP_SNIPER.md).

---

### 🛠️ Protocolo de Desenvolvimento (SOP)
| Regra | Ação Obrigatória |
|-------|------------------|
| **Documentação** | Qualquer nova funcionalidade desenvolvida exige atualização imediata no `/docs` e no `README.md`. |
| **Memória do Agente** | Regras aprendidas e decisões heurísticas devem ser injetadas e persistidas em `data/agent/patterns.json`. |
| **Workflow** | Consulte `.agent/workflows/standard_procedure.md` para procedimentos padrão de desenvolvimento. |

---

### 🗺️ Mapa de Diretórios dos Agentes
| Diretório | Papel real hoje |
|-----------|-----------------|
| `.agents/` | Código, prompts e orquestração do sistema multi-agente. |
| `data/agent/` | Estado real persistido do runtime (configurações, status, regras aprendidas, checkpoints). |
| `.agents/shared-memory/` | Legado. Preservado apenas para histórico de desenvolvimento (não utilizado no runtime atual). |
| `.agent/` | Ferramental de engenharia local e ambiente de desenvolvimento (ECC). Não afeta o bot em execução. |

---

### 🚀 Descoberta Híbrida e Fila de Estabilização (Correção de Estagnação)
Corrige o comportamento onde o robô parava de executar transações devido a limites de alerta excessivamente altos e falta de dados em novos tokens.

- **Early AI Discovery:** Desacoplamento da IA (analisa a partir de **15%** de progresso da curva de vinculação) do alerta visual do Telegram (90%), agilizando a tomada de decisões.
- **Immediate-Buy Queue:** Tokens excepcionais que acabaram de lançar são inseridos no `DipMonitor` com flag de compra imediata, contornando o atraso de RSI.
- **Data Threshold (15s):** Tempo reduzido para 15 segundos antes de iniciar a análise técnica em novos tokens, permitindo capturar velas gigantes de início de mercado.

---

## 🔵 Alterações Anteriores (16 de Março de 2026)

### 💎 Painel Premium & Carteira Integrada
Interface de alto desempenho focada em métricas financeiras completas e gerenciamento nativo de ativos.

*   **Carteira Cripto:** Interface para gestão de SOL/Tokens diretamente do dashboard: Saldo em tempo real, Depósitos (QR), Saques e Histórico.
*   **DexScreener API:** O conversor de preço e pesquisa por contrato (Mint) agora utiliza a API oficial da DexScreener.
*   **Trade Performance:** Gráficos interativos aprimorados com bolhas escalonadas baseadas em P&L e legendas informativas.
*   **Layout Responsivo:** Ajustes nos widgets horizontais de "Agent Status" para não distorcer em resoluções variadas.
*   **Terminal de Logs Integrado:** Terminal que transmite os logs locais em tempo real direto para o painel sob a aba "Logs".

---

## 🔵 Alterações Anteriores (14 de Abril de 2026)

### 🧾 Saída de Posição Baseada em ATA & Resumos de Pós-Mortem
*   **ATA Exit Recovery:** A saída de posição agora executa queima de saldo residual seguida do encerramento da conta de token (close account) para recuperar o valor de aluguel (rent), quando lucrativo.
*   **Post-Mortem Summary API:** Endpoint `GET /api/agent/postmortem-summary` consolida estatísticas e causas primárias de falhas de trades recentes.
*   **Insights no Painel:** O dashboard agora exibe um card dedicado com causas dominantes e status da fila do pós-mortem.

---

## 🔵 Alterações Anteriores (8 de Março de 2026)

### 🤖 Arquitetura Multi-Agente & UX Real-Time
*   **Multi-Agent PRO:** Transição para uma equipe de especialistas (Scalper, Risk, Sentiment, Whale) rodando de forma assíncrona.
*   **Socket.io Integration:** Atualização do painel em tempo real via websockets para exibir dados de trades e P&L sem lag de pooling.
*   **Scalper Especializado:** Especialista de HFT operando em janelas de 5 segundos.

---

## 🔵 Alterações Anteriores (5 de Março de 2026)

### 🔗 Redundância de Conexão RPC & Inteligência Social
*   **Multi-Source Sentiment:** Análise de redes sociais acoplada ao Sentinel, HuggingFace e SenseAI para medir hype.
*   **RPC Pool Pro:** Rotatividade dinâmica inteligente entre 10+ provedores RPC com failover imediato de latência.
*   **WS Redundancy:** WebSockets redundantes atuando como fallback de gRPC.

---

## 🔵 Alterações Anteriores (2 de Março de 2026)

### 🧠 Autonomia da IA & Reflexão Interna (Self-Reflection)
*   **TP/SL Dinâmico:** O LLM passa a sugerir limites de perdas e lucros baseado em volatilidade.
*   **LearnerAgent:** Sistema de auto-reflexão de derrotas. O robô analisa trades perdedores e extrai regras corretivas salvando-as em `data/agent/patterns.json`.
*   **Injeção de Regras Aprendidas:** Regras geradas pelo aprendizado são anexadas dinamicamente ao prompt da IA para evitar erros repetidos.

---

## ✨ Funcionalidades Principais (Features)

*   **Agente de IA Integrado:** Decisões com base em inteligência artificial inteligente (Gemini, OpenAI, Anthropic, Qwen).
*   **Self-Reflection Loop:** O robô aprende com seus erros gerando regras de filtro preventivas.
*   **Roteamento Inteligente RPC:** Pool com failover automático contendo mais de 10 endpoints RPC.
*   **Disjuntor de Emergência:** Alertas configuráveis no Telegram e interrupção do bot no painel.
*   **Interface Premium:** Design dark premium (Glassmorphic) com logs e gráficos P&L em tempo real.
*   **Dip Sniper Avançado:** Compra oportuna com base em cruzamentos técnicos (RSI + EMA).
*   **Estratégia de Recuperação de ATA:** Recupera o aluguel de SOL das contas de tokens encerradas.
