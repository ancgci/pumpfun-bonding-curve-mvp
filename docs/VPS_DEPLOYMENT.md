# ☁️ VPS Deployment & Access Guide

Este documento explica como acessar sua VPS, como o processo de atualização (deploy) funciona e como gerenciar o bot rodando no servidor.

## 1. Como acessar a VPS

Você tem duas formas principais de interagir com a sua VPS:

### Opção A: Acesso via XRDP (Interface Gráfica)
Se você já configurou o acesso remoto para ver a "área de trabalho" da VPS:
1. Abra o aplicativo de **Conexão de Área de Trabalho Remota** no Windows.
2. Digite o IP da VPS: `<VPS_IP>`
3. Entre com as credenciais do usuário `anto` (conforme configurado no Hardening).
4. Abra o terminal (janela preta) para digitar os comandos.

### Opção B: Acesso via SSH (Terminal)
Você deve acessar o terminal da VPS usando o usuário administrativo seguro com sua chave SSH autorizada:
```bash
ssh <VPS_USER>@<VPS_IP>
```
*(Login de root e autenticação por senha estão desativados por segurança).*
*(Sua chave ED25519 deve estar configurada no seu computador local).*

---

## 2. Como atualizar o Bot (Deploy)

A grande vantagem dessa arquitetura é que **você não programa na VPS**. Você programa, testa e verifica tudo na sua **máquina local**. 

Quando uma nova funcionalidade estiver pronta e você quiser enviá-la para a produção na VPS, basta rodar o script de deploy na **sua máquina local**:

```bash
# Na sua máquina local, na raiz do projeto
./deploy/deploy.sh
```

### O que esse script faz?
1. Cria backup remoto dos dados persistentes da VPS antes do envio.
2. Sincroniza o código local para a VPS via `rsync`.
3. Faz login na VPS e roda `npm install` (se houver novas dependências).
4. Cria um novo "build" do painel de controle (Dashboard).
5. **Reinicia automaticamente** o bot e a API na VPS para que o novo código entre em vigor imediatamente.
6. Valida a saúde básica da API após o restart.

### Dados persistentes preservados no deploy
O deploy envia código, mas **não deve sobrescrever arquivos de runtime da VPS**. Os principais itens preservados são:

- `logs/`
- `data/*.db`
- `dashboard-api/db/pnl_history.db`
- `dashboard-api/db/pnl_history.db-shm`
- `dashboard-api/db/pnl_history.db-wal`

### Backups criados automaticamente na VPS
Antes de cada deploy, o script cria:

- backup de `data/` em `data_backup_<timestamp>/`
- backup do histórico do dashboard em `dashboard-api/db/backups/pnl_history_<timestamp>.db`

Para listar esses backups na VPS:

```bash
cd /home/anto/pumpfun-bot
ls -lah data_backup_*
ls -lah dashboard-api/db/backups/
```

### Restore rápido do banco do histórico
Se for necessário restaurar manualmente o histórico do dashboard na VPS:

```bash
cd /home/anto/pumpfun-bot
cp dashboard-api/db/backups/pnl_history_<timestamp>.db dashboard-api/db/pnl_history.db
pm2 restart dashboard-api
```

### Regra operacional importante
`dashboard-api/db/pnl_history.db` é banco de runtime da VPS. Ele **não deve** ser versionado como fonte de verdade nem enviado do ambiente local para produção.

---

## 3. Perfil Operacional Recomendado na VPS

Para reduzir risco de novo throttle de banda na Contabo, o perfil padrão recomendado na produção é:

```bash
MONITORING_PROTOCOL=PUMPFUN
METEORA_DBC_MONITORING_ENABLED=false
BONK_FUN_MONITORING_ENABLED=false
DAOS_FUN_MONITORING_ENABLED=false
MOONSHOT_MONITORING_ENABLED=false
ANONCOIN_MONITORING_ENABLED=false
VERBOSE_TRANSACTION_LOGS=false
AGENT_MODE=SIMULATION

# Controle de banda dos substreams Bitquery (OFF = economia de banda)
BITQUERY_DEXPOOLS_ENABLED=false
BITQUERY_DEXORDERS_ENABLED=false
BITQUERY_BALANCES_ENABLED=false
```

> [!IMPORTANT]
> Os 3 flags `BITQUERY_*_ENABLED` controlam substreams auxiliares da Bitquery. **Por padrão são `false`**.
> Deixá-los desligados mantém apenas `DexTrades`, `Transactions` e `Transfers`, o que é suficiente
> para o discovery e análise completos da Pump.fun.

### Impacto esperado de banda por configuração

| Streams ativos | RX estimado/dia |
|---|---|
| Todos ligados (situação anterior) | **~60–70 GiB** ❌ |
| Apenas DexTrades + Transactions + Transfers (recomendado) | **~3–5 GiB** ✅ |
| + DexPools habilitado | ~7–10 GiB ⚠️ |
| + DexOrders ou Balances habilitados | +~1–3 GiB cada ⚠️ |

