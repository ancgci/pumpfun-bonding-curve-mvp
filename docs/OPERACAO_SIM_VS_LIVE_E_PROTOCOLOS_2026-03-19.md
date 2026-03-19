# Operacao Sim vs Live, Protocolos e Diagnosticos

Data: 19/03/2026

## Objetivo

Consolidar o que foi analisado, explicado e alterado localmente sobre:

- comportamento do bot em `SIMULATION` e `LIVE`
- confiabilidade dos controles do painel
- motivo de o bot aparentar estar ligado, mas parado
- protocolos extras alem do `PumpFun`
- causa mais provavel do aumento de CPU

## 1. Incidente do bot "ligado, mas parado"

### Sintoma observado

- o painel mostrava `Bot On` ou `Bot Live`
- os logs paravam de avançar
- o processo no PM2 continuava `online`

### Causa mais provavel

O processo do bot continuava vivo, mas o stream gRPC podia ficar preso ou silencioso sem cair formalmente.

Antes da correcao:

- o selo do dashboard considerava basicamente `agent enabled`
- isso nao garantia que o stream estava recebendo eventos
- `/api/bot-health` tambem nao provava atividade real do monitor

### Correcao aplicada localmente

- heartbeat real do bot
- registro de `lastStreamEventAt`
- watchdog de inatividade do stream
- reconnect forcado quando o stream fica silencioso por tempo demais
- novo resumo de saude no dashboard

Arquivos principais:

- [index.ts](/home/srant/projects/pumpfun-bonding-curve-Test/index.ts)
- [utils/botRuntimeHealth.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/botRuntimeHealth.ts)
- [dashboard-api/server.ts](/home/srant/projects/pumpfun-bonding-curve-Test/dashboard-api/server.ts)
- [dashboard/src/hooks/useDashboardData.tsx](/home/srant/projects/pumpfun-bonding-curve-Test/dashboard/src/hooks/useDashboardData.tsx)
- [dashboard/src/components/premium/PremiumDashboardPage.tsx](/home/srant/projects/pumpfun-bonding-curve-Test/dashboard/src/components/premium/PremiumDashboardPage.tsx)

## 2. `/api/bot-health` e seguranca

### Comportamento confirmado

O endpoint `/api/bot-health` e protegido.

Por isso:

- abrir a URL direto no navegador retorna `Unauthorized`
- `curl http://127.0.0.1:3001/api/bot-health` sem bearer token tambem retorna `Unauthorized`

### Decisao mantida

O endpoint nao deve ser aberto publicamente, nem "so para teste".

## 3. Bug ao desligar o bot e mexer nos Settings

### Sintoma observado

Ao desligar o bot pelo dashboard, os settings pareciam nao aceitar ajuste ou voltavam para valores anteriores.

### Causa

O formulario local era sobrescrito quando o dashboard fazia `refreshData()` depois do toggle do bot.

Ou seja:

- o usuario editava localmente
- o backend respondia com a config persistida anterior
- o formulario era reidratado e parecia "travar" ou reverter

### Correcao aplicada localmente

Foi adicionado controle de estado `isDirty` no formulario.

Resultado:

- enquanto o usuario esta editando, o refresh nao atropela o formulario
- depois de salvar, a sincronizacao volta ao normal

Arquivo principal:

- [TradingParameters.tsx](/home/srant/projects/pumpfun-bonding-curve-Test/dashboard/src/components/dashboard/TradingParameters.tsx)

## 4. Como o bot opera em `SIMULATION`

### Resumo

No `SIMULATION`, o bot:

- monitora eventos on-chain
- entra em discovery para tokens dentro da faixa de interesse
- passa pelo pipeline de risco e IA
- se a decisao for `BUY`, grava uma trade simulada
- depois abre um monitor periodico para acompanhar saida

### Importante

O `SIMULATION` nao e um espelho perfeito do `LIVE`.

Ele tem comportamento mais "inteligente" e mais flexivel para laboratorio.

### Regras importantes do `SIMULATION`

- `Min AI Confidence`: e afrouxado em 20 pontos, com piso 50
- `Take Profit`: funciona como piso minimo, nao como alvo exato
- `Stop Loss`: vale para novas simulacoes, mas o estado fica congelado na abertura daquela trade
- `Auto Sell TP/SL`: tambem ficam congelados por trade simulada
- `Single Trade`: nao e obedecido globalmente quando a IA esta em simulacao; ele so evita duplicar o mesmo token
- `Slippage`: nao e relevante para simulacao
- `Jito Tip`: nao e relevante para simulacao
- `Partial Sell %`: nao e confiavel como controle de simulacao

