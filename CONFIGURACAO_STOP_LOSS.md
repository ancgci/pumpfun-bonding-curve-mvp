# Configuração do Stop Loss

Este documento descreve como configurar o Stop Loss no bot de trading híbrido.

## Como funciona

O Stop Loss é um mecanismo de proteção que fecha automaticamente uma posição quando o preço cai abaixo de um determinado percentual do preço de entrada, limitando assim as perdas.

## Configuração

A configuração do Stop Loss é feita através da variável de ambiente `STOP_LOSS_PERCENT` no arquivo [.env](file:///wsl.localhost/Ubuntu/home/garci/telegram-webhook/.env).

### Exemplo de configuração

```env
# Configurações de Trading Híbrido
STOP_LOSS_PERCENT=25
```

### Valores recomendados

- **25**: Para traders moderadamente agressivos (padrão)
- **15**: Para traders conservadores
- **40**: Para traders agressivos que aceitam maior risco

## Funcionamento

1. Quando uma posição é aberta, o bot registra o valor de stop loss com base no percentual configurado
2. Durante o monitoramento da posição, o bot verifica continuamente o preço atual
3. Se o preço cair abaixo do limiar de stop loss, a posição é automaticamente fechada
4. O bot envia notificações via log quando o stop loss é acionado

## Logs

Quando o stop loss é configurado, os seguintes logs são gerados:

```
📊 COMPRA REALIZADA PARA TOKEN [mint]
   Valor investido: [valor] SOL
   Take Profit configurado: [percentual]%
   Stop Loss configurado: -[percentual]%
   Timestamp da compra: [timestamp]
```

Quando o stop loss é acionado:

```
📉 STOP LOSS ACIONADO para token [mint]
   Valor investido: [valor] SOL
   Prejuízo esperado: -[percentual]%
   ❌ Stop Loss atingido para token [mint] (CURVE|DEX)
   ✅ Posição fechada via PumpFun/Jupiter: [assinatura]
```

## Testes

Para testar a configuração do stop loss:

```bash
npm run test:stop-loss
```