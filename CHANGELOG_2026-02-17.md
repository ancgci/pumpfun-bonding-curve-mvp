# Changelog — 2026-02-17

## 🛡️ Risk Engine — Anti-Rug Post-Curve Module

### Novos Arquivos

| Arquivo | Descrição |
|---|---|
| `utils/riskConfig.ts` | Configuração central: tipos, interfaces, pesos, thresholds e defaults do `.env` |
| `utils/riskEngine.ts` | Orquestrador principal com `analyzeToken()` e `formatRiskForTelegram()` |
| `utils/riskEngine/tokenAuthorities.ts` | Verifica Mint Authority, Freeze Authority, Token-2022 e extensões via `getParsedAccountInfo` |
| `utils/riskEngine/liquidityAnalyzer.ts` | Análise de LP lock/burn (via rugcheck.xyz), liquidez mínima e ratio L/MarketCap |
| `utils/riskEngine/holderAnalyzer.ts` | Distribuição de holders: Top-10%, dev wallet, detecção de clusters (bundling) |
| `utils/riskEngine/tradingSanity.ts` | Volume fake, buy/sell imbalance, price impact e honeypot simulation via Jupiter quote |
| `utils/riskEngine/postCurveMonitor.ts` | Monitor pós-curva: re-verifica authorities e LP a cada 30s por 10 min |
| `utils/riskEngine/contractAge.ts` | Filtro de idade do contrato (<1h) + **Fix HTML Sanitization** |
| `utils/riskEngine/metadataCheck.ts` | Validação de metadados (imagem, descrição e redes sociais) |
| `index.ts` (modificado) | Strict LP Blocking + **HTML Sanitization** (previne crashes no Telegram) |
| `test/testRiskEngine.ts` | 50 unit tests determinísticos para scoring, decisão e formato Telegram |
| `test/testTokenAuthorities.ts` | 14 integration tests com RPC real (USDC, Wrapped SOL, token inválido) |
| `test/testPostCurveMonitor.ts` | 8 lifecycle tests para start/stop/stopAll/callback |
| `test/testAdditionalFilters.ts` | 12 unit tests para Contract Age e Metadata Quality |
| `docs/RISK_ENGINE.md` | Documentação completa: arquitetura, filtros, tuning, config reference |

### Arquivos Modificados

#### `utils/circuitBreaker.ts`
- **Adicionado**: `recordHoneypot(deployerPattern)` — blacklista deployer por 24h com alerta Telegram
- **Adicionado**: `isDeployerBlocked(deployerPattern)` — verifica se deployer está bloqueado
- **Adicionado**: `recordRugSignal()` — rastreia sinais de rug; 2 em 3 min → pause de 10 min
- **Adicionado**: `triggerLPDropExit(tokenMint, dropPercent)` — alerta emergencial quando LP cai
- **Modificado**: `canTrade()` — agora verifica rug pause além do trip status
- **Modificado**: `getStatus()` — retorna `honeypotBlacklistSize`, `rugPauseActive`, `rugPauseRemainingMs`

#### `utils/hybridExecutor.ts`
- **Adicionado**: Import de `analyzeToken` e `RISK_CONFIG`
- **Adicionado**: Risk Engine gate antes de `buyOnPumpFun()`:
  - `BLOCK` → cancela trade e registra honeypot no circuit breaker
  - `ALLOW_ALERT` → reduz tamanho do trade em 50% (configurável)
  - `ALLOW_TRADE` → trade na integra
- **Modificado**: `buyOnPumpFun()` agora recebe `tradeSolAmount` em vez de `BUY_AMOUNT_SOL` fixo

#### `index.ts`
- **Adicionado**: Imports de `analyzeToken`, `formatRiskForTelegram`, `RISK_CONFIG`, `postCurveMonitor`, `circuitBreaker`
- **Adicionado**: Bloco `Risk Engine Analysis` em `processPumpFunTransaction()`:
  - Executa `analyzeToken()` antes do alerta Telegram
  - `formatRiskForTelegram()` gera seção de risco no alerta
  - `postCurveMonitor.startMonitoring()` inicia monitor para trades aprovados
  - Registra honeypots no circuit breaker
- **Modificado**: Formato do alerta Telegram agora inclui score, flags, métricas e razões

#### `.env`
- **Adicionado**: 30+ variáveis `RISK_*` para configuração do Risk Engine:
  - Pesos de score (`RISK_WEIGHT_*`)
  - Thresholds de decisão (`RISK_THRESHOLD_*`)
  - Limites de detecção (`RISK_MIN_LIQUIDITY_SOL`, `RISK_TOP10_MAX_PERCENT`, `RISK_MIN_AGE_HOURS`, etc.)
  - Configuração via 30+ variáveis `RISK_*` no `.env`
  - **Novo**: Strict LP Blocking (`RISK_BLOCK_UNLOCKED_LP=true`) - sem alert/trade para unlocked LP
  - Anti-rug circuit breaker (`RISK_HONEYPOT_BLOCK_HOURS`, `RISK_RAPID_RUG_*`)
  - Ajuste de trading (`RISK_TRADE_SIZE_REDUCTION_MED`)

### Novo Formato de Alerta Telegram

**Antes:**
```
🚨 ALERTA PUMPFUN - 97.7%+ 🚨

Token: TokenName
Symbol: TKN
Source: 🚀 PumpFun
Market Cap: $45,000
Current Price: 0.000012345 SOL
Curve Progress: 98.5 %
```

**Depois:**
```
🚨 ALERTA PUMPFUN - 97.7%+ 🚨

Token: TokenName
Symbol: TKN
Source: 🚀 PumpFun

✅ Risk: 25/100 (LOW)
🔒 Flags: MintAuth=OFF | FreezeAuth=OFF | LP=Locked✅
💧 LP: 15.2 SOL | L/M: 0.080
👥 Holders: 245 | Top10: 35.0% | Dev: 2.1%
📊 B/S: 1.30 | Cluster: NO
⚡ LP não lockado — risco de rug pull

Market Cap: $45,000
Current Price: 0.000012345 SOL
Curve Progress: 98.5 %
```

### Testes

| Suite | Testes | Resultado |
|---|---|---|
| `testRiskEngine.ts` | 45 | ✅ All passed |
| `testTokenAuthorities.ts` | 14 | ✅ All passed |
| `testPostCurveMonitor.ts` | 8 | ✅ All passed |
| `testAdditionalFilters.ts` | 12 | ✅ All passed |
| **Total** | **84** | **✅ All passed** |

### Como Rodar os Testes

```bash
npx ts-node test/testRiskEngine.ts
npx ts-node test/testTokenAuthorities.ts
npx ts-node test/testPostCurveMonitor.ts
```

### Configuração

Todas as variáveis têm defaults sensíveis. Para ajustar, edite `.env`:

```env
# Desabilitar Risk Engine (trade sem análise)
RISK_ENGINE_ENABLED=false

# Ajustar sensibilidade (mais trades, mais risco)
RISK_THRESHOLD_LOW=40
RISK_THRESHOLD_MED=70

# Reduzir penalização para LP não lockado
RISK_WEIGHT_NO_LP_LOCK=10
```

Veja **[docs/RISK_ENGINE.md](docs/RISK_ENGINE.md)** para guia completo de tuning.
