# Mitigacao de Banda e Monitoramento — 20/03/2026

Este documento registra **o que foi efetivamente ajustado** no projeto e na VPS após o alerta de limitação de banda da Contabo.

## 1. Objetivo

Reduzir o risco de novo throttle de banda sem perder a capacidade de:

- monitorar PumpFun em tempo real
- operar em `SIMULATION` por padrão
- migrar para `LIVE` quando houver decisão explícita de operar em mainnet

## 2. Ajustes aplicados no código

### Perfil padrão de baixo consumo

Os defaults documentados e os exemplos de ambiente foram alinhados para o perfil:

```bash
MONITORING_PROTOCOL=PUMPFUN
METEORA_DBC_MONITORING_ENABLED=false
BONK_FUN_MONITORING_ENABLED=false
DAOS_FUN_MONITORING_ENABLED=false
MOONSHOT_MONITORING_ENABLED=false
ANONCOIN_MONITORING_ENABLED=false
VERBOSE_TRANSACTION_LOGS=false
AGENT_MODE=SIMULATION
```

### Logs verbosos de transação

Foi introduzida a flag:

```bash
VERBOSE_TRANSACTION_LOGS=false
```

Com isso, os blocos detalhados de transação (`TYPE`, `MINT`, `SIGNER`, `TOKEN AMOUNT`, `SIGNATURE` etc.) deixam de ser emitidos em `info` por padrão.

Uso recomendado:

- `false` em produção
- `true` apenas durante troubleshooting pontual

## 3. Ajustes aplicados na VPS

### Escopo operacional reduzido

No servidor `YOUR_VPS_IP`, o `.env` foi ajustado para:

- manter `PUMPFUN` como protocolo principal
- desabilitar os protocolos auxiliares no baseline operacional
- manter `AGENT_MODE=SIMULATION`
- manter `AUTO_BUY_ENABLED=false`

### Limpeza e retenção de logs

Foi feito backup do estado anterior e os logs do bot foram arquivados para reduzir pressão operacional.

Resultado observado após a mitigação:

- `logs/` caiu de aproximadamente `1.4 GB` para cerca de `13 MB`
- `combined.log` deixou de crescer na amostra imediatamente após o restart

### Estado do runtime após o restart controlado

Após reiniciar o `bot` com o escopo reduzido:

- o processo voltou `online` no PM2
- o bot permaneceu estável
- a amostra instantânea de rede caiu drasticamente em relação ao estado anterior
- snapshot logo após a mitigação: ~`0.075 Mbit/s` RX e ~`0.008 Mbit/s` TX

## 4. Monitoramento de banda instalado

### `vnstat`

O `vnstat` foi instalado na VPS e passou a ser a fonte principal para histórico de tráfego.

Comandos úteis:

```bash
vnstat -i eth0
vnstat -d -i eth0
vnstat -h -i eth0
vnstat -m -i eth0
vnstat -tr 5 -i eth0
```

### Alerta diário em Telegram

Foi criado o script:

```bash
tools/vnstat_daily_alert.py
```

Função:

- consultar o total diário do `vnstat`
- comparar com um limite em GiB/dia
- enviar mensagem no Telegram uma única vez por dia quando o limite for excedido

Configuração operacional atual:

```bash
BANDWIDTH_ALERT_THRESHOLD_GIB=5
BANDWIDTH_ALERT_IFACE=eth0
```

Agendamento atual no `crontab` da VPS:

```bash
*/15 * * * * cd /home/anto/pumpfun-bot && /usr/bin/python3 /home/anto/pumpfun-bot/tools/vnstat_daily_alert.py --iface eth0 --threshold-gib 5 >> /home/anto/pumpfun-bot/data/bandwidth-monitor/alert.log 2>&1
```

### Fallback local criado durante a intervenção

Durante a mitigação foram criados também estes utilitários no repositório:

- `tools/bandwidth_counter.sh`
- `tools/bandwidth_report.py`

Eles foram usados como contingência antes da instalação definitiva do `vnstat` no VPS e permanecem disponíveis para troubleshooting, mas o monitoramento principal agora é feito pelo `vnstat`.

## 5. Leitura operacional do limite

O alerta de `5 GiB/dia` **não representa o limite da Contabo**. Ele é um limite **preventivo**, muito mais conservador, para avisar cedo.

Comparação:

- throttle informado pela Contabo: `100 Mbit/s`
- alerta configurado: `5 GiB/dia`

Na prática:

- `100 Mbit/s` é taxa instantânea
- `5 GiB/dia` é volume acumulado

O alerta foi configurado baixo de propósito para detectar desvio operacional antes de voltar a um padrão de consumo contínuo perigoso.

## 6. Faixa esperada após os ajustes

Na configuração atual do bot, a expectativa normal é:

- uso **baixo a moderado**
- geralmente algo na ordem de **~0,1 a 2 Mbit/s**
- com `TX` normalmente baixo
- total diário tipicamente em **poucos GiB por dia**

Isso pode variar com a atividade da PumpFun, mas o baseline atual ficou significativamente mais contido do que o perfil anterior multi-protocolo.

## 7. Validação final executada

Validações feitas após as mudanças:

- `npx tsc --noEmit` executado localmente com sucesso
- `pm2 status` no VPS confirmando `bot` e `dashboard-api` online
- `logs/` reduzido de ~`1.4 GB` para ~`13 MB`
- `vnstat` instalado e coletando histórico em `eth0`
- alerta via Telegram testado em modo seguro antes de permanecer no `cron`

## 8. Operação daqui em diante

Se o foco for preservar banda:

1. manter `MONITORING_PROTOCOL=PUMPFUN`
2. manter `VERBOSE_TRANSACTION_LOGS=false`
3. acompanhar `vnstat` diariamente
4. tratar qualquer alerta do Telegram como sinal para revisar escopo ou parar o bot temporariamente

Se houver necessidade de ampliar escopo:

1. habilitar um protocolo extra por vez
2. medir com `vnstat`
3. observar pelo menos 24h antes de abrir mais uma frente

## 9. Documentos relacionados

- [AVALIACAO_BANDA_CONTABO_2026-03-20.md](./AVALIACAO_BANDA_CONTABO_2026-03-20.md)
- [VPS_DEPLOYMENT.md](./VPS_DEPLOYMENT.md)
- [CONFIGURATION.md](./CONFIGURATION.md)
