# 🛡️ VPS Security Hardening Protocol

Este documento detalha o protocolo de segurança aplicado à VPS (<VPS_IP>) em 16/03/2026 para prevenir acessos não autorizados e ataques de força bruta.

## 1. Gestão de Usuários

O acesso direto como `root` foi desabilitado. Toda a administração do sistema deve ser feita através do usuário seguro:
- **Usuário**: `anto`
- **Privilégios**: Sudo (administrativo)
- **Home**: `/home/anto`

## 2. Configurações de SSH (`/etc/ssh/sshd_config`)

O serviço SSH foi configurado para **Key-Based Authentication Only**:
- `PermitRootLogin no`: Impede o acesso direto como root.
- `PasswordAuthentication no`: Senhas desabilitadas para prevenir força bruta.
- `ChallengeResponseAuthentication no`: Desabilitado.
- `UsePAM yes`: Mantido para integração de sistema, mas sem aceitar senhas para SSH.
- **Chave Autorizada**: Ed25519 (`wsl-contabo`).

## 3. Firewall (UFW)

O sistema opera sob uma política restritiva (Deny by Default):
- **Entrada Bloqueada**: Todas as conexões que não foram explicitamente permitidas.
- **Entrada Permitida**:
    - `22/tcp`: SSH (Acesso remoto via chave)
    - `80/tcp`: HTTP (Dashboard API)
    - `443/tcp`: HTTPS (Dashboard API Seguro)

## 4. Fail2Ban

Monitoramento ativo de logs de autenticação:
- **Prisão (Jail)**: `sshd`
- **Max Retry**: 3 tentativas falhas.
- **Ban Time**: 1 hora (60 minutos).
- **Log**: `/var/log/auth.log`

## 5. Manutenção Automática

Para garantir que o sistema esteja sempre protegido contra vulnerabilidades recém-descobertas (0-day):
- **Unattended-Upgrades**: Configurado para baixar e instalar silenciosamente todos os patches marcados como `security` pelo repositório oficial do Ubuntu.

## 6. Integridade de Memória e Aplicação

- **Segurança de Código**: Removemos o uso de `exec()` e `shell` no Dashboard API (`server.ts`). O sistema agora utiliza leitura direta de arquivos via `fs`, o que impede que um invasor "injete" comandos.
- **Isolamento de Runtime**: O robô e o dashboard são gerenciados pelo **PM2** rodando exclusivamente sob o usuário `anto`. 
- **Permissões de Diretório**: O projeto está localizado em `/home/anto/pumpfun-bot` com permissões restritas ao usuário `anto`.

## 7. Verificação de Saúde (Checklist de Manutenção)

- [x] SSH Login sem senha (via Key).
- [x] SSH Login com senha rejeitado.
- [x] Processos PM2 pertencem ao usuário `anto`.
- [x] Firewall bloqueia portas desnecessárias.
- [x] Unattended-upgrades ativo.

---
*Status: Hardening Nível 3 (Máximo)*
*Última atualização: 16 de março de 2026*
