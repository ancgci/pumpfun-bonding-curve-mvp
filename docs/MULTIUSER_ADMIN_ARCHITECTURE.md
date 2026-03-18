# Arquitetura Multiusuario com Conta Admin

## Objetivo

Evoluir o dashboard/API atual de um modelo single-tenant para um modelo multiusuario com:

- uma conta `Admin` com visao global do sistema;
- contas `User` com wallet, configuracoes e performance isoladas;
- um motor de bot compartilhado, mas com execucao segregada por usuario;
- visao administrativa de performance por wallet e por usuario;
- onboarding futuro por convite e/ou pagamento.

---

## Situacao Atual

Hoje o projeto opera como **single-tenant**:

- autenticacao em `dashboard-api/server.ts` baseada em um unico `ALLOWED_EMAIL`;
- uma unica wallet principal carregada de `bot-wallet.json`;
- endpoints de stats/positions/trades retornando dados globais;
- persistencia principal em arquivos JSON e SQLite sem `user_id`;
- `utils/db.ts` armazena apenas PnL historico e trades simulados globais.

Isso funciona para um operador unico, mas nao escala para varias contas porque mistura:

- identidade;
- wallet;
- configuracao de risco;
- posicoes;
- PnL;
- ownership dos dados.

---

## Decisao de Arquitetura

### Recomendacao

Usar **um motor de bot compartilhado** com **contexto isolado por usuario**.

Em termos praticos:

- nao e necessario subir um processo Node completo para cada usuario;
- cada usuario precisa ter um `execution context` proprio;
- cada contexto deve operar com wallet, risco, posicoes, ordens e PnL proprios;
- a conta `Admin` enxerga todos os contextos agregados.

### O que isso significa

- O "cerebro" da estrategia pode ser o mesmo.
- A decisao final de executar trade precisa ser avaliada por usuario.
- A assinatura e o envio de transacao devem usar a wallet daquele usuario.
- Circuit breaker e limites precisam existir em dois niveis:
  - por usuario;
  - global/admin.

---

## Modelo de Roles

### `ADMIN`

Permissoes:

- ver todos os usuarios;
- ver todas as wallets;
- ver PnL por usuario e por wallet;
- ligar/desligar bots de usuarios;
- alterar configuracoes globais;
- aprovar convite/pagamento;
- bloquear conta;
- visualizar auditoria.

### `USER`

Permissoes:

- ver apenas a propria conta;
- ver apenas as proprias wallets;
- ver apenas suas posicoes, ordens e performance;
- alterar apenas configuracoes permitidas do proprio bot;
- sacar/exportar apenas dados autorizados da propria conta.

### `SUPPORT` opcional

Permissoes:

- leitura operacional;
- sem acesso a chaves privadas;
- sem alteracao de configuracoes criticas.

---

## Modelo de Wallets

### Regra principal

Se os fundos sao dos usuarios, cada usuario precisa ter uma ou mais wallets proprias.

### Estrutura recomendada

- `1 user -> N wallets`
- uma wallet pode estar:
  - `ACTIVE`
  - `PAUSED`
  - `ARCHIVED`
  - `PENDING_SETUP`

### Seguranca

Nao guardar private key em texto puro no banco.

Opcoes:

1. referencia criptografada em disco seguro;
2. vault/KMS externo;
3. custodia manual se o produto for semi-gerenciado.

### Regras de seguranca recomendadas

- nunca expor `secretBase58` na UI Admin;
- todo evento de export/sign deve gerar auditoria;
- toda wallet deve ter owner explicito;
- toda transacao deve carregar `user_id` e `wallet_id`.

---

## Modelo do Bot

## Camadas

### 1. Market Feed Compartilhado

Um unico stream de mercado para:

- PumpFun;
- Meteora DBC;
- BonkFun;
- demais protocolos.

Esse feed alimenta todos os usuarios sem duplicar conexoes desnecessarias.

### 2. Strategy Engine Compartilhado

Camada que gera sinais:

- score tecnico;
- score de organicidade;
- risco;
- setup elegivel.

Ela nao envia ordem direto. Ela apenas produz um `trade signal`.

### 3. Execution Context por Usuario

Para cada usuario ativo:

- aplica regras de risco do usuario;
- verifica saldo da wallet do usuario;
- verifica se aquele usuario permite aquele protocolo/modo;
- decide se o sinal sera executado;
- assina e envia pela wallet do usuario.

### 4. Admin Control Layer

Camada para:

- kill switch global;
- pause por usuario;
- pause por wallet;
- limites agregados;
- auditoria de eventos.

---

## Fluxo Recomendado

