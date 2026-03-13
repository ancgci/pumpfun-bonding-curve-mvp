# ☁️ VPS Deployment & Access Guide

Este documento explica como acessar sua VPS, como o processo de atualização (deploy) funciona e como gerenciar o bot rodando no servidor.

## 1. Como acessar a VPS

Você tem duas formas principais de interagir com a sua VPS:

### Opção A: Acesso via XRDP (Interface Gráfica)
Se você já configurou o acesso remoto para ver a "área de trabalho" da VPS:
1. Abra o aplicativo de **Conexão de Área de Trabalho Remota** no Windows.
2. Digite o IP da VPS: `YOUR_VPS_IP`
3. Entre com as credenciais do usuário `dev`.
4. Abra o terminal (janela preta) para digitar os comandos.

### Opção B: Acesso via SSH (Terminal)
Você pode acessar o terminal da VPS diretamente da sua máquina local:
```bash
ssh dev@YOUR_VPS_IP
```
*(Digite a senha quando solicitada).*

---

## 2. Como atualizar o Bot (Deploy)

A grande vantagem dessa arquitetura é que **você não programa na VPS**. Você programa, testa e verifica tudo na sua **máquina local**. 

Quando uma nova funcionalidade estiver pronta e você quiser enviá-la para a produção na VPS, basta rodar o script de deploy na **sua máquina local**:

```bash
# Na sua máquina local, na raiz do projeto
./deploy/deploy.sh
```

### O que esse script faz?
1. Sincroniza (copia) os arquivos locais modificados para a VPS.
2. Faz login na VPS e roda `npm install` (se houver novas dependências).
3. Cria um novo "build" do painel de controle (Dashboard).
4. **Reinicia automaticamente** o bot e a API na VPS para que o novo código entre em vigor imediatamente.

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

