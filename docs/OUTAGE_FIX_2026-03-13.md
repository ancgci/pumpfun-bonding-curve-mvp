# Post-Mortem & Fixes: Trading Stoppage e Log Spam (13-Mar-2026)

## 1. Problema 1: Bot Parou de Executar Trades

Após o deploy das novas camadas de análise (Technical Analysis V2 e Organicity Protection), o bot parou de realizar compras. 

### Causa Raiz
As novas camadas criaram 7 estágios de aprovação em cascata. Múltiplos filtros atuavam como *hard blocks* (bloqueios definitivos) e alguns possuíam limites padronizados (defaults) muito estritos, impedindo que tokens recém-lançados na PumpFun avançassem no pipeline de decisão.
As principais barreiras eram:
1. O score de organicidade estava rodando em modo reativo em vez de modo *shadow*.
2. Spikes de volume precisavam de um avanço de preço irrealista para não serem invalidados (0.5%).
3. O orquestrador chamava a análise de organicidade usando *defaults* restritivos (como `minUniqueWalletsLifetime: 10`) ignorando as configurações permissivas do `ta-config.json`.
4. A janela temporal de micro-confirmação (5 segundos) exigia tolerâncias irreais de *score drop* (-20) e concentração de carteiras.

### Solução (Flexibilização em 5 Fases)
1. **Ativação de Shadow Mode**: Inclusão de `ORGANICITY_SHADOW_MODE=true` no `.env`, mudando o perfil da organicidade de "bloqueador" para "observador".
2. **Atualização do `ta-config.json`**: Flexibilizamos os limites no modo "AGGRESSIVE", como `volumeSpikeFollowMinPct` para 0.1% e ampliação de cooldowns/stops.
3. **Override no Orquestrador**: Atualizamos `utils/agentOrchestrator.ts` para repassar parâmetros complacentes (`minTrades20s: 3`, `minUniqueWalletsLifetime: 5`, tolerâncias de R2/Repetição afrouxadas).
4. **Alívio da Micro-Confirmação**: Encurtamos a janela no `utils/microConfirmation.ts` para 3s e dobramos a complacência em *drop score* e limite Top1 Wallet (de 60% para 75%).
5. **Volume Spike Fix**: Em `utils/technicalScore.ts`, deixamos de penalizar dinâmicas orgânicas de mercado onde o follow-through inicial é pequeno.

---

## 2. Problema 2: Spam no Live Terminal do Dashboard

O *Live Terminal* na interface web ficou inutilizável devido ao excesso de prints constantes de avaliações do Risk Engine inundando a tela.

### Causa Raiz
O `utils/riskEngine.ts` enviava um log de nível `info` explícito no formato `✅ [RiskEngine] ... ALLOW_TRADE` toda vez que um token passava pelo motor. A API do dashboard (`dashboard-api/server.ts`), por sua vez, realizava um comando simples de leitura baseada nas flags `[RiskEngine]`.

### Solução
1. **Transição de Cargo**: Convertemos as validações simples e pacíficas de admissão (`ALLOW_TRADE` / `ALLOW_ALERT`) no `utils/riskEngine.ts` para *logger debug*, mantendo estritamente bloqueios ou erros graves no *logger info* e error.
2. **Filtro na API**: Fortificamos o extrator do `dashboard-api/server.ts` de:
`grep -hE "\[Agent\]|\[RiskEngine\]|\[WHALE ALERT\]"` 
Para adicionar o demilitador:
`... | grep -v "ALLOW_TRADE"` 

Isso blindou definitivamente as listagens, polindo visualmente os trades que importam sem danificar ou apagar a geração dos dados para a auditoria de backtest.
