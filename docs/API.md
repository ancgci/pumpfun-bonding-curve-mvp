# Dashboard API Reference

Base URL: `http://localhost:3001/api`

## Auth

Os endpoints operacionais do dashboard exigem autenticação. Em produção, respostas `401 Unauthorized` indicam que a API está online, mas protegida por sessão/auth middleware.

## Endpoints

### GET `/api/me/account`

Retorna a conta autenticada, wallets vinculadas e permissões derivadas do role.

**Response:**
```json
{
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "name": "Admin",
    "role": "ADMIN",
    "accessOrigin": "allowlist",
    "accessStatus": "active",
    "billingStatus": "not-required",
    "plan": "Admin Console Access",
    "joinedAt": "2026-03-18 10:00:00"
  },
  "wallets": [
    {
      "id": 1,
      "label": "Primary Bot Wallet",
      "publicKey": "AbC123...",
      "status": "ACTIVE",
      "isDefault": true
    }
  ],
  "permissions": {
    "isAdmin": true,
    "canViewAdmin": true,
    "canManageUsers": true
  }
}
```

---

### GET `/api/me/stats`

Retorna estatísticas **somente do escopo da conta logada** (`user_id` + `wallet_id` efetiva).

**Response:**
```json
{
  "totalPositions": 12,
  "activePositions": 2,
  "closedPositions": 10,
  "totalInvested": 0.05,
  "totalPnL": 0.0134,
  "wins": 7,
  "losses": 3,
  "winRate": "70.0",
  "walletAddress": "AbC123..."
}
```

---

### GET `/api/me/positions`

Retorna posições ativas apenas da conta logada.

---

### GET `/api/me/trades`

Retorna histórico de trades apenas da conta logada.

**Query params:**
- `limit` (opcional, default `20`, máx `100`)

---

### GET `/api/me/trading-config`

Retorna configuração de trading da conta logada (defaults + override do escopo do usuário).

---

### POST `/api/me/trading-config`

Salva configuração de trading da conta logada.

---

### GET `/api/admin/overview`

Retorna a visão administrativa agregada do sistema.

**Response:**
```json
{
  "summary": {
    "totalUsers": 1,
    "activeUsers": 1,
    "totalWallets": 1,
    "totalPnlSol": 0.42,
    "activePositions": 2,
    "botMode": "SIMULATION"
  },
  "users": [],
  "wallets": []
}
```

**Notas:**
- Requer role `ADMIN`
- Nesta primeira fase, a wallet atualmente conectada ao bot aparece como `LIVE`
- Wallets futuras entram como `PENDING_WALLET_ISOLATION` até a execução multiwallet ser conectada

---

### GET `/api/admin/users`

Lista operacional de usuários para o painel Admin.

**Response:**
```json
[
  {
    "id": 1,
    "email": "admin@example.com",
    "name": "Admin",
    "role": "ADMIN",
    "status": "ACTIVE",
    "accessOrigin": "allowlist",
    "billingStatus": "not-required",
    "walletCount": 1,
    "lastLoginAt": "2026-03-18T10:00:00.000Z",
    "createdAt": "2026-03-16T10:00:00.000Z"
  }
]
```

---

### POST `/api/admin/users`

Cria um novo usuário na base (via painel administrativo).

**Body exemplo:**
```json
{
  "email": "new.user@example.com",
  "name": "New User",
  "role": "USER",
  "status": "ACTIVE",
  "accessOrigin": "invite",
  "billingStatus": "pending",
  "invitedByUserId": 1
}
```

**Response (201):**
Retorna o objeto do usuário recém-criado.

---

### PATCH `/api/admin/users/:id/status`

Atualiza status da conta informada.

**Body exemplo:**
```json
{
  "status": "SUSPENDED"
}
```
*Valores aceitos*: `ACTIVE`, `PENDING`, `SUSPENDED`.

---

### PATCH `/api/admin/users/:id/role`

Atualiza a permissão (role) da conta. Um administrador não pode rebaixar a si próprio.

**Body exemplo:**
```json
{
  "role": "SUPPORT"
}
```
*Valores aceitos*: `ADMIN`, `USER`, `SUPPORT`.

