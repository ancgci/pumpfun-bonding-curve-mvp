# Governanca Adaptativa de Entrada - 20/03/2026

Status: implementado localmente, validado com typecheck e teste unitario, ainda sem deploy para a VPS.

## Objetivo

Aplicar a revisao da estrategia de entrada apos a analise das perdas observadas entre a noite de 19/03/2026 e a madrugada de 20/03/2026, sem voltar ao problema anterior de excesso de regras bloqueando trades validas.

O objetivo pratico foi:

- manter poucos bloqueios absolutos;
- transformar sinais tecnicos fracos em penalidade, recheck ou reducao de tamanho;
- impedir que alta confianca da IA, sozinha, force entrada com contexto tecnico pobre;
- preservar a agressividade do bot onde fizer sentido, mas sem bypass de risco estrutural.

## Diagnostico que motivou a mudanca

A analise da janela ruim mostrou um padrao recorrente:

- muitas entradas com `taScore` muito baixo ou zerado;
- varios casos com apenas 1 candle de `1s`;
- ausencia frequente de `volumeRelative`;
- decisao `BUY` com confianca alta mesmo quando a confirmacao tecnica era fraca.

Ou seja: o problema principal nao era apenas "seletividade alta". O problema era comprar cedo demais em setups com dado insuficiente, enquanto parte das regras mais duras historicamente tambem ja havia causado perda de trades boas em outros momentos.

## Principios aplicados

### 1. Poucos hard blocks

Foram mantidos como bloqueio estrutural apenas os casos que realmente representam risco operacional ou falta total de base para decidir, por exemplo:

- cooldown e pausa por stops consecutivos;
- ausencia total de candles (`BLOCK_INSUFFICIENT_DATA`);
- bloqueios estruturais do risk engine, como LP destravado ou score de risco alto;
- falhas graves de micro-confirmacao e validacao final de execucao.

### 2. O resto virou pressao e penalidade

Sinais como:

- distancia excessiva da VWAP;
- RSI sobrecomprado;
- ATR morto ou extremo;
- candle esticado;
- terceira perna sem pullback;
- spike de volume sem follow-through;
- pouco candle, pouco volume e pouca confirmacao;

deixaram de funcionar como veto automatico no caminho principal e passaram a pesar no score, na pressao do setup ou no tamanho da posicao.

### 3. Faixa intermediaria em vez de logica binaria

Foi criada uma governanca adaptativa de entrada com tres perfis:

- `FULL`
- `REDUCED`
- `PROBE`

O sistema agora decide entre:

- `ALLOW`
- `RECHECK`
- `BLOCK`

com base em confirmacao tecnica real, qualidade dos dados disponiveis, pressao acumulada dos bloqueios e score tecnico.

## O que mudou no codigo

### Novo modulo de governanca adaptativa

Arquivo:

- [adaptiveEntryGovernance.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/adaptiveEntryGovernance.ts)

Esse modulo centraliza a regra de decisao pos-LLM:

- calcula `dataQualityScore`;
- limita a confianca bruta da IA em `effectiveConfidence`;
- aumenta o requisito de confianca quando ha pouco dado;
- define os limiares de `FULL`, `REDUCED` e `PROBE`;
- prefere `RECHECK` em setups precoces em vez de reprovar de forma definitiva.

### Score tecnico menos binario

Arquivo:

- [technicalScore.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/technicalScore.ts)

O score passou a incorporar penalidades explicitas para:

- poucos candles;
- ausencia ou fraqueza de volume;
- follow-through fraco;
- confirmacao fina insuficiente.

Com isso, varias fraquezas tecnicas deixam de invalidar o setup por si so. Elas reduzem score e empurram o trade para `RECHECK`, `PROBE` ou `REDUCED`.

### Entry blocker menos destrutivo

Arquivo:

- [entryBlocker.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/entryBlocker.ts)

Os seguintes bloqueios passaram a ser tratados como `SOFT`:

- `BLOCK_VWAP_DISTANCE`
- `BLOCK_CANDLE_STRETCHED`
- `BLOCK_ATR_DEAD`
- `BLOCK_ATR_EXTREME`
- `BLOCK_RSI_OVERBOUGHT`
- `BLOCK_3RD_LEG`
- `BLOCK_VOLUME_SPIKE_NO_FOLLOW`

Isso reduz o risco de perder trade boa por excesso de veto estatico.

### Orquestracao pos-LLM com perfil de entrada

Arquivo:

- [agentOrchestrator.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/agentOrchestrator.ts)

O fluxo de compra agora:

1. revalida hard blocks;
2. calcula score tecnico;
3. avalia o perfil adaptativo (`FULL`, `REDUCED`, `PROBE`);
4. decide `ALLOW`, `RECHECK` ou `BLOCK`;
5. calcula o tamanho final usando:
   - confianca efetiva;
   - sizing tecnico do score;
   - teto do perfil de entrada.

Formula pratica:

- `positionMultiplier = min(confidenceMultiplier, technicalMultiplier, profileCap)`

Isso impede que uma confianca alta da IA anule um contexto tecnico fraco.

### Sizing propagado ate a execucao real e simulada

Arquivos:

- [hybridExecutor.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/hybridExecutor.ts)
- [simulationEngine.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/simulationEngine.ts)

O tamanho reduzido ou exploratorio agora nao fica apenas no log do orquestrador. Ele realmente segue ate:

- a compra real, quando estiver em `LIVE`;
- o registro da trade simulada, quando estiver em `SIMULATION`.

### Contexto persistido mais rico para post-mortem

Arquivos:

- [postMortemTypes.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/postMortemTypes.ts)
- [postMortemContext.ts](/home/srant/projects/pumpfun-bonding-curve-Test/utils/postMortemContext.ts)

O `decision_context` passou a registrar tambem:

- `rawConfidence`
- `effectiveConfidence`
- `entryProfile`
- `dataQualityScore`
- `technicalScore`
- `positionMultiplier`
- `entryAmount`
- `requiredConfidence`

Isso melhora muito a leitura de perdas futuras, porque o post-mortem passa a saber nao apenas "a IA quis comprar", mas em que regime de governanca a entrada foi aprovada.

### Remocao de bypass estrutural no risk engine

Arquivo:

- [index.ts](/home/srant/projects/pumpfun-bonding-curve-Test/index.ts)

Foi removido o pass-through de "killer mode" para:

- LP destravado;
- score de risco alto.

Isso significa que o modo agressivo continua existindo para capturar lancamentos fortes, mas nao pode mais atravessar risco estrutural como se fosse irrelevante.

## Comportamento esperado apos a mudanca

### Setup fraco e precoce

Exemplo:

- 1 candle de `1s`;
- sem `volumeRelative`;
- sem sinal de momentum;
- `taScore` muito baixo;
- IA retorna `BUY 90`.

Resultado esperado:

- a confianca bruta e limitada;
- o setup tende a virar `RECHECK`, nao `BUY` imediato.

### Setup medio

Exemplo:

- 3 candles;
- alguma confirmacao de preco;
- score tecnico intermediario;
- IA confiante.

Resultado esperado:

- pode entrar, mas em `REDUCED`.

### Setup forte

Exemplo:

- confirmacao tecnica suficiente;
- volume presente;
- score tecnico forte;
- confianca consistente.

Resultado esperado:

- entrada `FULL`.

## O que nao mudou

- o bot continua podendo operar de forma agressiva em lancamentos fortes;
- o bonus de momentum de lancamento continua existindo;
- o modo `SIMULATION` e `LIVE` continuam usando o mesmo raciocinio de aprovacao ate a etapa de execucao;
- nada disso foi enviado para a VPS ainda.

## Validacao realizada

Validacoes locais executadas apos a implementacao:

- `npx tsc --noEmit`
- `npx jest --config jest.config.js test/unit/adaptiveEntryGovernance.test.ts --runInBand`

Resultado:

- typecheck aprovado;
- teste unitario aprovado.

## Status de deploy

Este documento registra uma mudanca apenas no repositorio local.

Nao foi feito deploy dessas alteracoes para a VPS nesta etapa.
