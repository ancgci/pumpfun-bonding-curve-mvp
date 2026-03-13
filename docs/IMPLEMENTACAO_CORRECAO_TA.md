# 🚀 GUIA DE IMPLEMENTAÇÃO - Correção TA Config

## ⚡ Implementação Rápida (Produção)

Execute estes comandos **imediatamente** para restaurar o bot:

### Passo 1: Copiar Configuração para VPS
```bash
cd /home/srant/projects/pumpfun-bonding-curve-Test

# Copiar ta-config.json atualizado para VPS
scp data/ta-config.json dev@YOUR_VPS_IP:/opt/agents/pumpfun-bot/data/ta-config.json

# Copiar patterns.json com thresholds de confiança
scp data/agent/patterns.json dev@YOUR_VPS_IP:/opt/agents/pumpfun-bot/data/agent/patterns.json
```

### Passo 2: Validar na VPS
```bash
# Acessar VPS
ssh dev@YOUR_VPS_IP

# Verificar arquivos
cd /opt/agents/pumpfun-bot
ls -la data/ta-config.json data/agent/patterns.json

# Reiniciar bot
pm2 restart bot

# Verificar logs
pm2 logs bot --lines 50
```

### Passo 3: Verificar Funcionamento
Aguarde 5-10 minutos e verifique:

```bash
# No seu terminal local, acesse dashboard
http://YOUR_VPS_IP

# Ou via API
curl http://YOUR_VPS_IP:3001/api/ta/config
curl http://YOUR_VPS_IP:3001/api/blocks/last-checked
```

**Sinais de sucesso:**
- ✅ Scores variados (20-60) nos logs
- ✅ Tokens sendo analisados pela LLM
- ✅ Trades executados (mesmo que poucos)

---

## 📦 Arquivos Modificados/Criados

### Para Produção (VPS)
| Arquivo | Ação | Status |
|---------|------|--------|
| `data/ta-config.json` | Sobrescrever | ✅ Pronto |
| `data/agent/patterns.json` | Criar | ✅ Pronto |
| `utils/entryBlocker.ts` | Atualizar | ✅ Pronto |
| `utils/technicalConfig.ts` | Atualizar | ✅ Pronto |
| `dashboard-api/server.ts` | Atualizar | ✅ Pronto |

### Para Desenvolvimento (Local)
| Arquivo | Ação | Status |
|---------|------|--------|
| `deploy/deploy.sh` | Atualizar | ✅ Pronto |
| `deploy/backup-vps-data.sh` | Criar | ✅ Pronto |
| `.gitignore` | Atualizar | ✅ Pronto |
| `docs/POSTMORTEM_2026-03-12.md` | Criar | ✅ Pronto |

---

## 🔄 Deploy Completo (Após Correção Emergencial)

Depois que o bot estiver operando, faça deploy completo:

```bash
cd /home/srant/projects/pumpfun-bonding-curve-Test

# 1. Fazer backup dos dados da VPS
./deploy/backup-vps-data.sh

# 2. Build e deploy
./deploy/deploy.sh

# 3. Validar
ssh dev@YOUR_VPS_IP "pm2 status"
ssh dev@YOUR_VPS_IP "ls -la data/*.json"
```

---

## 🎛️ Modos de Operação

### Mudar Modo via ta-config.json

**Modo AGGRESSIVE** (maximiza trades):
```json
{
  "mode": "AGGRESSIVE",
  "scoreMinimo": 35,
  "minOrganicScore": 30
}
```

**Modo BALANCED** (equilíbrio):
```json
{
  "mode": "BALANCED",
  "scoreMinimo": 40,
  "minOrganicScore": 35
}
```

**Modo CONSERVATIVE** (proteção máxima):
```json
{
  "mode": "CONSERVATIVE",
  "scoreMinimo": 55,
  "minOrganicScore": 50
}
```