---

### GET `/api/admin/users/:id/wallets`

Retorna as wallets vinculadas exclusivamente ao usuário informado.

---

### GET `/api/stats`

Retorna estatísticas gerais do bot.

**Response:**
```json
{
  "totalPositions": 45,
  "activePositions": 3,
  "closedPositions": 42,
  "totalInvested": 0.15,
  "wins": 28,
  "losses": 14,
  "winRate": "66.7",
  "circuitBreaker": {
    "isTripped": false,
    "tripReason": null,
    "dailyLoss": 0.0,
    "consecutiveFailures": 0
  }
}
```

**Campos:**
- `totalPositions` - Total de posições (ativas + fechadas)
- `activePositions` - Posições abertas no momento
- `closedPositions` - Posições já vendidas
- `totalInvested` - SOL total investido em posições ativas
- `wins` - Número de trades lucrativos
- `losses` - Número de trades com perda
- `winRate` - Taxa de sucesso em porcentagem
- `circuitBreaker.isTripped` - Se o CB está ativado
- `circuitBreaker.tripReason` - Motivo da ativação (se aplicável)
- `circuitBreaker.dailyLoss` - Perda acumulada hoje (SOL)
- `circuitBreaker.consecutiveFailures` - Falhas seguidas

---

### GET `/api/agent/postmortems`

Retorna a lista recente de autópsias operacionais.

**Query params:**
- `limit` (opcional, default backend)

**Uso atual:**
- abastece o card de pós-mortem no dashboard premium
- abastece a visualização resumida do dashboard clássico

---

### GET `/api/agent/postmortem-summary`

Retorna um agregado operacional da fila de pós-mortem.

**Campos principais esperados:**
- backlog pendente
- concluídos
- falhas
- anomalias
- causas/razões dominantes
- lista recente resumida

**Uso atual:**
- card `Post-Mortem Insights`
- monitoria operacional do dashboard AI

---

### GET `/api/simulation/trades`

Retorna o histórico de trades simulados.

**Mudanças recentes no payload:**
- `postMortemStatus`
- `postMortemSummary`
- `postMortemAnalyzedAt`
- metadados de auditoria/anomalia de entrada e saída

Esses campos são usados para mostrar o contexto do trade no histórico e para diferenciar trades limpos de trades anômalos.

---

### GET `/api/positions`

Lista todas as posições ativas.

**Response:**
```json
[
  {
    "mint": "ABC123...",
    "bondingCurve": "XYZ456...",
    "buySignature": "sig123...",
    "buySolAmount": 0.05,
    "buyTokenAmount": 1000000,
    "buyTimestamp": 1707426000000,
    "takeProfit": 40,
    "stopLoss": 25,
    "isActive": true,
    "age": 3600000,
    "ageFormatted": "1h 0m"
  }
]
```

**Campos:**
- `mint` - Endereço do token
- `bondingCurve` - Endereço da bonding curve
- `buySignature` - Assinatura da transação de compra
- `buySolAmount` - SOL investido
- `buyTokenAmount` - Quantidade de tokens comprados
- `buyTimestamp` - Unix timestamp da compra (ms)
- `takeProfit` - % de lucro para venda automática
- `stopLoss` - % de perda para venda automática
- `isActive` - Se a posição está aberta
- `age` - Tempo desde compra (ms)
- `ageFormatted` - Tempo formatado (ex: "2h 15m")

---

### GET `/api/cb-status`

Status detalhado do Circuit Breaker.

**Response:**
```json
{
  "isTripped": false,
  "dailyLossSol": 0.0,
  "consecutiveFailures": 0,
  "tripReason": null,
  "lastResetTime": 1707426000000
}
```

**Campos:**
- `isTripped` - Se o CB está ativado
- `dailyLossSol` - Perda acumulada hoje
- `consecutiveFailures` - Contador de falhas seguidas
- `tripReason` - Motivo da ativação (string ou null)
- `lastResetTime` - Unix timestamp do último reset

---

### GET `/api/agent/stats`

Retorna status e métricas do agente de IA.