```text
Market Feed
   -> Strategy Engine
      -> Trade Signal Bus
         -> User Execution Context A -> Wallet A1
         -> User Execution Context B -> Wallet B1
         -> User Execution Context B -> Wallet B2
         -> User Execution Context C -> Wallet C1

Admin Dashboard
   -> Aggregation API
      -> users + wallets + positions + pnl + alerts + billing
```

---

## Modelo de Dados Recomendado

Migrar o estado principal para banco relacional. SQLite pode servir no inicio, mas para multiusuario real o ideal e Postgres.

## Tabelas principais

### `users`

Campos sugeridos:

- `id`
- `email`
- `name`
- `role` (`ADMIN`, `USER`, `SUPPORT`)
- `status` (`ACTIVE`, `PENDING`, `SUSPENDED`)
- `access_origin` (`ALLOWLIST`, `INVITE`, `PAYMENT`)
- `billing_status`
- `invited_by_user_id`
- `created_at`
- `updated_at`
- `last_login_at`

### `user_wallets`

- `id`
- `user_id`
- `label`
- `public_key`
- `secret_ref`
- `status`
- `is_default`
- `created_at`

### `bot_instances`

- `id`
- `user_id`
- `wallet_id`
- `mode`
- `status`
- `strategy_profile_id`
- `risk_profile_id`
- `last_heartbeat_at`

Observacao:

- fisicamente pode existir um processo compartilhado;
- `bot_instances` representa o bot logico por conta/wallet.

### `positions`

- `id`
- `user_id`
- `wallet_id`
- `token_mint`
- `protocol`
- `entry_signature`
- `entry_time`
- `entry_sol_amount`
- `entry_token_amount`
- `take_profit`
- `stop_loss`
- `status`
- `exit_signature`
- `exit_time`
- `realized_pnl_sol`

### `orders`

- `id`
- `user_id`
- `wallet_id`
- `signal_id`
- `side`
- `status`
- `signature`
- `error_message`
- `created_at`

### `trade_signals`

- `id`
- `protocol`
- `token_mint`
- `score`
- `decision_context`
- `created_at`

### `pnl_snapshots`

- `id`
- `user_id`
- `wallet_id`
- `equity_sol`
- `realized_pnl_sol`
- `unrealized_pnl_sol`
- `timestamp`

### `invites`

- `id`
- `code`
- `email`
- `status`
- `created_by_user_id`
- `redeemed_by_user_id`
- `expires_at`

### `subscriptions` ou `payments`

- `id`
- `user_id`
- `provider`
- `external_customer_id`
- `external_subscription_id`
- `status`
- `plan`
- `started_at`
- `expires_at`

### `admin_audit_logs`

- `id`
- `actor_user_id`
- `target_user_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata_json`
- `created_at`

---

## Dashboard: Visao do Admin

O Admin deve ver uma camada global separada da visao do usuario comum.

## Painel Admin recomendado

### Overview Global

- usuarios ativos;
- bots ativos;
- wallets ativas;
- equity total;
- PnL total;
- drawdown agregado;
- contas com erro;
- contas com pagamento pendente.

### Ranking de Performance

Tabela por `user` e por `wallet`:

- usuario;
- wallet;
- saldo atual;
- PnL diario;
- PnL acumulado;
- win rate;
- numero de trades;
- bot status;
- ultimo heartbeat.

### Risco Operacional

- circuit breaker global;
- circuit breaker por usuario;
- wallets sem saldo;
- transacoes falhando;
- usuarios com drawdown acima do limite.

### Billing/Access

- convidados pendentes;
- usuarios ativos por plano;
- pagamentos expirando;
- contas suspensas.

---

## Dashboard: Visao do Usuario

Cada `User` deve ver apenas:

- perfil da propria conta;
- wallet(s) proprias;
- saldo e composicao da wallet;
- bot status proprio;
- performance propria;
- historico proprio;
- configuracoes permitidas.

Nao deve ver:

- dados de outros usuarios;
- chaves sensiveis;
- controles globais de Admin.

---

## API Recomendada

Separar a API em escopos.

## Auth

- `POST /api/auth/google`
- `GET /api/auth/me`
- `POST /api/auth/logout`

O payload autenticado deve carregar:

- `userId`
- `role`
- `status`
- `scopes`

## User scope

- `GET /api/me/account`
- `GET /api/me/wallets`
- `GET /api/me/performance`
- `GET /api/me/positions`
- `GET /api/me/trades`
- `PATCH /api/me/bot-config`
- `POST /api/me/wallets`

## Admin scope

- `GET /api/admin/overview`
- `GET /api/admin/users`
- `GET /api/admin/users/:userId`
- `GET /api/admin/users/:userId/wallets`
- `GET /api/admin/users/:userId/performance`
- `GET /api/admin/wallets/leaderboard`
- `POST /api/admin/users/:userId/pause-bot`
- `POST /api/admin/users/:userId/resume-bot`
- `POST /api/admin/invites`
- `POST /api/admin/users/:userId/suspend`