### Aplicar Mudança de Modo
```bash
# Na VPS
ssh dev@YOUR_VPS_IP << 'EOF'
  cd /opt/agents/pumpfun-bot
  # Editar ta-config.json e mudar "mode"
  nano data/ta-config.json
  # Reiniciar bot
  pm2 restart bot
EOF
```

---

## 📊 Monitoramento Pós-Implementação

### Dashboard
Acesse: `http://YOUR_VPS_IP`

**Métricas para observar:**
- Trades executados (deve ser > 0)
- Win rate (esperado 45-60%)
- P&L acumulado
- Tokens bloqueados (ver filtros)

### API Endpoints
```bash
# Configuração atual
curl http://YOUR_VPS_IP:3001/api/ta/config

# Estado do fallback
curl http://YOUR_VPS_IP:3001/api/ta/fallback-state

# Últimos bloqueios
curl http://YOUR_VPS_IP:3001/api/blocks/last-checked

# Agent stats
curl http://YOUR_VPS_IP:3001/api/agent/stats
```

### Logs PM2
```bash
# Logs em tempo real
ssh dev@YOUR_VPS_IP "pm2 logs bot"

# Filtrar por TA
ssh dev@YOUR_VPS_IP "pm2 logs bot | grep 'TA V2'"

# Filtrar por bloqueios
ssh dev@YOUR_VPS_IP "pm2 logs bot | grep 'BLOCK_'"
```

---

## 🚨 Troubleshooting

### Bot ainda não opera após correção

**Verificar se ta-config.json foi carregado:**
```bash
ssh dev@YOUR_VPS_IP << 'EOF'
  cd /opt/agents/pumpfun-bot
  pm2 logs bot | grep "ta-config"
  cat data/ta-config.json | head -5
EOF
```

**Verificar filtros ativos:**
```bash
ssh dev@YOUR_VPS_IP << 'EOF'
  pm2 logs bot | grep "BLOCK_" | tail -20
EOF
```

**Forçar modo AGGRESSIVE temporariamente:**
```bash
ssh dev@YOUR_VPS_IP << 'EOF'
  cd /opt/agents/pumpfun-bot
  cat > data/ta-config.json << 'TACONFIG'
{
  "mode": "AGGRESSIVE",
  "scoreMinimo": 30,
  "scoreSizingMid": 40,
  "scoreSizingMax": 60,
  "minOrganicScore": 25
}
TACONFIG
  pm2 restart bot
EOF
```

### Fallback não ativa

**Verificar estado:**
```bash
curl http://YOUR_VPS_IP:3001/api/ta/fallback-state
```

**Resetar estado:**
```bash
ssh dev@YOUR_VPS_IP << 'EOF'
  cd /opt/agents/pumpfun-bot/data
  rm -f .ta-fallback-state.json
  pm2 restart bot
EOF
```

---

## 📈 Expectativas de Performance

### Cenário Normal (BALANCED mode)
- **Trades/dia:** 8-15
- **Win rate:** 45-60%
- **P&L médio:** +0.5 a +2 SOL/dia
- **Tokens bloqueados:** 80-90%

### Cenário Aggressive (AGGRESSIVE mode)
- **Trades/dia:** 15-30
- **Win rate:** 40-55%
- **P&L médio:** +0.3 a +1.5 SOL/dia
- **Tokens bloqueados:** 60-75%

### Cenário Conservativo (CONSERVATIVE mode)
- **Trades/dia:** 3-8
- **Win rate:** 55-70%
- **P&L médio:** +0.8 a +2.5 SOL/dia
- **Tokens bloqueados:** 90-95%

---

## ✅ Checklist de Validação

Após implementação, verifique:

- [ ] Bot está rodando (`pm2 status`)
- [ ] ta-config.json existe e tem modo configurado
- [ ] Logs mostram scores variados (não apenas 0)
- [ ] Pelo menos 1 trade executado em 1h
- [ ] Dashboard atualizando
- [ ] Fallback state acessível via API
- [ ] Backup script testado

---

**Data de Criação:** 12 Março 2026  
**Próxima Revisão:** 19 Março 2026  
**Responsável:** Development Team
