# 🔄 Sistema Híbrido de Trading PumpFun + Jupiter

## 🎯 Objetivo
Implementar um sistema híbrido de execução de trades que opere em dois modos:
- **CURVE**: Compra e venda direta no contrato da PumpFun (antes da migração)
- **DEX**: Venda via Jupiter após migração para Raydium

## 🏗️ Arquitetura do Sistema

| Etapa | Ação                                 | Origem dos dados                              | Execução          |
| ----- | ------------------------------------ | --------------------------------------------- | ----------------- |
| 1️⃣   | Monitorar curva (ex: 97.7%)          | gRPC da Shyft + contrato Pump.fun             | 🚀 Bot atual      |
| 2️⃣   | Comprar quando atingir ponto ideal   | 📜 Interação direta com contrato Pump.fun     | `buyOnPumpFun()`  |
| 3️⃣   | Acompanhar migração para Raydium     | Verificar criação de LP                       | Contrato Pump.fun |
| 4️⃣   | Vender automaticamente após migração | 🔁 Via API Jupiter (swap token → SOL/USDC)    | `sellViaJupiter()`|

## 🛠️ Etapas de Implementação

### Fase 1: Configuração e Infraestrutura

1. **Atualizar arquivo .env**
   ```env
   RPC_URL=https://api.mainnet-beta.solana.com
   SECRET_KEY_JSON=[SUA_PRIVATE_KEY_EM_ARRAY]
   PUMPFUN_PROGRAM_ID=6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
   BUY_AMOUNT_SOL=0.1
   TAKE_PROFIT_PERCENT=0.20
   SLIPPAGE_BPS=50
   AUTO_BUY_ENABLED=true
   ```

2. **Instalar dependências necessárias**
   ```bash
   npm install @solana/web3.js @solana/spl-token @jup-ag/api @project-serum/anchor
   ```

3. **Atualizar módulo `hybridExecutor.ts`**
   - Implementar funções reais de trading
   - Configuração de conexão com Solana
   - Carregamento de carteira programática
   - Integração com Jupiter API

### Fase 2: Integração com PumpFun (Modo CURVE)

4. **Implementar `buyOnPumpFun(tokenMint: string, amountSol: number): Promise<string>`**
   - Conectar com contrato PumpFun
   - Construir instrução de compra
   - Adicionar ComputeBudgetProgram
   - Enviar e confirmar transação
   - Verificar estado pós-compra

5. **Implementar `sellOnPumpFun(tokenMint: string, amountToken: number): Promise<string>`**
   - Construir instrução de venda
   - Verificar se token ainda está na curva
   - Enviar transação de venda
   - Confirmar execução

6. **Implementar verificação de estado da curva**
   - Ler conta bondingCurve
   - Monitorar progresso da curva
   - Detectar migração para Raydium

### Fase 3: Integração com Jupiter (Modo DEX)

7. **Implementar `sellViaJupiter(tokenMint: string, amountToken: number): Promise<string>`**
   - Integrar com API da Jupiter (v6)
   - Obter quote token → SOL
   - Executar swap com slippage configurável
   - Retornar txSignature

8. **Implementar verificação de pool Raydium**
   - Detectar criação de pool LP
   - Confirmar migração do token

### Fase 4: Lógica de Execução Híbrida

9. **Implementar `executeHybridTrade(tokenData: TokenData): Promise<void>`**
   - Lógica de decisão baseada no modo (CURVE/DEX)
   - Controle de Take Profit e Stop Loss
   - Gerenciamento de posições abertas

10. **Integrar com bot principal**
    - Acionar executeHybridTrade() após detectar tokens elegíveis
    - Manter alertas Telegram originais
    - Adicionar logs detalhados

### Fase 5: Segurança e Controles

11. **Implementar controles de segurança**
    - Proteção contra exposição de private key
    - Delays entre transações (rate-limit)
    - Tratamento de erros robusto
    - Confirmação de transações

12. **Adicionar sistema de logging**
    - Logar cada etapa do processo
    - Notificações Telegram opcionais
    - Registro de txHash e status

### Fase 6: Testes e Documentação

13. **Testar em devnet**
    - Validar instruções de compra/venda
    - Testar integração com Jupiter
    - Verificar lógica de Take Profit/Stop Loss

14. **Documentar implementação**
    - Atualizar README.md principal
    - Explicar variáveis de ambiente
    - Documentar uso e configuração

## 🔧 Tecnologias e Ferramentas

- **Solana Web3.js**: Para interação com a blockchain
- **PumpFun Program ID**: Para transações diretas no contrato
- **Jupiter API v6**: Para swaps pós-migração
- **Shyft gRPC**: Monitoramento em tempo real
- **TypeScript**: Linguagem principal do projeto

## 📈 Fluxo de Operação Esperado

1. **Monitoramento contínuo** via Shyft gRPC
2. **Detecção de tokens** próximos de 97.7% da curva
3. **Compra automática** via contrato PumpFun
4. **Monitoramento contínuo** do token e curva
5. **Decisão de venda**:
   - Se Take Profit atingido e ainda na curva: vender via PumpFun
   - Se token migrado para Raydium: vender via Jupiter
6. **Execução e logging** da operação
7. **Notificação** via Telegram (opcional)

## 🛡️ Considerações de Segurança

- Nunca expor private key em código ou logs
- Utilizar .env e .gitignore adequadamente
- Implementar delays entre transações para evitar rate-limit
- Testar extensivamente em devnet antes de mainnet
- Adicionar tratamento de erros robusto para falhas de RPC

## 📦 Entregável Esperado

1. Novo módulo `hybridExecutor.ts` funcional com implementação real de trading
2. Integração com bot principal
3. Documentação atualizada
4. Testes realizados em devnet