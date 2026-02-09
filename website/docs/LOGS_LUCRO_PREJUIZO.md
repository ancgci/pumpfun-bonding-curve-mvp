# Logs de Lucro e Prejuízo

Este documento descreve os logs adicionados ao bot para monitorar lucro e prejuízo nas operações de trading.

## Logs Adicionados

### 1. Log de Compra Realizada

Quando o bot realiza uma compra, os seguintes logs são gerados:

```
📊 COMPRA REALIZADA PARA TOKEN [mint]
   Valor investido: [valor] SOL
   Take Profit configurado: [percentual]%
   Stop Loss configurado: -[percentual]%
   Timestamp da compra: [timestamp]
```

### 2. Log de Monitoramento de Posição

Durante o monitoramento contínuo das posições abertas:

```
📊 MONITORAMENTO DE POSIÇÃO PARA TOKEN [mint]
   Valor investido: [valor] SOL
   Take Profit configurado: [percentual]%
   Stop Loss configurado: -[percentual]%
   Lucro/Prejuízo atual: [percentual]%
```

### 3. Log de Take Profit Acionado

Quando o limite de take profit é atingido:

```
📈 TAKE PROFIT ACIONADO para token [mint]
   Valor investido: [valor] SOL
   Lucro esperado: [percentual]%
   💰 Take Profit atingido para token [mint] (CURVE|DEX)
   ✅ Posição fechada via PumpFun/Jupiter: [assinatura]
```

### 4. Log de Stop Loss Acionado

Quando o limite de stop loss é atingido:

```
📉 STOP LOSS ACIONADO para token [mint]
   Valor investido: [valor] SOL
   Prejuízo esperado: -[percentual]%
   ❌ Stop Loss atingido para token [mint] (CURVE|DEX)
   ✅ Posição fechada via PumpFun/Jupiter: [assinatura]
```

## Configuração

Os logs utilizam as seguintes variáveis de ambiente do arquivo [.env](file://\\wsl.localhost\Ubuntu\home\garci\pumpfun-bonding-curve\.env):

- `BUY_AMOUNT_SOL`: Valor investido em SOL
- `TAKE_PROFIT_PERCENT`: Percentual de take profit
- `STOP_LOSS_PERCENT`: Percentual de stop loss

## Exemplo de Uso

```
📊 COMPRA REALIZADA PARA TOKEN 5KWJn4dF9caD1D1tN5v5h8npP3N2WZoEHN7c75uPz3Qn
   Valor investido: 0.5 SOL
   Take Profit configurado: 50%
   Stop Loss configurado: -30%
   Timestamp da compra: 2025-10-25T01:40:15.123Z
```

## Benefícios

1. **Transparência**: Permite acompanhar exatamente quando e por quanto o bot está operando
2. **Auditoria**: Facilita a análise de performance e identificação de problemas
3. **Controle**: Ajuda a entender se as configurações de risco/recompensa estão adequadas
4. **Debugging**: Auxilia na identificação de possíveis falhas na lógica de trading

## Localização dos Logs

Os logs são gerados no arquivo [hybridExecutor.ts](file://\\wsl.localhost\Ubuntu\home\garci\pumpfun-bonding-curve\utils\hybridExecutor.ts) e podem ser visualizados:

1. No console durante a execução
2. Nos arquivos de log na pasta `logs/`
3. Através do sistema de logging do Winston configurado no projeto