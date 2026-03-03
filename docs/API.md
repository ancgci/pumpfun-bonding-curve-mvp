# Dashboard API Reference

Base URL: `http://localhost:3001/api`

## Endpoints

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
