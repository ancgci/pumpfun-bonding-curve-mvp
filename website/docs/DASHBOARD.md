# 📊 Dashboard - Guia Completo

## Visão Geral

O Dashboard é uma interface web que permite monitorar o bot em tempo real através do navegador.

**Acesso:** http://localhost:3001

---

## 🚀 Como Iniciar - Do Zero

### Configuração Inicial (Uma Vez)

1. **Certifique-se que o bot está instalado:**
```bash
cd C:\Users\srant\Documentos\Projetos\pumpfun-bonding-curve-Test
npm install
```

2. **Configure o `.env`** (se ainda não fez)

---

### Iniciando o Dashboard

#### Passo 1: Terminal do Bot

Abra um terminal e inicie o bot:
```bash
cd C:\Users\srant\Documentos\Projetos\pumpfun-bonding-curve-Test
npm start
```

**Deixe esse terminal ABERTO e RODANDO.**

---

#### Passo 2: Terminal do Dashboard

Abra um **NOVO** terminal (separado):

**No VS Code:**
- Pressione `Ctrl + Shift + '`
- Ou clique no `+` ao lado do terminal atual

**No Windows:**
- Abra um novo PowerShell ou CMD

---

#### Passo 3: Navegar para a Pasta

No novo terminal, execute:
```bash
cd C:\Users\srant\Documentos\Projetos\pumpfun-bonding-curve-Test\dashboard
```

Ou se já estiver na raiz do projeto:
```bash
cd dashboard
```

---

#### Passo 4: Iniciar o Servidor

```bash
npx ts-node server.ts
```

**Saída esperada:**
```
✅ Dashboard server rodando em http://localhost:3001
📊 API disponível em:
   - http://localhost:3001/api/stats
   - http://localhost:3001/api/positions
   - http://localhost:3001/api/cb-status
```

---

#### Passo 5: Abrir no Navegador

**Windows (via terminal):**
```bash
start http://localhost:3001
```

**Manual:**
- Abra Chrome, Edge ou Firefox
- Na barra de endereço, digite: `http://localhost:3001`
- Pressione Enter

---

## ✅ Resultado Final

### Terminal 1 - Bot
```
C:\...\pumpfun-bonding-curve-Test> npm start
🤖 Bot iniciado e monitorando...
✅ Carregando configurações...
```

### Terminal 2 - Dashboard
```
C:\...\dashboard> npx ts-node server.ts
✅ Dashboard server rodando em http://localhost:3001
```

### Navegador
```
http://localhost:3001
[Dashboard com estatísticas ao vivo]
```

---

## 📊 O Que o Dashboard Mostra

### Card 1: Estatísticas Gerais
- 💰 **Total Investido:** Soma de SOL em posições ativas
- 📊 **Taxa de Sucesso:** % de trades lucrativos
- ✅ **Vitórias:** Número de trades com lucro
- ❌ **Perdas:** Número de trades com prejuízo

### Card 2: Circuit Breaker
- 🟢 **Status:** Operacional / 🔴 Ativado
- **Perda Diária:** SOL perdido hoje
- **Falhas Consecutivas:** Contador de falhas
- **Motivo:** Por que foi ativado (se aplicável)

### Card 3: Posições Ativas
Para cada posição aberta:
- **Token:** Endereço do mint (primeiros 8 caracteres)
- **Tempo:** Quanto tempo desde a compra ("2h 15m")
- **Investido:** Quantidade de SOL
- **TP/SL:** Take Profit e Stop Loss configurados

---

## 🔄 Recursos

### Auto-Refresh
O dashboard atualiza **automaticamente a cada 5 segundos**.

### Design Responsivo
Funciona em desktop, tablet e mobile.

### Indicadores Visuais
- 🟢 Verde = Tudo OK
- 🔴 Vermelho = Circuit Breaker ativado
- Cards animados com hover

---

## 🛑 Como Parar

### Parar Dashboard
No Terminal 2 (dashboard), pressione:
```
Ctrl + C
```

### Parar Bot
No Terminal 1 (bot), pressione:
```
Ctrl + C
```

