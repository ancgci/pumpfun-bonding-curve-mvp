---
name: pumpfun-dip-rip-scalper
description: Ultra fast Dip & Rip scalper for high-frequency trading (5-15s).
version: 1.0
author: Antigravity
priority: 40
tags: [pumpfun, trading, scalping, mezo]
---

# PumpFun Ultra Fast Dip & Rip Scalper (5-15s)
# Skill para Agente de IA - Scalping por segundos em tokens novos

## Descrição
Detecta tendência de alta forte + micro pullbacks e executa compra no dip / venda no rip repetidamente (scalping HFT). Avaliação a cada 5 segundos. Ideal para Pump.fun, Moonshot, Bonk.fun, Meteora DBC e daos.fun.

## Configurações (edite no .env ou agente)
- TIMEFRAME: "5s" ou "1s" (padrão: 5s)
- MIN_UPTREND_STRENGTH: 1.8 (EMA9 acima EMA21 + preço > EMA50)
- DIP_THRESHOLD: -1.8% (queda rápida em 5-10s)
- RIP_THRESHOLD: +2.2% (saída rápida)
- MAX_POSITIONS_PER_TOKEN: 3 (múltiplas entradas simultâneas)
- PARTIAL_TAKE_PROFIT: true (50% em +2.2%, resto trailing)

## Lógica (o agente executa isso automaticamente)
1. Recebe ticks em tempo real dos parsers Shyft (já integrados no seu bot)
2. Calcula em 5s:
   - EMA9 / EMA21 / EMA50
   - ATR(5) para stop dinâmico
   - Volume spike (compra só com volume crescente)
   - RSI(7) > 45 (evita dip falso)
3. Se uptrend forte + dip detectado → BUY imediato
4. Se rip detectado → SELL parcial/total
5. Repete enquanto tendência durar (não espera topo)

## Integração com seu bot (já funciona com seus parsers)
- Usa dados reais do Shyft (price, volume, txs de create/buy/sell)
- Conecta com Jito Bundles (se skill 3 já importada)
- Envia decisão direta para o Agente de IA

## Exemplo de decisão que o agente vai retornar:
"🚀 ECLIPX - Uptrend forte (EMA9 > EMA21). Dip de -2.1% em 7s detectado. BUY 0.8 SOL agora. TP1 +2.2% (50%), trailing ATR."

## Como ativar
Após importar, diga ao agente: "/skill:enable pumpfun-dip-rip-scalper" ou "ativa o scalper de 5 segundos"
