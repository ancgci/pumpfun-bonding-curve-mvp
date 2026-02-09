# Guia de Uso das Novas Funcionalidades

## 📊 Leitura Aprimorada de Dados e Metadados

### Como funciona
O sistema agora busca metadados de tokens de múltiplas fontes:
1. **PumpFun API** (prioridade mais alta)
2. **Solana.fm** (fonte secundária)
3. **DexTools** (dados de mercado)

### Configurações
As seguintes variáveis de ambiente podem ser configuradas no arquivo [.env](file:///wsl.localhost/Ubuntu/home/garci/telegram-webhook/.env):

```env
# Configurações de Metadados
METADATA_CACHE_TTL=1800          # Tempo de vida do cache em segundos (30 minutos)
ENABLE_METADATA_FETCH=true       # Habilitar/desabilitar busca de metadados
METADATA_CACHE_CHECK_PERIOD=600  # Período de verificação do cache em segundos (10 minutos)
```

### Informações Disponíveis
Os metadados agora incluem:
- Nome e símbolo do token
- Descrição e imagem
- Links sociais (Twitter, Telegram, Website)
- Detecção de scams
- Dados financeiros (Market Cap, Preço, Volume 24h, Liquidez)
- Informações do criador e data de criação

## 🚦 Controle de Trades

### Modo de Trade Único
O sistema agora inclui um modo de trade único que permite apenas uma posição aberta por vez:

#### Como funciona
- Quando uma posição é aberta, o bot não executará novas compras
- Apenas após fechar a posição (Take Profit ou Stop Loss) novas compras serão permitidas
- Isso ajuda a gerenciar risco e capital de forma mais conservadora

#### Configuração
```env
# Configurações de Trading Híbrido
SINGLE_TRADE_MODE=true  # Habilitar modo de trade único
```

#### Benefícios
- Redução de exposição de capital
- Melhor controle de risco
- Foco em uma posição por vez
- Evita overtrading

### Filtro de Tipo de Trade
Agora é possível filtrar quais tipos de trades o bot pode executar:

#### Como funciona
- **BUY**: Apenas operações de compra são permitidas
- **SELL**: Apenas operações de venda são permitidas
- **BOTH**: Ambas as operações são permitidas (padrão)

#### Configuração
```env
# Configurações de Trading Híbrido
TRADE_TYPE_FILTER=BUY  # Ou SELL, ou BOTH
```

#### Benefícios
- Controle mais preciso sobre as operações
- Permite estratégias específicas (apenas compra ou apenas venda)
- Redução de risco ao limitar tipos de operações

### Configuração de Stop Loss

#### Como funciona
O Stop Loss é um mecanismo de proteção que fecha automaticamente uma posição quando o preço cai abaixo de um determinado percentual do preço de entrada, limitando assim as perdas.

#### Configuração
```env
# Configurações de Trading Híbrido
STOP_LOSS_PERCENT=25  # Percentual de stop loss (padrão: 25%)
```

#### Valores recomendados
- **15**: Para traders conservadores
- **25**: Para traders moderadamente agressivos (padrão)
- **40**: Para traders agressivos que aceitam maior risco

#### Benefícios
- Proteção automática contra grandes perdas
- Configuração personalizável de acordo com o perfil de risco
- Monitoramento contínuo e fechamento automático de posições

## 📈 Monitor de Desempenho

### Métricas Coletadas
- Total de transações processadas
- Número de tokens únicos monitorados
- Taxa de acerto do cache (hits/misses)
- Número de chamadas de API realizadas
- Contagem de erros ocorridos
- Taxa de processamento (tokens por hora)

### Relatórios
O sistema gera relatórios automáticos:
- A cada 10 minutos (se o bot estiver rodando por mais de 10 minutos)
- A cada 1 hora (relatório completo)

## 📊 Monitoramento Flexível de Protocolos

### Como funciona
O sistema agora permite configurar quais protocolos monitorar:

### Configurações
```env
# Monitoramento de Protocolos
# Opções: "PUMPFUN", "METEORA_DBC", "BONK_FUN", "BOTH"
MONITORING_PROTOCOL=PUMPFUN
```

### Opções disponíveis
- **PUMPFUN**: Monitorar apenas tokens PumpFun (comportamento padrão)
- **METEORA_DBC**: Monitorar apenas tokens Meteora DBC
- **BONK_FUN**: Monitorar apenas tokens Bonk.fun
- **BOTH**: Monitorar múltiplos protocolos simultaneamente

### Benefícios
- Flexibilidade para testar diferentes protocolos
- Possibilidade de focar em um protocolo específico
- Monitoramento simultâneo de múltiplos protocolos

## 📊 Monitoramento da Meteora DBC

### Como funciona
O sistema agora também pode monitorar tokens criados na Meteora DBC com sistema de curva similar ao PumpFun.

### Configurações
```env
# Monitoramento de Meteora DBC
METEORA_DBC_MONITORING_ENABLED=true    # Habilitar/desabilitar monitoramento
METEORA_DBC_ALERT_THRESHOLD=97.7      # Limiar de alerta (padrão 97.7%)
METEORA_DBC_PROGRAM_ID=...            # Program ID do contrato Meteora DBC
```

### Benefícios
- Expansão para monitorar outra plataforma de tokens com curva de bonding
- Configuração independente do monitoramento PumpFun
- Alertas via Telegram quando tokens atingem o limiar configurado

## 📊 Monitoramento do Bonk.fun

### Como funciona
O sistema agora também pode monitorar tokens criados no Bonk.fun com sistema de curva similar ao PumpFun.

### Configurações
```env
# Monitoramento de Bonk.fun
BONK_FUN_MONITORING_ENABLED=true    # Habilitar/desabilitar monitoramento
BONK_FUN_ALERT_THRESHOLD=97.7      # Limiar de alerta (padrão 97.7%)
BONK_FUN_PROGRAM_ID=...            # Program ID do contrato Bonk.fun
```

### Benefícios
- Expansão para monitorar outra plataforma de tokens com curva de bonding
- Configuração independente do monitoramento PumpFun
- Alertas via Telegram quando tokens atingem o limiar configurado

## 🧪 Testes

### Teste de Metadados
Para testar apenas a funcionalidade de metadados:

```bash
npm run test:metadata
```

### Teste Completo
Para testar todas as melhorias implementadas:

```bash
npm run test:all
```

### Teste de Trade Único
Para testar o modo de trade único:

```bash
npm run test:single-trade
```

### Teste de Filtro de Tipo de Trade
Para testar o filtro de tipo de trade:

```bash
npm run test:trade-type
```

### Teste de Monitoramento da Meteora DBC
Para testar o monitoramento da Meteora DBC:

```bash
npm run test:meteora-dbc
```

### Teste de Monitoramento do Bonk.fun
Para testar o monitoramento do Bonk.fun:

```bash
npm run test:bonk-fun
```

## 🛠️ Solução de Problemas

### Problemas Comuns

1. **Erro de importação de módulos**
   - Verifique se todas as dependências estão instaladas:
   ```bash
   npm install
   ```

2. **Cache não funcionando**
   - Verifique as configurações no [.env](file:///wsl.localhost/Ubuntu/home/garci/telegram-webhook/.env)
   - O cache pode ser limpo reiniciando o bot

3. **Dados financeiros não aparecem**
   - Nem todos os tokens têm dados disponíveis em todas as fontes
   - O sistema tenta enriquecer os dados automaticamente

4. **Modo de trade único não está funcionando**
   - Verifique se a variável `SINGLE_TRADE_MODE=true` está configurada no [.env](file:///wsl.localhost/Ubuntu/home/garci/telegram-webhook/.env)
   - Reinicie o bot após alterar as configurações

5. **Filtro de tipo de trade não está funcionando**
   - Verifique se a variável `TRADE_TYPE_FILTER` está configurada corretamente no [.env](file:///wsl.localhost/Ubuntu/home/garci/telegram-webhook/.env)
   - As opções válidas são: BUY, SELL, BOTH
   - Reinicie o bot após alterar as configurações

6. **Monitoramento da Meteora DBC não está funcionando**
   - Verifique se a variável `METEORA_DBC_MONITORING_ENABLED=true` está configurada no [.env](file:///wsl.localhost/Ubuntu/home/garci/telegram-webhook/.env)
   - Verifique se o `METEORA_DBC_PROGRAM_ID` está configurado corretamente
   - Reinicie o bot após alterar as configurações

7. **Monitoramento do Bonk.fun não está funcionando**
   - Verifique se a variável `BONK_FUN_MONITORING_ENABLED=true` está configurada no [.env](file:///wsl.localhost/Ubuntu/home/garci/telegram-webhook/.env)
   - Verifique se o `BONK_FUN_PROGRAM_ID` está configurado corretamente
   - Reinicie o bot após alterar as configurações

8. **Protocolo de monitoramento não está funcionando**
   - Verifique se a variável `MONITORING_PROTOCOL` está configurada corretamente no [.env](file:///wsl.localhost/Ubuntu/home/garci/telegram-webhook/.env)
   - As opções válidas são: PUMPFUN, METEORA_DBC, BONK_FUN, BOTH
   - Reinicie o bot após alterar as configurações

### Logs
Os logs são salvos na pasta `logs/` e podem ser consultados para:
- Verificar erros na busca de metadados
- Monitorar o desempenho do cache
- Acompanhar chamadas de API
- Verificar o status do modo de trade único
- Verificar se o filtro de tipo de trade está funcionando
- Verificar o monitoramento da Meteora DBC
- Verificar o monitoramento do Bonk.fun
- Verificar quais protocolos estão sendo monitorados

## 📞 Suporte

Para relatar problemas ou sugerir melhorias, entre em contato com o desenvolvedor.