### Consequencia pratica

Se o admin ligar `Single Trade` e ainda assim surgirem varias simulacoes em tokens diferentes, isso esta alinhado com o codigo atual.

## 5. Como o bot opera em `LIVE`

### Resumo

No `LIVE`, o bot:

- monitora eventos
- passa pelo pipeline de discovery, risco e IA
- se aprovado, executa ordem real pelo executor hibrido

### Regra conceitual

Em `LIVE`, o painel deve ser tratado como a fonte de verdade para os parametros operacionais:

- `Buy Amount`
- `Take Profit`
- `Stop Loss`
- toggles de auto sell

### Ponto importante da analise atual

O `LIVE` hoje nao e 100 por cento identico ao que a tela sugere em todos os casos.

Em especial:

- alguns controles atuam sobre novas posicoes
- alguns toggles atuam no monitoramento em runtime
- o `SIMULATION` continua mais flexivel que o `LIVE`

## 6. Controles do painel: o que reflete e o que nao reflete perfeitamente

### Controles que salvam e entram no runtime

Os valores do painel sao persistidos e entram no runtime da carteira ativa sem restart.

### Em `SIMULATION`

- `Bot Power`: seguido
- `Trading Mode`: seguido
- `AI Agent`: seguido
- `Buy Amount`: seguido
- `Min AI Confidence`: seguido com afrouxamento
- `Take Profit`: seguido como piso
- `Stop Loss ON/OFF`: seguido para novas trades
- `Auto Sell TP/SL`: seguido para novas trades
- `Single Trade`: nao seguido globalmente
- `Slippage`: nao relevante
- `Jito Tip`: nao relevante
- `Partial Sell %`: nao confiavel

### Em `LIVE`

- `Buy Amount`: reflete em novas compras
- `Take Profit`: reflete para novas posicoes
- `Stop Loss %`: reflete para novas posicoes
- `Stop Loss ON/OFF`: influencia o runtime, mas deve ser tratado com cautela conceitual
- `Auto Sell TP/SL`: influencia o runtime
- `Min AI Confidence`: reflete de forma mais fiel que no `SIMULATION`
- `Slippage`: nao e absoluto; pode ser substituido por slippage adaptativo
- `Jito Tip`: so faz diferenca se a ordem sair via Jito
- `Partial Sell %`: vende parcial, mas o restante da posicao nao fica bem rastreado

## 7. Por que o `SIMULATION` "aprende mais"

O `SIMULATION` pode ser mais flexivel do que o painel:

- aceita variacoes mais exploratorias
- permite maior diversidade de cenarios
- ajuda a IA a acumular contexto sobre entradas, filtros e saidas

### Ponto importante

Alinhar `SIMULATION` e `LIVE` nao impede aprendizado.

O que muda e:

- a IA perde liberdade operacional para testar mais variacoes durante a simulacao
- o sistema ganha previsibilidade

## 8. Protocolos extras: estado antes desta alteracao local

### Confirmado

Antes da alteracao local:

- `Meteora DBC`
- `Bonk.fun`
- `Daos.fun`
- `Moonshot`

eram monitorados no stream e podiam gerar alertas, mas nao entravam no pipeline completo de IA/simulacao.

Ou seja:

- apareciam em logs
- podiam disparar alertas
- nao geravam trade simulada pela IA
- nao operavam de verdade em `LIVE`

### Motivo

So o handler do `PumpFun` estava ligado ao pipeline completo:

- discovery
- risk engine
- decisao da IA
- simulacao ou execucao

## 9. O que foi feito localmente para os protocolos extras

### Objetivo

Ativar primeiro o uso desses protocolos em `SIMULATION`, sem ligar execucao real.

### Implementacao local

Foi criado um fluxo compartilhado de descoberta para protocolos alternativos:

- prepara `tokenAnalysis`
- chama `analyzeToken()`
- chama `getAgentDecision()`
- chama `executeAgentTrade()`

Mas esse fluxo so roda se:

- `AGENT_ENABLED=true`
- `AGENT_MODE=SIMULATION`

