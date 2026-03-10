# 🚀 Guia de Migração para a Nuvem

Este documento descreve como mover o bot para um novo servidor (nuvem, VPS, etc.) sem perder os aprendizados da IA, histórico de trades ou configurações.

---

## Estrutura dos Dados do Bot

O projeto é dividido em dois tipos de dados:

| Tipo | Onde está | Vai para o Git? |
|------|-----------|-----------------|
| **Código** | Todo o repositório | ✅ Sim |
| **Cérebro da IA** | `data/` | ❌ Não (protegido pelo `.gitignore`) |
| **Tokens alertados** | `sent_addresses.json` | ❌ Não |
| **Circuit Breaker** | `circuit_breaker_state.json` | ❌ Não |
| **Chaves e segredos** | `.env` | ❌ Nunca |

> ⚠️ **IMPORTANTE:** Os arquivos em `data/` contêm o aprendizado acumulado da IA. Sem eles, o bot começa do zero. Sempre faça backup antes de qualquer migração.

---

## Arquivos do "Cérebro" da IA

| Arquivo | Conteúdo |
|---------|----------|
| `data/agent/learner-state.json` | Pesos e padrões aprendidos |
| `data/agent/trades.json` | Histórico de decisões e trades |
| `data/agent/patterns.json` | Padrões de mercado reconhecidos |
| `data/agent/status.json` | Status e métricas do agente |
| `data/simulation/` | Histórico de simulações |
| `data/positions.json` | Posições abertas/fechadas |

---

## Usando o Script `migrate.sh`

O projeto inclui o script `migrate.sh` para automatizar o processo.

### Comandos disponíveis

```bash
# 1. Criar um backup compactado localmente
./migrate.sh backup
# → Gera: bot_brain_YYYYMMDD_HHMMSS.tar.gz

# 2. Enviar o backup diretamente para um servidor remoto
./migrate.sh push usuario@IP:/caminho/do/projeto/

# 3. Baixar um backup de um servidor remoto e restaurar
./migrate.sh pull usuario@IP:/caminho/do/projeto/bot_brain_xxx.tar.gz

# 4. Restaurar a partir de um arquivo local
./migrate.sh restore bot_brain_20260309_123456.tar.gz
```

---

## Passo a Passo Completo: Migrar para a Nuvem

### Na máquina atual (antes de migrar):

```bash
# 1. Fazer backup de tudo
./migrate.sh backup
```

### No servidor novo (nuvem/VPS):

```bash
# 1. Instalar dependências básicas (Node.js, git)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. Clonar o repositório
git clone https://github.com/ancgci/pumpfun-bonding-curve-Test.git
cd pumpfun-bonding-curve-Test

# 3. Instalar dependências do projeto
npm install

# 4. Configurar as variáveis de ambiente
cp .env.example .env
nano .env  # Preencher com suas chaves

# 5. Restaurar o cérebro da IA (enviar o .tar.gz e restaurar)
./migrate.sh restore bot_brain_YYYYMMDD_HHMMSS.tar.gz

# 6. Iniciar o bot
npm run start:all
```

---

## Manter o Bot Rodando na Nuvem (PM2)

Para que o bot continue rodando mesmo após desconectar do SSH, use o **PM2**:

```bash
# Instalar o PM2
npm install -g pm2

# Iniciar o bot com PM2
pm2 start "npm run start:all" --name "pumpfun-bot"

# Configurar para iniciar automaticamente no boot do servidor
pm2 startup
pm2 save
```

### Comandos úteis do PM2

```bash
pm2 status          # Ver status de todos os processos
pm2 logs pumpfun-bot  # Ver logs em tempo real
pm2 restart pumpfun-bot  # Reiniciar o bot
pm2 stop pumpfun-bot     # Parar o bot
```

---

## Dicas de Segurança na Nuvem

- ✅ Nunca comite o `.env` no GitHub.
- ✅ Use as variáveis de ambiente do próprio servidor (ex: `export` ou painel da nuvem).
- ✅ Faça backups periódicos com `./migrate.sh backup` antes de qualquer atualização de código (`git pull`).
- ✅ Restrinja o acesso SSH ao servidor com chave pública, nunca senha.
