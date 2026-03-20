# Avaliacao — Alerta de Limitacao de Banda (Contabo)

**Data/Hora da avaliacao local:** 20/03/2026 10:25 (UTC-3, Brasilia)  
**Data/Hora do snapshot no VPS:** 20/03/2026 11:50-11:55 (UTC-3, equivalente a 15:50-15:55 no host)  
**Servidor afetado:** Cloud VPS 10 SSD — `YOUR_VPS_IP`  
**Provedor:** Contabo

> [!NOTE]
> Este documento registra o diagnostico local + VPS que embasou a mitigacao.
> As medidas efetivamente aplicadas depois da avaliacao estao em [MITIGACAO_BANDA_E_MONITORAMENTO_2026-03-20.md](./MITIGACAO_BANDA_E_MONITORAMENTO_2026-03-20.md).

---

## 1. Resumo executivo

A nova avaliacao, feita **no repositorio local** e **diretamente no VPS**, indica que o alerta de banda **nao deve ser atribuido a uma unica causa**.

No estado atual, os fatores mais provaveis sao:

1. **Monitoramento gRPC em tempo real com escopo amplo**, porque o bot esta configurado no VPS com `MONITORING_PROTOCOL=BOTH` e multiplos protocolos habilitados ao mesmo tempo.
2. **Alto volume de eventos processados e logados pelo bot**, visivel nos logs recentes do VPS, com varias transacoes por segundo sendo impressas.
3. **Fan-out de chamadas externas em HTTPS** para Solana/Telegram/outros provedores, visivel nas conexoes ativas do processo do bot.
4. **Historico de leitura de logs pelo dashboard**, que ja foi um problema real no projeto, mas **nao apareceu como causa dominante no snapshot atual**.

Conclusao pratica: o risco de novo alerta da Contabo continua existindo **enquanto o bot permanecer monitorando varios protocolos em tempo real e emitindo logs muito detalhados no VPS**.

---

## 2. Evidencias locais

### 2.1 O bot local nao estava em execucao

No ambiente local nao havia processo ativo do bot nem do PM2 no momento da checagem. Isso reforca que o consumo relevante esta no **VPS remoto**, nao nesta maquina.

### 2.2 O stream gRPC existe, mas nao e um subscribe irrestrito da rede inteira

O codigo usa Yellowstone gRPC com reconexao automatica, mas a inscricao e montada com filtros por programa em `req.transactions.*`.

Isso significa:

- o diagnostico anterior estava **correto ao apontar gRPC como fonte importante de trafego**
- mas estava **forte demais** ao afirmar que o bot recebia "todas as transacoes da Solana" sem filtro

O problema real nao e ausencia total de filtro. O problema real e que o filtro ainda esta **amplo demais para o plano VPS**, especialmente com varios protocolos ativos.

### 2.3 O pool de RPC nao usa todos os endpoints ao mesmo tempo por design

O `rpcPool` trabalha com **1 endpoint atual + failover**. Portanto, a mera existencia de 7 fallbacks nao prova uso simultaneo continuo.

Mesmo assim, muitos endpoints continuam relevantes porque:

- aumentam a superficie de retries/failover
- ampliam a quantidade de destinos externos disponiveis
- facilitam bursts em periodos de erro ou rotacao

### 2.4 O problema historico do dashboard e real, mas ja foi mitigado em codigo

O projeto registra no changelog que houve um vazamento de banda/CPU no `dashboard-api` ao ler o `bot.log` inteiro, e que isso foi corrigido com leitura por `tail`.

Portanto:

- **isso ja foi causa real no passado**
- **nao deve ser tratado como causa principal atual sem medir o VPS**

---

## 3. Evidencias do VPS

### 3.1 Processos ativos

No snapshot remoto:

- `bot`: **online**, uptime ~83-85 min
- `dashboard-api`: **online**, uptime ~16 h

Tambem foi observado historico elevado de restarts no PM2 desde a criacao dos processos:

- `bot`: **50 restarts**
- `dashboard-api`: **29 restarts**

Isso nao prova, por si so, pico de banda, mas mostra que o ambiente merece observacao mais rigorosa.

### 3.2 Configuracao remota efetiva

O `.env` ativo no VPS mostrou:

