# 🧪 Real-Time Token Simulation

## Visão Geral

O bot agora opera em dois modos:

```
┌─────────────────────────────────────────────────────────┐
│ Real-Time Token Monitor (Yellowstone gRPC)              │
│ Detecta NOVOS tokens sendo mintados/launched           │
└────────────────┬────────────────────────────────────────┘
                 │
         ┌───────┴───────────────────────┐
         │                               │
    ✅ SIMULATION MODE              💰 LIVE MODE
    ├─ Sem risco real             ├─ Risco = dinheiro real
    ├─ Registra trades            ├─ Executa transações
    ├─ Aprende com resultados     ├─ Atualiza posições
    ├─ Dashboard mostra progresso  ├─ Mesmos lucros/perdas
    └─ Valida estratégia          └─ Requer teste antes
```

## Como Funciona a Simulação Integrada

### 1️⃣ Monitor detecta novo token
- Bot está rodando em **Produção** na rede Solana
- Detecta tokens **reais** sendo lançados (PumpFun, Meteora, etc)
- Extrai métricas **reais**: preço, liquidez, holders, volume

### 2️⃣ Análise de Risco
```
Token PUMP (Real)
├─ Preço: $0.00000456 (REAL)
├─ Holders: 234 (REAL)  
├─ Volume 1h: $12,450 (REAL)
├─ Honeypot: Não detectado (testado com Jupiter)
└─ ✅ Passa nos filtros
```

### 3️⃣ Consultação do Agente IA
```
LLM Analysis:
├─ Baseado em dados REAIS do token
├─ Análise de padrões históricos
├─ Score de confiança: 82.5%
└─ Decisão: BUY
```

### 4️⃣ Entrada do Trade (Simulada OU Real)

#### se `AGENT_MODE=SIMULATION`:
```
🧪 SIMULATION
├─ Registra BUY: PUMP @ $0.00000456
├─ Confidence: 82.5%
├─ Sem transação real
└─ Dashboard atualiza: "1 trade open"
```

#### se `AGENT_MODE=LIVE`:
```
💰 LIVE
├─ Executa REAL transaction
├─ Transferência de SOL para conta de token
├─ Inscreve posição em positions.json
└─ Notificação Telegram: "Compra realizada!"
```

### 5️⃣ Monitoramento em Tempo Real (Ambos os Modos)

```
DexScreener API (Real Prices)
    │
    ├─ Preço sobe 50% → CLOSE TP
    ├─ Preço cai 25% → CLOSE SL  
    └─ 1 hora passou → CLOSE TIMEOUT
```

#### Exemplo em SIMULATION:
```
Token PUMP @ entry $0.00000456:
  10:05 → $0.00000500 (preço sobe)
  10:10 → $0.00000678 (ainda subindo)
  10:15 → $0.00000912 (atingiu +100%, hits TP de 50%)
  
✅ SIMULATION: Trade fechado
   Resultado: +0.0234 SOL (45.2%)
   Salvo em: data/simulation/trades.json
   Dashboard: Atualiza win rate
```

#### Exemplo em LIVE:
```
Token PUMP @ entry $0.00000456:
  10:05 → Executa VENDA real quando hit 50%
  10:05 → ✅ Venda executada no blockchain
  10:05 → 💰 +0.0234 SOL adicionado ao wallet
  10:05 → Notificação Telegram: "+0.0234 SOL"
```

## Configuração

```env
# Modo: SIMULATION (seguro, aprende) ou LIVE (risco real)
AGENT_MODE=SIMULATION

# Ativar agente IA
AGENT_ENABLED=true

# Sistema de aprendizado
AGENT_LEARNING_ENABLED=true
LEARNING_OPTIMIZE_INTERVAL=50      # Otimiza a cada 50 trades

# Limites de confiança
AGENT_MIN_CONFIDENCE=70              # Só BUY se > 70%
AGENT_MAX_CONFIDENCE=95              # Máximo 95% confiança

# Trading parameters
TAKE_PROFIT_PERCENT=50              # Fecha com +50%
STOP_LOSS_PERCENT=25                # Fecha com -25%
BUY_AMOUNT_SOL=0.05                 # Investe 0.05 SOL

# Upgrade automático para LIVE
AGENT_AUTO_UPGRADE_TO_LIVE=false    # Muda para LIVE automaticamente quando pronto
```

## Fluxo Completo com Tokens Reais