Arquivos principais:

- [index.ts](/home/srant/projects/pumpfun-bonding-curve-Test/index.ts)

### Resultado esperado

Depois do deploy desse patch:

- `Meteora DBC`, `Bonk.fun`, `Daos.fun` e `Moonshot` poderao gerar simulacoes da IA
- em `LIVE`, continuam sem operacao real

### O que ainda nao foi feito

Ainda nao existe executor real por protocolo para:

- compra
- venda
- gestao de posicao

Logo, `LIVE` para esses protocolos ainda nao foi habilitado.

## 10. Analise do aumento de CPU

### Sintoma observado

As capturas mostravam carga alta sustentada mesmo sem um processo unico isolado aparecendo com uso explosivo no `htop`.

### Causas mais provaveis

#### 1. Decodificacao multi-protocolo por evento

Com `MONITORING_PROTOCOL=BOTH`, o stream alimentava varios pipelines.

Sem filtro fino por correspondencia do Yellowstone, havia custo de parse e tentativa de decode em mais de um handler por evento.

### Correcao local aplicada

O stream passou a respeitar `data.filters` quando presente para rotear cada evento apenas ao handler correspondente.

Arquivo:

- [index.ts](/home/srant/projects/pumpfun-bonding-curve-Test/index.ts)

#### 2. Consultas de curva sem cache nos protocolos extras

Os protocolos extras faziam leitura de `getAccountInfo()` da bonding curve sem cache/limiter equivalente ao `PumpFun`.

Isso podia multiplicar chamadas RPC e custo por evento.

### Correcao local aplicada

Foi criado um cache/limiter compartilhado:

- [protocolCurveBalance.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/protocolCurveBalance.ts)

E os arquivos abaixo passaram a usalo:

- [getMeteoraDBCBonding.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/getMeteoraDBCBonding.ts)
- [getBonkFunBonding.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/getBonkFunBonding.ts)
- [getDaosFunBonding.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/getDaosFunBonding.ts)
- [getMoonshotBonding.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/getMoonshotBonding.ts)

#### 3. Muitas trades simuladas abertas ao mesmo tempo

Cada trade simulada aberta cria um monitor com `setInterval` a cada 10 segundos para consultar preco.

Se muitas trades ficam abertas ao mesmo tempo, a carga cresce de forma acumulativa.

Arquivo:

- [agentOrchestrator.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/agentOrchestrator.ts)

#### 4. Retomada de simulacoes no boot

No startup, todas as simulacoes abertas sao retomadas.

Se havia backlog grande, isso recria varios monitores de uma vez.

Arquivo:

- [agentOrchestrator.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/agentOrchestrator.ts)

#### 5. Backfill de historico no `PumpFun`

Cada discovery do `PumpFun` pode disparar backfill de historico para alimentar TA e organicidade.

Arquivo:

- [pumpfunHistory.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/pumpfunHistory.ts)

### Leitura sobre o PM2 nas capturas

As varias linhas `PM2 v6.0.1` no `htop` sao mais consistentes com threads/processos do ecossistema PM2 do que com varias instancias reais do bot.

## 11. Validacao local feita

Foi executado:

```bash
npm run typecheck
```

Resultado:

- `typecheck` passou

## 12. O que ainda falta para fechar o tema por completo

### Se quiser previsibilidade total para o admin

As proximas melhorias recomendadas sao:

- fazer `SIMULATION` obedecer `Single Trade` globalmente
- decidir explicitamente quais controles valem tambem para posicoes abertas
- alinhar a semantica de `SIMULATION` e `LIVE` quando o objetivo for teste operacional
- implementar executores reais para protocolos extras, um por um
- reduzir ainda mais custo de CPU com limites de simulacoes abertas e desacoplamento de monitoramento por protocolo

## 13. Resumo executivo

- o painel salvava configuracoes, mas nem todas eram refletidas de forma rigida em todos os modos
- `SIMULATION` e mais flexivel e nao replica exatamente o `LIVE`
- `Single Trade` nao era obedecido globalmente no `SIMULATION`
- protocolos extras estavam so em monitoramento e alerta
- agora, localmente, protocolos extras entram no pipeline da IA em `SIMULATION`
- a CPU alta foi provavelmente causada por parse multi-protocolo por evento, consultas de curva sem cache e acumulacao de monitores de trades simuladas