- `MONITORING_PROTOCOL=BOTH`
- `METEORA_DBC_MONITORING_ENABLED=true`
- `BONK_FUN_MONITORING_ENABLED=true`
- `DAOS_FUN_MONITORING_ENABLED=true`
- `MOONSHOT_MONITORING_ENABLED=true`
- `AUTO_BUY_ENABLED=false`
- `AGENT_MODE=SIMULATION`
- `RPC_FALLBACK_COUNT=7`
- `WS_FALLBACK_COUNT=3`

Em outras palavras: **mesmo sem compra automatica ativa**, o bot continua operando como monitor realtime de alta cobertura.

### 3.3 Logs remotos muito acima do local

No VPS, o diretorio `logs` estava com aproximadamente **1.4 GB**. Isso e um sinal claro de processamento intenso e prolongado.

Nos logs recentes do `bot`, o processo estava registrando diversas transacoes em sequencia, com varios eventos no mesmo segundo.

Isso sugere que o bot nao esta ocioso: ele continua recebendo e processando fluxo relevante de dados.

### 3.4 Medicao instantanea de rede no VPS

Na amostra de 5 segundos da interface principal:

- **RX:** ~`1.194 Mbit/s`
- **TX:** ~`0.060 Mbit/s`

Interpretacao:

- no instante medido, o VPS estava **recebendo** bem mais dados do que enviando
- isso combina com um padrao de **feed/stream externo entrando no bot**
- nao combina com um caso de dashboard publico sendo fortemente consumido naquele exato momento

### 3.5 Portas e sessoes no momento da checagem

No snapshot:

- `80/tcp` e `443/tcp` estavam expostas
- `3001/tcp` estava escutando apenas em `127.0.0.1`
- nao havia uma quantidade relevante de clientes ativos em `80/443` naquele exato instante
- havia varias conexoes `ESTABLISHED` saindo do processo `node` do bot para destinos em `443`

Isso aponta mais para **trafego de integracoes externas do bot** do que para **usuarios navegando no dashboard** no momento da coleta.

### 3.6 Endpoint do dashboard nao estava aberto anonimamente

As chamadas locais ao `dashboard-api` para `/api/agent/logs` e `/api/stats` retornaram `{"error":"Unauthorized"}` sem credenciais.

Isso reduz a probabilidade de que o dashboard publico, sozinho, esteja causando o alerta atual por acesso anonimo em massa.

---

## 4. Diagnostico atualizado

### 4.1 Causa mais provavel hoje

A causa mais provavel do alerta atual e a combinacao de:

1. **gRPC realtime ativo**
2. **monitoramento multi-protocolo ao mesmo tempo**
3. **alto volume de logs por transacao**
4. **chamadas continuas para varios servicos externos**

### 4.2 Causa que deve sair do topo da lista

O problema antigo de leitura integral do `bot.log` pelo dashboard **nao deve mais ser tratado como causa principal atual** sem nova evidencia de acesso pesado ao painel.

Ele foi relevante historicamente, mas o snapshot de hoje nao mostrou isso como o principal vetor.

### 4.3 Risco estrutural

Mesmo que a taxa instantanea observada nao esteja alta o suficiente para explicar sozinha um throttle imediato, o alerta da Contabo fala em **consumo sustentado por dias**.

Ou seja, o risco nao e apenas pico curto. O risco e o **acumulo permanente de trafego 24/7** por um bot configurado para observar varios fluxos simultaneos.

---

## 5. Como evitar novo alerta da Contabo

### 5.1 Acoes imediatas no VPS

1. **Reduzir o escopo de monitoramento para um unico protocolo**

   Ajuste recomendado:

   - `MONITORING_PROTOCOL=PUMPFUN`
   - `METEORA_DBC_MONITORING_ENABLED=false`
   - `BONK_FUN_MONITORING_ENABLED=false`
   - `DAOS_FUN_MONITORING_ENABLED=false`
   - `MOONSHOT_MONITORING_ENABLED=false`

   Isso deve ser a medida de maior impacto imediato sem desligar completamente o bot.

2. **Se o bot nao precisar ficar monitorando 24/7, parar temporariamente**

   Se o objetivo atual for apenas preservar banda e encerrar o risco com a Contabo, a medida mais segura e:

   - `pm2 stop bot`

   Depois religar apenas quando o escopo estiver reduzido.