---

## 🆘 Troubleshooting

### Problema: "Port 3001 already in use"

**Causa:** A porta 3001 já está sendo usada por outro processo.

**Solução 1 - Encerrar processo existente:**
```bash
# Ver quem está usando a porta
netstat -ano | findstr :3001

# Encerrar processo (substitua <PID> pelo número)
taskkill /PID <PID> /F
```

**Solução 2 - Mudar porta:**
Edite `dashboard/server.ts`:
```typescript
const PORT = 3002; // Linha 7
```

E acesse: `http://localhost:3002`

---

### Problema: Dashboard não mostra dados

**Causa 1 - Bot não está rodando**
- ✅ Verifique Terminal 1
- ✅ Execute `npm start` se necessário

**Causa 2 - Sem dados ainda**
- ✅ Execute pelo menos 1 trade
- ✅ Arquivo `data/positions.json` será criado automaticamente

**Causa 3 - Arquivos corrompidos**
Delete e reinicie:
```bash
del data\positions.json
del circuit_breaker_state.json
# Reinicie o bot
```

---

### Problema: "Cannot find module"

**Causa:** Dependências não instaladas.

**Solução:**
```bash
cd C:\Users\srant\Documentos\Projetos\pumpfun-bonding-curve-Test
npm install
```

---

### Problema: Dashboard mostra "N/A"

**Causa:** Ainda não há dados suficientes.

**Solução:**
- Aguarde o bot executar alguns trades
- Circuit Breaker pode estar ativado (impede trades)
- Verifique se `AUTO_BUY_ENABLED=true` no `.env`

---

## 🎨 Customização

### Mudar Porta

Edite `dashboard/server.ts`:
```typescript
const PORT = 3002; // Mudar de 3001 para 3002
```

### Mudar Intervalo de Refresh

Edite `dashboard/public/app.js`:
```javascript
}, 5000); // Mudar de 5000 (5s) para outro valor
```

### Mudar Cores/Estilo

Edite `dashboard/public/style.css`

---

## 📁 Estrutura de Arquivos

```
/dashboard
  - server.ts              # Backend Express (API REST)
  /public
    - index.html           # Estrutura HTML
    - style.css            # Estilos CSS
    - app.js               # Lógica JavaScript
```

---

## 🔌 API Endpoints

O dashboard consome 3 endpoints REST:

### GET /api/stats
Retorna estatísticas gerais.

**Response:**
```json
{
  "totalPositions": 10,
  "activePositions": 2,
  "totalInvested": 0.10,
  "wins": 6,
  "losses": 2,
  "winRate": "75.0"
}
```

### GET /api/positions
Lista posições ativas.

**Response:**
```json
[
  {
    "mint": "ABC123...",
    "buySolAmount": 0.05,
    "buyTimestamp": 1707426000000,
    "ageFormatted": "2h 15m",
    "takeProfit": 40,
    "stopLoss": 25
  }
]
```

### GET /api/cb-status
Status do Circuit Breaker.

**Response:**
```json
{
  "isTripped": false,
  "dailyLossSol": 0.0,
  "consecutiveFailures": 0,
  "tripReason": null
}
```

---

## 💡 Dicas

### 1. Mantenha Ambos Rodando
- Bot no Terminal 1
- Dashboard no Terminal 2
- Ambos precisam estar ativos

### 2. Verifique Dados
Se não vir dados:
- Execute trades manualmente via `testBot.ts`
- Aguarde monitoramento automático detectar oportunidades

### 3. Use em Outra Máquina
Troque `localhost` pelo IP da máquina:
```
http://192.168.1.100:3001
```

---

## 📝 Próximos Passos

1. ✅ Inicie o dashboard
2. ✅ Monitore algumas horas
3. ✅ Ajuste parâmetros (TP/SL) baseado no que observar
4. ✅ Use o backtester para validar mudanças

**Dashboard é apenas monitoramento - ele NÃO controla o bot!**

---

*Para mais informações, consulte [USAGE.md](USAGE.md)*
