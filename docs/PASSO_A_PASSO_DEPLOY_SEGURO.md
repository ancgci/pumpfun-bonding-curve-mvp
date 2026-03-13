# 🚦 Passo a Passo Seguro para Deploy (PumpFun Bot)

Este guia garante que seu código e configurações locais fiquem 100% alinhados com a VPS, sem risco de perder parâmetros importantes como o `ta-config.json`.

---

## 1. Backup do ta-config.json na VPS (opcional, mas recomendado)
No terminal da VPS:
```bash
cp /opt/agents/pumpfun-bot/data/ta-config.json /opt/agents/pumpfun-bot/data/ta-config.json.bkp
```

---

## 2. Confirme que o arquivo local está correto
Na sua máquina local:
```bash
cat data/ta-config.json
```
Se quiser comparar com o da VPS:
```bash
scp dev@YOUR_VPS_IP:/opt/agents/pumpfun-bot/data/ta-config.json ta-config.vps.bkp.json
diff data/ta-config.json ta-config.vps.bkp.json
```

---

## 3. Garanta que o código local está atualizado
Na sua máquina local:
```bash
git status
# Se houver arquivos não versionados ou não commitados, faça:
git add .
git commit -m "Preparando para deploy"
git pull origin main  # (opcional, para garantir que está com o código mais recente do repositório)
```

---

## 4. Execute o deploy
Na sua máquina local, na raiz do projeto:
```bash
./deploy/deploy.sh
```
Esse comando vai sincronizar todo o projeto local com a VPS.

---

## 5. Verifique se o arquivo foi atualizado na VPS
Na VPS:
```bash
ls -la /opt/agents/pumpfun-bot/data/ta-config.json
cat /opt/agents/pumpfun-bot/data/ta-config.json
```

---

## 6. Reinicie o bot e monitore
Na VPS:
```bash
pm2 restart bot
pm2 logs bot | grep "Config\|Score"
```
Procure por:
- `scoreMinimo=40` (ou o valor que você configurou)
- Mensagens de carregamento do config

---

## 7. Se precisar restaurar o backup
Na VPS:
```bash
cp /opt/agents/pumpfun-bot/data/ta-config.json.bkp /opt/agents/pumpfun-bot/data/ta-config.json
pm2 restart bot
```

---

## 8. Dicas Extras e Boas Práticas
- Sempre faça backup do ta-config.json antes de qualquer deploy.
- Use `diff` para comparar configs local e VPS antes de sobrescrever.
- Se o bot não operar após deploy, verifique logs imediatamente.
- Mantenha um histórico de configs antigos (ex: ta-config.json.2026-03-12.bkp).
- Automatize alertas para ausência ou erro de leitura do config.

---

## 9. Exemplos de Problemas e Soluções

**Problema:** Após deploy, bot para de operar.
- **Causa provável:** ta-config.json ausente ou sobrescrito incorretamente.
- **Solução:** Restaurar backup ou copiar config correto e reiniciar bot.

**Problema:** Score mínimo voltou para 55 após deploy.
- **Causa provável:** Deploy trouxe config default do repositório.
- **Solução:** Substituir pelo ta-config.json SOFT MODE e reiniciar.

---

## 10. Checklist Final Antes do Deploy
- [ ] Backup do ta-config.json feito na VPS
- [ ] Config local revisada e correta
- [ ] Código local commitado e atualizado
- [ ] Deploy executado sem erros
- [ ] Verificação do config na VPS após deploy
- [ ] Bot reiniciado e logs conferidos
- [ ] Backup restaurado se necessário

---

## ✅ Pronto!
Seguindo esse passo a passo, você garante deploy seguro, sem perder configurações críticas.