3. **Parar de logar cada transacao individual em nivel `info`**

   Hoje o bot continua imprimindo blocos detalhados de `TYPE`, `MINT`, `SIGNER`, `TOKEN AMOUNT`, `SOL AMOUNT`, `SIGNATURE` etc.

   Isso nao e a principal origem de banda da Contabo, mas:

   - aumenta I/O
   - aumenta custo de leitura de logs
   - dificulta operacao
   - piora qualquer polling de terminal/dashboard

   Recomendacao:

   - manter em `info` apenas eventos de descoberta relevante, decisao, trade, erro e saude
   - mover logs por transacao bruta para `debug`

4. **Limpar e arquivar logs antigos no VPS**

   O volume de `logs/` em ~1.4 GB e excessivo para operacao diaria.

   Recomendacao operacional:

   - arquivar o que precisa
   - remover rotacoes antigas fora da janela necessaria
   - revisar se o PM2 e o Winston estao retendo mais do que o esperado em runtime

### 5.2 Acoes de curto prazo no codigo

1. **Criar um modo de monitoramento enxuto para producao**

   Exemplo:

   - `MONITORING_PROFILE=LOW_BANDWIDTH`

   Comportamento esperado:

   - monitorar apenas PumpFun
   - desabilitar lanes nao essenciais
   - reduzir backfills e consultas auxiliares
   - desabilitar logs verbosos

2. **Separar monitoramento de execucao**

   Se o bot estiver em `SIMULATION`, ele nao precisa necessariamente varrer todos os protocolos em alta frequencia.

   Recomendacao:

   - modo `SIMULATION` com escopo minimo
   - modo `LIVE` apenas quando realmente houver janela operacional

3. **Revisar chamadas auxiliares por token**

   Sempre que um token passa pelo pipeline, ha potencial de consultas extras a servicos como metadata, risk providers, Jupiter, Shyft, Moralis etc.

   Recomendacao:

   - cache mais agressivo
   - rate limiting por token
   - short-circuit antes de chamar provedores externos quando o token ja falhou em filtros basicos

### 5.3 Acoes de infraestrutura

1. **Instalar monitoracao real de banda no VPS**

   Exemplo:

   - `vnstat`
   - alertas diarios de RX/TX
   - historico por interface

   Sem historico de banda, voce fica dependente do aviso da Contabo para descobrir degradacao.

2. **Restringir o dashboard**

   Embora o dashboard nao tenha aparecido como principal causa no snapshot atual, ele continua sendo uma superficie de trafego.

   Recomendacao:

   - acesso apenas autenticado
   - idealmente restrito por IP, VPN, Tailscale ou tunnel privado
   - evitar deixar o painel aberto continuamente sem necessidade

3. **Se o objetivo for multi-protocolo realtime permanente, subir de tier**

   Se a estrategia exige monitorar PumpFun + Meteora + Bonk + daos + Moonshot em tempo real continuamente, o risco e estrutural para um VPS com politica agressiva de banda compartilhada.

   Nesse caso, considere:

   - VDS
   - servidor dedicado
   - provedor de dados gerenciado com entrega filtrada

---

## 6. Resposta mais segura para a Contabo

> "Realizamos nova analise local e diretamente no VPS afetado. Identificamos que o consumo elevado de banda esta associado principalmente ao monitoramento em tempo real de eventos on-chain da Solana, combinado com processamento simultaneo de multiplos protocolos e alto volume de logs operacionais. Ja estamos reduzindo o escopo do monitoramento para apenas os fluxos essenciais, diminuindo a verbosidade dos logs e revisando o uso continuo do bot em tempo real. Solicitamos a restauracao da largura de banda apos essa otimizacao."

Essa resposta e mais segura do que afirmar que o problema era apenas o Yellowstone ou que todas as medidas ja estavam aplicadas antes da validacao no VPS.

---

## 7. Conclusao final

Se a prioridade for **nao receber novo alerta da Contabo**, a ordem correta de acao e:

1. **Desligar imediatamente os protocolos nao essenciais**
2. **Operar com um unico protocolo por vez**
3. **Reduzir logs por transacao**
4. **Monitorar banda diariamente no VPS**
5. **So voltar ao modo multi-protocolo se houver infraestrutura compativel**

No estado atual, o maior risco nao e um bug isolado. O maior risco e a **configuracao operacional ampla demais para o tipo de VPS contratado**.