**Response:**
```json
{
  "enabled": true,
  "mode": "SIMULATION",
  "confidence": 82.5,
  "learningEnabled": true,
  "simulation": {
    "tradesAnalyzed": 34,
    "tradesRequired": 50,
    "winRateImprovement": 12.5,
    "nextOptimization": "16 trades remaining"
  },
  "mainnet": {
    "tradesAnalyzed": 0,
    "tradesRequired": 50,
    "winRateImprovement": 0,
    "nextOptimization": null
  },
  "rateLimited": false
}
```

---

### GET `/api/agent/trades`

Historical de trades do agente (ultimos 20).

**Response:**
```json
[
  {
    "token": "CATDOG",
    "timestamp": "14:28:15",
    "entryPrice": 0.00000123,
    "exitPrice": 0.00000185,
    "pnl": 0.0234,
    "confidence": 85,
    "status": "CLOSED_TP"
  }
]
```

---

### GET `/api/agent/patterns`

Padrões aprendidos pelo agente (regras de ouro).

**Response:**
```json
[
  {
    "name": "Skip tokens with liquidity below 3 SOL",
    "accuracy": 0,
    "count": 0,
    "avgProfit": 0
  }
]
```

---

### GET `/api/agent/logs`

Logs em tempo real do agente (filtrados do Winston).

**Response:**
```json
[
  {
    "timestamp": "2026-03-02 14:28:04",
    "level": "info",
    "message": "🔍 [RiskEngine] Analisando token 4uozP91B..."
  },
  {
    "timestamp": "2026-03-02 14:28:15",
    "level": "info",
    "message": "✅ [RiskEngine] Token 4uozP91B... → Score: 25/100 (ALLOW_TRADE)"
  }
]
```

**Notas:**
- Retorna as últimas 60 linhas filtradas por `[Agent]` ou `[RiskEngine]`
- Polling recomendado: a cada 2 segundos

---

## Erros

Todos os endpoints retornam erro 500 em caso de falha:

```json
{
  "error": "Descrição do erro"
}
```

**Causas comuns:**
- Arquivo `data/positions.json` não existe (primeira execução)
- Arquivo `circuit_breaker_state.json` corrompido
- Permissões de leitura insuficientes

---

## Exemplos de Uso

### JavaScript (Frontend)
```javascript
// Buscar estatísticas
const stats = await fetch('http://localhost:3001/api/stats')
  .then(res => res.json());

console.log(`Win Rate: ${stats.winRate}%`);
console.log(`CB Status: ${stats.circuitBreaker.isTripped ? 'ATIVADO' : 'OK'}`);

// Buscar posições ativas
const positions = await fetch('http://localhost:3001/api/positions')
  .then(res => res.json());

positions.forEach(pos => {
  console.log(`Token: ${pos.mint.substring(0, 8)}...`);
  console.log(`Investido: ${pos.buySolAmount} SOL`);
  console.log(`Idade: ${pos.ageFormatted}`);
});
```

### Python
```python
import requests

# Stats
response = requests.get('http://localhost:3001/api/stats')
stats = response.json()
print(f"Win Rate: {stats['winRate']}%")

# Positions
response = requests.get('http://localhost:3001/api/positions')
positions = response.json()
print(f"Posições ativas: {len(positions)}")
```

### cURL
```bash
# Stats
curl http://localhost:3001/api/stats | jq

# Positions
curl http://localhost:3001/api/positions | jq

# Circuit Breaker Status
curl http://localhost:3001/api/cb-status | jq
```

---

## Rate Limiting

Não há rate limiting implementado. A API é local e apenas o frontend deve acessá-la.

---

## CORS

CORS está habilitado para todos os origins (`cors()`).

Isso permite que o frontend acesse a API de qualquer origem.

---

## Extensão Futura

### Endpoints Planejados (Opcional)

#### POST `/api/positions/:mint/close`
Fechar posição manualmente.

#### GET `/api/trades/history`
Histórico de todos os trades.

#### GET `/api/stats/daily`
Estatísticas por dia (últimos 30 dias).

#### WebSocket `/ws`
Stream em tempo real de eventos (compras, vendas, alertas).
