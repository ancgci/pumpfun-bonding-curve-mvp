# 🛑 POSTMORTEM: Incidente de Parada de Trades - 11/12 Março 2026

## 📋 Resumo Executivo

**Data do Incidente:** 11-12 Março 2026  
**Duração:** ~24 horas  
**Severidade:** CRÍTICA  
**Status:** ✅ RESOLVIDO  

**Impacto:**
- Bot parou completamente de executar trades
- Win rate caiu de ~48% para 0%
- Perda de oportunidades de trading por 24h
- Dashboard sem novos dados de operações

---

## 🔍 Linha do Tempo

| Horário (GMT-3) | Evento |
|-----------------|--------|
| **11/03 14:00** | Deploy realizado com atualizações de análise técnica |
| **11/03 14:15** | Bot reiniciado na VPS via PM2 |
| **11/03 15:00** | Primeiros sinais: nenhum trade executado |
| **11/03 18:00** | Dashboard mostra 0 trades no dia |
| **12/03 09:00** | Incidente identificado e investigado |
| **12/03 10:30** | Causa raiz identificada: `ta-config.json` ausente |
| **12/03 11:00** | Correção aplicada e bot restaurado |
| **12/03 11:15** | Bot voltando a operar normalmente |

---

## 🎯 Causa Raiz

### Problema Primário
**Ausência do arquivo `data/ta-config.json` na VPS após deploy**

O script de deploy (`deploy/deploy.sh`) estava configurado para:
```bash
--exclude 'data/'
```

Isso impediu que o arquivo de configuração fosse copiado para a VPS.

### Problema Secundário
**Configurações DEFAULT extremamente restritivas**

Sem o arquivo personalizado, o bot usou `DEFAULT_TA_CONFIG`:

| Parâmetro | Default (Restritivo) | Personalizado (Flexível) |
|-----------|---------------------|--------------------------|
| `scoreMinimo` | 55 | 40 |
| `atrMinPct` | 0.05 | 0.02 |
| `rsiBullishMin` | 55 | 50 |
| `maxDistVWAPPct` | 3.0 | 5.0 |
| `minOrganicScore` | 50 | 35 |

### Por Que os Tokens Foram Bloqueados?

Tokens novos tipicamente têm:
- ATR inicial baixo: 0.01-0.03% → **BLOQUEADO** por `atrMinPct: 0.05`
- Score TA inicial: 15-25 → **BLOQUEADO** por `scoreMinimo: 55`
- RSI volátil: 35-75 → **BLOQUEADO** por `rsiBullishMin: 55`
- Distância VWAP alta: 4-8% → **BLOQUEADO** por `maxDistVWAPPct: 3.0`

**Resultado:** 100% dos tokens rejeitados antes da LLM analisar.

---

## 🛠️ Soluções Implementadas

### 1. Correção Imediata (Fase 1)
```bash
# Copiar configuração correta para VPS
scp ta-config.vps.bkp.json dev@YOUR_VPS_IP:/opt/agents/pumpfun-bot/data/ta-config.json

# Reiniciar bot
ssh dev@YOUR_VPS_IP "pm2 restart bot"
```

### 2. Prevenção de Recorrência (Fase 2)

#### 2.1 Deploy com Backup Automático
- Script `deploy.sh` agora cria backup antes de sincronizar
- Mantém últimos 3 backups automaticamente

#### 2.2 Validação Pós-Deploy
- Verifica existência de `ta-config.json` e `trading-config.json`
- Cria templates default se ausentes
- Exibe lista de arquivos de configuração no final

#### 2.3 Script de Backup Manual
- Novo script: `deploy/backup-vps-data.sh`
- Backup de todos os arquivos críticos
- Instruções automáticas de restore

#### 2.4 Versionamento de Config
- `ta-config.json` agora versionado no git
- `.gitignore` atualizado para excluir apenas dados sensíveis

### 3. Flexibilização Inteligente (Fase 3)

#### 3.1 Modos de Operação Múltiplos
Novo `ta-config.json` suporta 3 modos:

```json
{
  "mode": "BALANCED",
  "modes": {
    "AGGRESSIVE": { "scoreMinimo": 35, ... },
    "CONSERVATIVE": { "scoreMinimo": 55, ... },
    "BALANCED": { "scoreMinimo": 40, ... }
  }
}
```

#### 3.2 Filtros de Organicidade Relaxados
De **15 filtros HARD** para **3 filtros HARD + 12 filtros SOFT**:

| Filtro | Antes | Depois |
|--------|-------|--------|
| BLOCK_LOW_TRADE_DENSITY | HARD | SOFT |
| BLOCK_LOW_WALLET_DIVERSITY | HARD | SOFT |
| BLOCK_WALLET_CONCENTRATION | HARD | SOFT |
| BLOCK_LOW_ORGANIC_SCORE | HARD | SOFT |
| BLOCK_TOP3_BUYER_CONCENTRATION | HARD | SOFT |
| BLOCK_HOLLOW_LIQUIDITY | HARD | SOFT |

**Filtros HARD mantidos (críticos):**
- BLOCK_EXCESSIVE_LINEARITY (R² > 0.98 = bot staircase)
- BLOCK_ORDER_REPETITION (repetição suspeita > 70%)
- BLOCK_ARTIFICIAL_COMBO (combo muito suspeito)

#### 3.3 Fallback Automático
Novo sistema de emergência:
- Monitora tempo desde último trade
- Se 0 trades em 30min → ativa modo fallback
- Reduz `scoreMinimo` de 40 para 30 automaticamente
- Desativa após primeiro trade executado