---

## Refatoracoes Necessarias no Projeto Atual

### `dashboard-api/server.ts`

Hoje concentra tudo.

Recomendacao:

- `routes/auth.ts`
- `routes/me.ts`
- `routes/admin.ts`
- `routes/wallets.ts`
- `routes/trading.ts`

### `utils/db.ts`

Hoje so cobre PnL historico/trades simulados globais.

Recomendacao:

- criar schema multiusuario;
- parar de usar somente tabelas globais;
- introduzir repositorios com `user_id` e `wallet_id`.

### Arquivos JSON globais

Arquivos como:

- `data/positions.json`
- `data/trading-config.json`
- `data/agent/config.json`

devem sair do papel de fonte principal de verdade.

Com multiusuario, eles precisam virar:

- tabela por usuario;
- tabela por wallet;
- ou cache derivado do banco.

### Wallet atual

`bot-wallet.json` deve deixar de ser a wallet universal do sistema.

Ela pode virar:

- wallet interna do admin/owner;
- ou wallet temporaria de transicao durante a migracao.

---

## Regras de Isolamento Obrigatorias

Cada leitura e escrita operacional deve carregar:

- `user_id`
- `wallet_id`

Itens que precisam de isolamento:

- posicoes;
- ordens;
- trades;
- PnL;
- config;
- circuit breaker;
- logs;
- alertas;
- snapshots de carteira.

Se qualquer uma dessas entidades continuar global, voce tera vazamento de contexto entre usuarios.

---

## Circuit Breaker em 2 Niveis

### Global

Protege o sistema inteiro.

Exemplos:

- queda geral de RPC;
- erro massivo de execucao;
- evento de mercado extremo;
- falha no signer.

### Por usuario

Protege a conta individual.

Exemplos:

- drawdown maximo atingido;
- falhas consecutivas;
- saldo insuficiente;
- configuracao invalida;
- wallet sem permissao.

---

## Billing e Convites

### Fluxo por convite

1. Admin cria invite.
2. Invite define email, plano e expiracao.
3. Usuario entra via Google.
4. Sistema casa email + invite.
5. Conta vira `ACTIVE`.

### Fluxo por pagamento

1. Usuario paga.
2. Gateway retorna webhook.
3. Sistema cria ou ativa conta.
4. Associa plano e expiracao.
5. Usuario passa a acessar dashboard e bot.

### Regra importante

Pagamento e convite devem gerar **entitlement**, nao apenas "login bem-sucedido".

---

## Ordem Recomendada de Implementacao

### Fase 1. Identidade e Roles

### Fase 1. Identidade e Roles

- [x] trocar `ALLOWED_EMAIL` por tabela `users`;
- [x] criar role `ADMIN`;
- [x] incluir `role` no JWT;
- [x] criar middleware `requireAdmin`.

### Fase 2. Wallets por usuario

- [x] criar tabela `user_wallets`;
- [ ] ligar dashboard a wallet por conta;
- [ ] mover wallet atual para um `user` admin inicial.

### Fase 3. Dados multiusuario

- [ ] migrar positions/trades/config para banco com `user_id`/`wallet_id`;
- [x] atualizar API para retornar escopo correto.

### Fase 4. Bot logico por usuario

- [ ] criar `execution context` por usuario/wallet;
- [ ] manter market feed compartilhado;
- [ ] aplicar risco e execucao por usuario.

### Fase 5. Dashboard Admin

- [ ] overview global;
- [ ] leaderboard por wallet;
- [ ] drill-down por usuario;
- [ ] controle remoto por conta.

### Fase 6. Convites e Pagamentos

- [ ] invites;
- [ ] subscriptions/payments;
- [ ] ativacao automatica.

---

## Recomendacao Objetiva para Este Projeto

Para este repositorio, a melhor arquitetura e:

- **1 backend/API compartilhado**
- **1 strategy engine compartilhado**
- **N bots logicos por usuario/wallet**
- **1 conta Admin com visao total**
- **dados segregados por `user_id` e `wallet_id`**

Nao recomendo, neste momento:

- um processo Node completo por usuario;
- uma wallet global para todos os clientes;
- continuar usando JSON global como estado principal.

---

## Primeiro Entregavel Tecnico

Se for implementar por menor risco, o primeiro corte deve ser:

1. criar tabela `users`;
2. criar tabela `user_wallets`;
3. introduzir `role=ADMIN`;
4. substituir `ALLOWED_EMAIL`;
5. criar `GET /api/admin/overview`;
6. criar `GET /api/me/account`;
7. mover a wallet atual para o usuario Admin inicial.

Esse passo ja abre caminho para:

- visao administrativa;
- wallets por usuario;
- ranking de performance por conta;
- onboarding por convite/pagamento depois.