```
TIME    EVENT
────────────────────────────────────────────────────────────
09:00   Bot inicia em SIMULATION mode
        ├─ Monitor conecta ao gRPC Yellowstone
        └─ Aguarda novos tokens

09:15   ✨ Novo token lançado: PUMP
        ├─ Preço: $0.00000456
        ├─ Holders: 234
        ├─ Risk score: 45/100 (baixo risco)
        └─ ✅ Passa no risk engine

09:15   🤖 Agente consulta LLM
        ├─ Analisa token PUMP (REAL)
        ├─ Compara com padrões históricos
        ├─ Score confiança: 82.5%
        └─ Decision: BUY ✅

09:15   📊 SIMULATION MODE executa
        ├─ Registra trade: PUMP @ $0.00000456
        ├─ Confidence: 82.5%
        ├─ Status: OPEN
        └─ Data: data/simulation/trades.json

09:15   📈 Monitoramento começa
        └─ Checando preço a cada 10 segundos

09:24   📊 Preço sobe 100% → $0.00000912
        ├─ Trigger: Take Profit (50%) atingido
        ├─ Trade fechado: CLOSED_TP
        ├─ Resultado: +0.0234 SOL
        └─ Dashboard: Win #1

09:24   🎯 Aprendizado registra
        ├─ Token PUMP foi lucrativo
        ├─ Entry pattern: "Token with 200+holders, 1h volume"
        ├─ Confidence foi correta (82.5%)
        └─ Sistema refina scoring

10:30   ✨ Novo token lançado: BONK
        ├─ (Similar process)
        ├─ LLM confidence: 65.2%
        └─ Decision: BUY (acima do threshold 70%? SIM!)

10:30   📊 SIMULATION: Entrada BONK

10:45   📉 Preço cai 25% → STOP LOSS
        ├─ Trade fechado: CLOSED_SL
        ├─ Resultado: -0.0125 SOL
        └─ Dashboard: Loss #1

18:00   📊 Dashboard atualizado
        ├─ Trades: 34 closed
        ├─ Wins: 21 (61.8%)
        ├─ Losses: 13 (38.2%)
        ├─ Total P&L: +2.345 SOL
        ├─ Sharpe Ratio: 1.45
        └─ Readiness: 65/100

18:00   🧠 Learning optimization
        ├─ 34 trades analisados
        ├─ Patterns identificados:
        │  ├─ "Early pump detection" (78% accuracy)
        │  ├─ "Volume cluster entry" (71% accuracy)
        │  └─ "Momentum reversal" (65% accuracy)
        └─ Strategy refined

23:59   📊 Métricas finais do dia
        ├─ Total: 45 trades
        ├─ Win rate: 58.2%
        ├─ Total P&L: +3.245 SOL
        ├─ Sharpe Ratio: 1.52
        └─ Readiness: 90/100 ✅ (quase pronto!)
```

## Transition para LIVE

Quando simulação atingir readiness 100/100:

```bash
# Opção 1: Automática (se AGENT_AUTO_UPGRADE_TO_LIVE=true)
Os mesmos tokens que foram testados
passam a ser operados com REAL money

# Opção 2: Manual
# Editar data/agent/config.json:
{
  "enabled": true,
  "mode": "LIVE",        # ← Muda para LIVE
  "confidence": 75.5,
  "learningEnabled": true
}

npm run start:all       # Reinicia bot
```

Agora o bot executará **transações reais** com a **mesma estratégia testada** em simulação.

## Key Insights

### 🎯 Por que simular PRIMEIRO é crítico?
1. **Sem risco**: Testa com dados reais, sem perder dinheiro
2. **Valida estratégia**: 50 trades simulados = estratégia comprovada
3. **Calibra AI**: Sistema refina confiança score com dados reais
4. **Builds trust**: Dashboard mostra progresso objetivo
5. **Identifica padrões**: Learning system descobre o que funciona

### 🔄 Ciclo de Aprendizado
```
Trade Real 1 → Sim, foi lucrativo → LLM aprende
Trade Real 2 → Não, perdeu → LLM entende por quê
...
50 trades → LLM refinhou strategy
100 trades → LLM agora está >70% preciso
```

### 💡 Sem Simulação
- ❌ Testa estratégia com dinheiro real
- ❌ Primeira trade pode perder tudo
- ❌ Sem aprendizado prévio
- ❌ Alta chance de falha

### ✅ Com Simulação
- ✅ Testa com dados REAIS antes de riscar
- ✅ Aprende padrões com 50 trades grátis
- ✅ Chega ao LIVE com 90% confiança
- ✅ Muito maior chance de sucesso

## Monitoramento

Dashboard em `http://localhost:3001`:

```
🧪 SIMULATION METRICS
├─ Win Rate: 61.8%
├─ Total P&L: +2.345 SOL  
├─ Sharpe Ratio: 1.45
├─ Expected Value: +0.089 SOL/trade
├─ Max Drawdown: 3.2 SOL
└─ Readiness Score: 65/100
   ├─ ✅ Trades: 34/50
   ├─ ✅ Win Rate: 61.8% > 40%
   ├─ ✅ Expected Value: positive
   ├─ ✅ Max Drawdown: < 10 SOL
   └─ ⏳ Sharpe: 1.45 > 1 (quase!)
```

## Próxhas Passos

1. ✅ Simulação Engine criado
2. ✅ Token monitor conectado
3. ⏳ Integração com LLM (Gemini/OpenAI)
4. ⏳ Dashboard refinado com simulação metrics
5. ⏳ Auto-switch para LIVE quando ready

---

**Lembre-se**: A simulação usa **tokens reais, preços reais, dados reais**. É a forma mais segura de validar estratégia antes de arriscar capital real.