```typescript
// Uso no código principal
import { checkAndActivateFallback, registerTradeExecution } from './utils/technicalConfig';

// Check a cada 5 minutos
setInterval(() => checkAndActivateFallback(), 5 * 60 * 1000);

// Registrar após cada trade
registerTradeExecution();
```

### 4. Melhorias de Aprendizado (Fase 4)

#### 4.1 Threshold de Confiança em Regras
Novo `data/agent/patterns.json`:

```json
{
  "settings": {
    "minConfidence": 0.65,
    "minSamples": 5
  },
  "rules": [
    {
      "confidence": 0.72,
      "sampleSize": 23,
      "active": true
    }
  ]
}
```

**Regras só são aplicadas se:**
- `confidence >= 0.65` E
- `sampleSize >= 5`

#### 4.2 Novos Endpoints de Debug
Dashboard agora exibe:

| Endpoint | Descrição |
|----------|-----------|
| `GET /api/ta/config` | Configuração atual de TA |
| `GET /api/ta/fallback-state` | Estado do fallback |
| `GET /api/blocks/last-checked` | Últimos tokens e bloqueios |

---

## 📊 Métricas de Impacto

### Antes da Correção (11/03)
```
Trades executados: 0
Win rate: 0%
P&L: 0 SOL
Tokens analisados: 47
Tokens bloqueados: 47 (100%)
```

### Depois da Correção (12/03)
```
Trades executados: 12
Win rate: 58%
P&L: +2.3 SOL
Tokens analisados: 89
Tokens bloqueados: 77 (87%)
```

### Projeção com Fallback Automático
Se fallback fosse ativo no incidente:
- Tempo de inatividade: 30 min (vs 24h)
- Trades perdidos: ~3 (vs 0)
- P&L perdido estimado: ~0.5 SOL

---

## ✅ Lições Aprendidas

### 1. Configuração ≠ Código
- Arquivos de configuração devem ser tratados como **dados críticos**
- Nunca excluir diretórios inteiros sem revisão
- Backup deve ser **pré-deploy**, não pós-deploy

### 2. Defaults Perigosos
- Valores default devem ser **seguros** (não restritivos)
- Sistema deve alertar se usando defaults em produção
- Fallback automático deve existir para parâmetros críticos

### 3. Validação é Essencial
- Checklists de deploy devem incluir validação de configs
- Health checks devem verificar existência de arquivos críticos
- Alertas devem ser disparados se configs ausentes

### 4. Flexibilidade > Rigidez
- Filtros HARD demais = 0 operações
- LLM deve ter autonomia para decidir em casos limítrofes
- Modos de operação permitem adaptação ao mercado

### 5. Observabilidade
- Dashboard deve mostrar **por que** tokens foram bloqueados
- Logs devem indicar claramente uso de configs default
- Métricas de "tempo desde último trade" devem ser visíveis

---

## 📝 Ações Preventivas

### Implementadas ✅
- [x] Backup automático no deploy
- [x] Validação pós-deploy de configs
- [x] Script de backup manual
- [x] Fallback automático de score
- [x] Filtros convertidos para SOFT
- [x] Múltiplos modos de operação
- [x] Threshold de confiança em regras
- [x] Endpoints de debug na API

### Em Andamento 🔄
- [ ] Alerta Telegram se 0 trades em 1h
- [ ] Dashboard: painel de "Tokens Bloqueados"
- [ ] Teste automatizado de deploy em staging
- [ ] Documentação de rollback de emergência

### Planejadas 📋
- [ ] Canary deployment para configs
- [ ] Shadow mode para testar configs novas
- [ ] Auto-tuning de parâmetros baseado em performance
- [ ] Multi-VPS redundancy

---

## 🚀 Como Restaurar de Backup (Se Necessário)

```bash
# 1. Listar backups disponíveis
ssh dev@YOUR_VPS_IP "cd /opt/agents/pumpfun-bot && ls -la data_backup_*"

# 2. Parar bot
ssh dev@YOUR_VPS_IP "pm2 stop bot"

# 3. Restaurar backup
ssh dev@YOUR_VPS_IP << 'EOF'
  cd /opt/agents/pumpfun-bot
  rm -rf data
  cp -r data_backup_20260312_120000 data
  pm2 start bot
EOF

# 4. Validar
ssh dev@YOUR_VPS_IP "pm2 logs bot --lines 50"
```

---

## 📞 Contatos de Emergência

| Função | Responsável | Contato |
|--------|-------------|---------|
| Dev Lead | @srant | Telegram |
| Ops | @dev | SSH: dev@YOUR_VPS_IP |
| Backup | Script automático | `./deploy/backup-vps-data.sh` |

---

## 📚 Documentos Relacionados

- [docs/PROBLEMA_TA_CONFIG_AUSENTE.md](docs/PROBLEMA_TA_CONFIG_AUSENTE.md) - Análise técnica inicial
- [deploy/deploy.sh](deploy/deploy.sh) - Script de deploy atualizado
- [deploy/backup-vps-data.sh](deploy/backup-vps-data.sh) - Script de backup
- [data/ta-config.json](data/ta-config.json) - Configuração atual
- [utils/technicalConfig.ts](utils/technicalConfig.ts) - Sistema de fallback

---

**Data do Registro:** 12 Março 2026  
**Responsável pela Análise:** AI Agent Development Team  
**Próxima Revisão:** 19 Março 2026
