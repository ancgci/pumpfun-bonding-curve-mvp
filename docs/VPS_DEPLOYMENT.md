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

## 3. Gerenciamento Financeiro e de Processos (PM2)

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


---

## 4. O Painel de Controle (Dashboard)

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

## 5. Segurança (Hardening)

A VPS opera sob o **Protocolo de Hardening Nível 3**:
- **Acesso**: Restrito a chaves SSH (Senhas desativadas no `/etc/ssh/sshd_config`).
- **Fail2Ban**: Monitora e bane IPs suspeitos automaticamente.
- **UFW Firewall**: Apenas portas 22 (SSH), 80 (HTTP) e 443 (HTTPS) abertas.
- **Runtime**: Aplicação executada pelo usuário isolado `anto` via PM2.
- **Patches**: Atualizações de segurança críticas automáticas.

Para detalhes técnicos completos, veja [SECURITY_HARDENING.md](./SECURITY_HARDENING.md).
