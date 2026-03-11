# Camada de Proteção de Organicidade — Guia Completo

A Camada de Proteção de Organicidade é um sistema avançado de monitoramento estrutural e defesa projetado para identificar e bloquear tokens da PumpFun com crescimento artificial, bots desenfreados e "rug pulls" antes que o LLM analise ou que o bot execute uma compra.

O sistema opera de forma contínua em três camadas (Tempo Real, Micro-Confirmação Assíncrona e Inteligência de Risco), construídas ao longo de três Sprints de desenvolvimento.

---

## 1. Monitoramento em Tempo Real (Sprint 1)
O coração da organicidade. O bot escuta o stream gRPC e constrói janelas deslizantes (5s, 20s, 30s, 60s) e um snapshot global de 5 minutos diretamente na RAM, gastando um mínimo de processamento para cada token detectado.

- **`organicityMonitor.ts`**: Mantém as métricas e o histórico das carteiras sem poluir o BD.
- **`organicityScore.ts`**: Um motor de cálculo estatístico.
- **Filtros Iniciais**: Bloqueia imediatamente tokens movidos por menos de 3 carteiras únicas em 30s ou cujo R² (linearidade) é 1.0 absoluto (bot stairs).

---

## 2. Micro-confirmação Assíncrona e Wallets (Sprint 2)
Implementação de uma pausa calculada antes da execução para detectar fraudes de "última milha". Muitas vezes, um token fraudulento só mostra as garras no instante em que o LLM termina de responder.

- **Micro-confirmação (3-8s)** (`microConfirmation.ts`): Uma janela assíncrona que segura a compra e re-avalia o token. Ela bloqueia se a atividade do token "morrer" repentinamente, se o score orgânico despencar ou se ocorrer um pico de volume massivo do nada.
- **`BLOCK_TOP3_BUYER_CONCENTRATION`**: Barramento se os top 3 compradores dominarem o volume.
- **`BLOCK_WALLET_REPETITION_STREAK`**: Detecta e bloqueia se a mesma wallet operar ≥ 6 vezes seguidas.

---

## 3. Maturidade, Liquidez e IA (Sprint 3)
A camada final transformou os dados coletados em resiliência e inteligência pura para a tomada de decisão da IA.

### Novo Motor de Scoring (9 Eixos)
O `OrganicMarketScore` agora pondera:
1. **Trade Density** (Trades ativos)
2. **Wallet Diversity** (Contagem de carteiras únicas)
3. **Alternation Ratio** (Equilíbrio entre compras e vendas)
4. **Pullback Quality** (Recuos saudáveis vs Subidas retas)
5. **Linearity Efficiency (R²)** (Matemática de crescimento robótico)
6. **Participation Expansion** (Aceleração do engajamento)
7. **Late Entry Risk** (Penalização por entrar após grandes impulsos e dumps)
8. **Liquidity Quality** (Impacto no preço por SOL investido - liquidez grosa vs liquidez oca)
9. **Seller Behavior** (Churn rate - o quanto o mercado consegue absorver os vendedores)

### Filtros Estruturais de Mercado
Novos guards (Hard Blocks) localizados em `entryBlocker.ts`:
- **`BLOCK_HOLLOW_LIQUIDITY`**: Bloqueia se o impacto de preço for absurdo (> 1.2%/SOL). Protege contra tokens que inflam rápido mas secam no primeiro dump.
- **`BLOCK_MASS_SELLER_EXODUS`**: Detecta e aborta quando ocorre uma saída massiva de vendedores sem novas carteiras suportando o preço.

### Persistência e Resiliência
- **Disk Persistence**: O `CurveHistory` dos tokens não morre caso o bot sofra reboot. A memória das carteiras e anomalias é salva de forma assíncrona em `data/organicity-history.json` a cada 5 min.

### Skill de IA (`PumpFunOrganicityGuard.md`)
Um manual dinâmico para os LLMs da rede que ensina a correlacionar R² baixo com saúde orgânica e a detectar riscos invisíveis no volume. Quando um LLM é acionado com `tags = ["pumpfun_guard"]`, ele absorve a lógica de bloqueio institucional.

---

## Validação e Uso no Dia a Dia

### Modo Sombra (Shadow Mode)
Para observar como os bloqueios se comportam no mercado real sem impedir a sua estratégia de compra:
O modo `ORGANICITY_SHADOW_MODE=true` roda todos os cálculos e logs, alertando no terminal "TERIA SIDO BLOQUEADO POR X", mas permitindo a progressão livre para testes de calibração. 

> [!IMPORTANT]
> A Camada de Organicidade converte o bot de um simples sniper técnico em um trader institucional focado em absorção e profundidade, defendendo o capital de puxadas de tapete mascaradas que indicadores técnicos (RSI, EMAs) convencionais ignorariam.