Se houver necessidade de ampliar o escopo:

1. habilite um protocolo extra por vez
2. acompanhe `vnstat` por pelo menos 24h
3. só então abra a próxima frente

### Verificação de LLM antes do próximo deploy

Antes de subir o stack de IA atualizado para a VPS, confirme que o `.env` de produção está alinhado com o baseline local validado:

```bash
LLM_PROVIDER_ORDER=legacy,google
LLM_MODEL=z-ai/glm5
LEGACY_LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
GOOGLE_LLM_MODEL=gemini-2.5-flash
GOOGLE_GENERATIVE_AI_API_KEY=<preencher apenas se o fallback Gemini for desejado na VPS>
```

Esse checklist existe porque a combinação errada entre modelo, rota e provider legado pode gerar `404` e fazer o bot cair em `SKIP` para todos os tokens mesmo com o processo em execução.

### Ativação controlada do Winner Reentry Agent

Se o objetivo for ativar o novo worker assíncrono de reentrada de winners, faça isso com perfil conservador no primeiro deploy:

```bash
WINNER_REENTRY_AGENT_ENABLED=true
WINNER_REENTRY_DISCOVERY_INTERVAL_MS=120000
WINNER_REENTRY_SCAN_INTERVAL_MS=4000
WINNER_REENTRY_LOOKBACK_MS=1800000
WINNER_REENTRY_MAX_TOKENS=3
WINNER_REENTRY_MIN_DELAY_MS=10000
WINNER_REENTRY_MAX_AGE_MS=900000
WINNER_REENTRY_PER_MINT_COOLDOWN_MS=900000
WINNER_REENTRY_MAX_REENTRIES_PER_MINT=1
WINNER_REENTRY_MIN_PNL_PERCENT=35
```

Esse worker:

- não compra diretamente fora do pipeline;
- só observa `CLOSED_TP` recentes;
- usa fila curta com cap, dedupe, TTL, prioridade e cooldown;
- volta a passar por `getAgentDecision()`, `executeAgentTrade()` e preflight normal.

Após alterar o `.env`, reinicie com atualização de ambiente:

```bash
pm2 restart bot --update-env
```

Nos primeiros minutos, monitore:

```bash
pm2 logs bot
```

Logs esperados:

- `WinnerReentryAgent] Monitor initialized`
- `WinnerReentryAgent] Added ... to reentry queue`
- `WinnerReentryAgent] Re-evaluating ...`
- `Winner Reentry executing BUY for ...`

Se nada executar, isso não significa falha. Os bloqueios mais comuns são:

- ausência de winners recentes fortes o bastante;
- cooldown por mint;
- fila expirada sem confirmação;
- reprovação normal no pipeline;
- bloqueio por portfólio ou preflight.

---

## 4. Gerenciamento Financeiro e de Processos (PM2)

Na VPS, usamos o **PM2** para manter o bot rodando 24/7 sem interrupções.
Se você precisar verificar o status ou os logs, os comandos abaixo devem ser executados **dentro da VPS**.

### Ver status dos processos
```bash
pm2 status
```
Isso mostrará dois processos:
- `bot` (O robô de trading)
- `dashboard-api` (A API e o painel web)

### Ver logs em tempo real
Para ver tudo o que o bot está imprimindo na tela em tempo real:
```bash
pm2 logs bot
```
Para ver os logs do painel (útil se o site der erro):
```bash
pm2 logs dashboard-api
```
Para ver ambos:
```bash
pm2 logs
```
*(Para sair da tela de logs, pressione `Ctrl+C`)*.

### Iniciar, Parar ou Reiniciar
Embora o `./deploy/deploy.sh` já reinicie tudo sozinho, você pode gerenciar manualmente se precisar:
```bash
# Parar o robô (ex: em caso de emergência extrema que o painel não resolva)
pm2 stop bot

# Parar o Dashboard-api
pm2 stop dashboard-api

# Iniciar o robô novamente
pm2 start bot

# Reiniciar tudo
pm2 restart all
```

### Forma canônica de aplicar configuração do PM2
Quando houver mudança de código ou da configuração do processo, prefira reaplicar o ecossistema:

```bash
cd /home/anto/pumpfun-bot
cp deploy/ecosystem.config.js .
pm2 delete bot || true
pm2 delete dashboard-api || true
pm2 start ecosystem.config.js --update-env
pm2 save
```

Isso garante que `bot` e `dashboard-api` rodem pelo entrypoint direto do `ts-node`, sem wrapper intermediário de `npm exec`/`npx`.

### Sanidade pós-restart: detectar processo órfão
Após restart ou deploy, confirme que existe apenas uma árvore real do bot:

```bash
ps -eo pid,ppid,args | grep -E 'ts-node/dist/bin.js.*index.ts|ts-node/dist/bin.js.*server.ts' | grep -v grep
```

Esperado:

- uma linha `node .../ts-node/dist/bin.js index.ts`
- uma linha `node .../ts-node/dist/bin.js server.ts`

Se aparecer mais de uma linha para o mesmo entrypoint, existe processo órfão antigo e o runtime pode ficar inconsistente.

Para conferir qual processo real está escrevendo o health runtime:

```bash
cat /home/anto/pumpfun-bot/data/bot-runtime.json
```

O campo `pid` deve bater com o processo `node ... ts-node/dist/bin.js index.ts` ativo.

Para inspecionar rapidamente a telemetria nova do gRPC/Transfers sem abrir logs:

```bash
cd /home/anto/pumpfun-bot
cat data/bot-runtime.json | jq '.stream.provider, .stream.substreams, .stream.transfers'
```

Se preferir pela API já agregada do dashboard:

```bash
curl -s http://localhost:3001/api/bot-health \
  -H "Authorization: Bearer <ACCESS_TOKEN>" | jq '.grpcProvider, .grpcSubstreams, .grpcTransfers'
```

Campos mais úteis em `.grpcTransfers`:

- `watchlistSize`: quantos mints estão atualmente no filtro de `Transfers`
- `activeStreamCount`: quantos `Transfers#N` estão ativos
- `reloadCount`: quantos reloads reais de substream ocorreram desde o boot
- `refreshCount`: quantas avaliações de refresh foram executadas
- `streamAssignments`: quantos mints cada `Transfers#N` está carregando
- `trackedMintsPreview`: amostra dos mints mais recentes na watchlist

Warnings operacionais úteis em `/api/bot-health`:

- `GRPC_FALLBACK_ACTIVE`: o primário Bitquery caiu e o bot está rodando no fallback
- `TRANSFERS_WATCHLIST_NEAR_CAPACITY`: a watchlist de `Transfers` está perto do teto configurado
- `TRANSFERS_RELOAD_SPIKE`: houve churn recente demais de reload em `Transfers`

### Parada segura em caso de consumo elevado

Se o tráfego subir além do esperado ou houver novo aviso do provedor:

```bash
pm2 stop bot
```

Depois revise `.env`, confirme o escopo de monitoramento e só então religue:

```bash
pm2 restart bot --update-env
```


---

## 5. Monitoramento de Banda na VPS

O `vnstat` está instalado na VPS e deve ser usado como fonte primária de histórico de tráfego.

### Comandos principais

```bash
vnstat -i eth0
vnstat -d -i eth0
vnstat -h -i eth0
vnstat -m -i eth0
vnstat -tr 5 -i eth0
```

### Alerta diário por Telegram

Há uma checagem periódica no `crontab` do usuário `anto` usando `tools/vnstat_daily_alert.py`.

Limite operacional atual:

- `5 GiB/dia`
- frequência atual: a cada `15` minutos

Para conferir o `crontab`:

```bash
crontab -l
```

Para testar manualmente:

```bash
cd /home/anto/pumpfun-bot
python3 tools/vnstat_daily_alert.py --iface eth0 --threshold-gib 5 --dry-run
```

O `--dry-run` serve apenas para validar o alerta sem enviar mensagem real ao Telegram.

---

## 6. O Painel de Controle (Dashboard)

### Acessando na Máquina Local (Desenvolvimento)
Quando você roda `npm run start:all` na sua máquina local, o painel roda em um endereço local e fechado apenas para a sua máquina:
```
http://localhost:5174/login
```

### Acessando na VPS (Produção)
A VPS serve o seu painel web para a internet, que pode ser acessado de qualquer navegador no mundo através do seu domínio (Recomendado via Porta 80):
```
http://meu.listadecompras.shop/login
```

*(Se o Nginx ainda não estiver configurado, você pode tentar acessar via porta 3001: http://meu.listadecompras.shop:3001/login)*.

**⚠️ Importante:** O acesso na VPS requer autenticação via Google OAuth e é estritamente limitado aos e-mails autorizados configurados no `.env`.

---

## 7. Segurança (Hardening)

A VPS opera sob o **Protocolo de Hardening Nível 3**:
- **Acesso**: Restrito a chaves SSH (Senhas desativadas no `/etc/ssh/sshd_config`).
- **Fail2Ban**: Monitora e bane IPs suspeitos automaticamente.
- **UFW Firewall**: Apenas portas 22 (SSH), 80 (HTTP) e 443 (HTTPS) abertas.
- **Runtime**: Aplicação executada pelo usuário isolado `anto` via PM2.
- **Patches**: Atualizações de segurança críticas automáticas.

Para detalhes técnicos completos, veja [SECURITY_HARDENING.md](./SECURITY_HARDENING.md).
