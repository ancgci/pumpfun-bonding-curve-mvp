# Loss Post-Mortem Agent - VPS Deploy Checklist

This guide documents the production deployment path for the offline Loss Post-Mortem Agent that was implemented locally first.

Scope:

- deploy only after local validation is complete;
- preserve current VPS data before rollout;
- validate both bot runtime and offline learning flow;
- keep rollback simple and fast.

---

## 1. What Changes on VPS

This feature adds:

- richer trade persistence in `simulated_trades`;
- JSON and SQLite storage for entry/exit snapshots and monitoring traces;
- a new offline worker (`PostMortemAgent`);
- a new API endpoint: `GET /api/agent/postmortems`;
- an upgraded learning flow where `PostMortemAgent` runs before `LearnerAgent`.

Important:

- this does **not** alter the online 8-step trading pipeline latency;
- SQLite migration is automatic at startup;
- old trades remain readable because new fields are additive.

---

## 2. Pre-Deploy Requirements

Confirm locally before touching VPS:

- `npm run typecheck` passes;
- targeted tests pass;
- documentation is updated;
- current branch is committed and pushed;
- you know whether `POSTMORTEM_LLM_ENABLED` will start as `true` or `false`.

Recommended first production rollout:

- start with `POSTMORTEM_LLM_ENABLED=false`

Reason:

- deterministic autopsy is enough for first validation;
- avoids adding new LLM cost/latency to the offline worker on day 1;
- lets you validate persistence, migration and dashboards first.

Current project default for VPS:

- `deploy/ecosystem.config.js` now starts the bot with `POSTMORTEM_LLM_ENABLED=false` unless you explicitly override it.

---

## 3. Backup Strategy

### Local Backup Already Created

- `backups/pre-postmortem-agent-20260317-141018.tar.gz`

### VPS Backup Required Before Deploy

The existing deploy script already backs up the remote `data/` directory before sync:

- `deploy/deploy.sh`

Still recommended before rollout:

```bash
cd /home/srant/projects/pumpfun-bonding-curve-Test
./deploy/backup-vps-data.sh
```

If you want extra protection, also back up the SQLite database on VPS:

```bash
ssh <VPS_USER>@<VPS_IP> << 'EOF'
  cd /home/anto/pumpfun-bot
  mkdir -p manual_backup_$(date +%Y%m%d_%H%M%S)
  cp -v dashboard-api/db/pnl_history.db manual_backup_$(date +%Y%m%d_%H%M%S)/ 2>/dev/null || true
EOF
```

---

## 4. Recommended Rollout Mode

### Phase A - Safe Rollout

Use:

- `POSTMORTEM_LLM_ENABLED=false`

Expected behavior:

- snapshots persist;
- post-mortem worker runs deterministically;
- learner uses richer summaries;
- no dependency on LLM enrichment yet.

### Phase B - Full Rollout

After observing stable behavior:

- switch `POSTMORTEM_LLM_ENABLED=true`
- optionally set a dedicated NVIDIA model stack for the offline worker:
  `POSTMORTEM_LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions`
  `POSTMORTEM_LLM_MODEL=qwen/qwen3.5-122b-a10b`
  `POSTMORTEM_LLM_API_KEY=...`

Expected behavior:

- deterministic report remains primary;
- LLM only enriches recommendations and narrative detail.

---

## 5. Deploy Steps

### On Local Machine

```bash
cd /home/srant/projects/pumpfun-bonding-curve-Test
git status
git add .
git commit -m "Add offline loss post-mortem agent"
git push origin main
```

### Optional: Set Safe First Rollout

If `.env` or runtime config on VPS is used for feature flags, ensure:

```bash
POSTMORTEM_LLM_ENABLED=false
```

In the current implementation, this is already the PM2 default on VPS.

### Deploy to VPS

```bash
cd /home/srant/projects/pumpfun-bonding-curve-Test
./deploy/deploy.sh
```

What `deploy/deploy.sh` already does:

1. creates a backup of remote `data/`;
2. syncs project files to VPS;
3. installs dependencies if needed;
4. builds dashboard assets;
5. restarts PM2 services;
6. validates `GET /api/agent/learned-rules`;
7. validates `GET /api/agent/postmortems`;
8. fails the deploy if the dashboard API does not return valid JSON.

---

## 6. Post-Deploy Validation

### Process Health

```bash
ssh <VPS_USER>@<VPS_IP>
cd /home/anto/pumpfun-bot
pm2 status
pm2 logs bot --lines 100
pm2 logs dashboard-api --lines 100
```

You should not see:

- migration crashes;
- JSON parse errors for old trades;
- SQLite errors on `ALTER TABLE`;
- crashes in `PostMortemAgent` startup cycle.

### Database Migration Validation

On VPS:

```bash
sqlite3 dashboard-api/db/pnl_history.db "PRAGMA table_info(simulated_trades);"
```

Expected new columns:

- `decision_context`
- `entry_snapshot`
- `exit_snapshot`
- `monitoring_trace`
- `postmortem_status`
- `postmortem_summary`
- `postmortem_report`
- `postmortem_analyzed_at`

If `sqlite3` is not installed, validate indirectly from the API/logs and DB file size changes.

### API Validation

The deploy script now performs automatic API checks against:

- `http://127.0.0.1:3001/api/agent/learned-rules`
- `http://127.0.0.1:3001/api/agent/postmortems`

So manual validation becomes a second safety layer, not the first one.

```bash
curl http://<VPS_IP>:3001/api/agent/postmortems
curl http://<VPS_IP>:3001/api/agent/learned-rules
curl http://<VPS_IP>:3001/api/simulation/trades?limit=5
```

Expected:

- endpoint responds with valid JSON;
- no 500 on `postmortems`;
- simulation trades still load correctly.

### Log Validation

```bash
pm2 logs bot | grep "PostMortemAgent"
pm2 logs bot | grep "LearnerAgent"
```

Expected startup line:

```text
PostMortem Agent module loaded (enabled=true, llmEnrichment=false, batchSize=5)
```

Expected sequence after closed losing trades:

1. `PostMortemAgent` detects pending losses;
2. trade gets analyzed;
3. `LearnerAgent` later consumes enriched loss summaries.

---

## 7. Functional Validation in Production

After deployment, watch for:

- bot still opening and closing simulated trades normally;
- no slowdown in token evaluation pipeline;
- new losing trades becoming `DONE` in post-mortem state;
- `GET /api/agent/postmortems` returning autopsies;
- `patterns.json` still being updated only by learner flow.

Recommended observation window:

- first 30-60 minutes for startup/runtime errors;
- first 6-12 hours for first real batch of loss autopsies.

---

## 8. Safe Checks After First Losing Trade

Once the first loss closes on VPS:

```bash
curl http://<VPS_IP>:3001/api/agent/postmortems | jq '.[0]'
```

Verify the returned trade contains:

- `postMortemStatus = DONE`
- `postMortemSummary`
- `postMortemReport.rootCause`
- `postMortemReport.recommendations`

Then inspect learning continuity:

```bash
curl http://<VPS_IP>:3001/api/agent/learned-rules
```

The goal is not immediate new rules on the first loss, but proof that the flow remains healthy.

---

## 9. Rollback Plan

### Fast Rollback

If the bot crashes or the API breaks after deploy:

```bash
ssh <VPS_USER>@<VPS_IP>
cd /home/anto/pumpfun-bot
pm2 stop all
ls -dt data_backup_* | head
```

Restore the latest remote data backup:

```bash
ssh <VPS_USER>@<VPS_IP> << 'EOF'
  cd /home/anto/pumpfun-bot
  BACKUP_DIR=$(ls -dt data_backup_* | head -1)
  rm -rf data
  cp -r "$BACKUP_DIR" data
  pm2 startOrRestart ecosystem.config.js --update-env
EOF
```

### Code Rollback

If the issue is code-related:

```bash
cd /home/srant/projects/pumpfun-bonding-curve-Test
git revert HEAD --no-edit
git push origin main
./deploy/deploy.sh
```

### Feature Rollback Only

If only the LLM enrichment is unstable:

```bash
POSTMORTEM_LLM_ENABLED=false
pm2 restart bot
```

This keeps deterministic autopsy active while disabling the enrichment layer.

---

## 10. Recommended Production Sequence

1. Deploy with `POSTMORTEM_LLM_ENABLED=false`
2. Watch logs for 30-60 minutes
3. Validate API and DB migrations
4. Wait for first real losing trade autopsy
5. Keep deterministic mode for one observation cycle
6. Only then enable `POSTMORTEM_LLM_ENABLED=true`

This keeps rollout low-risk while preserving the learning benefit.

---

## 11. Final Checklist

- [ ] Local backup exists
- [ ] VPS backup created
- [ ] Code committed and pushed
- [ ] `npm run typecheck` passed locally
- [ ] Targeted tests passed locally
- [ ] Safe rollout mode chosen
- [ ] `./deploy/deploy.sh` executed
- [ ] PM2 services healthy
- [ ] API `/api/agent/postmortems` responding
- [ ] First post-mortem validated on VPS
- [ ] Rollback plan ready if needed

For operational monitoring right after deploy, see:

- `docs/LOSS_POSTMORTEM_FIRST_2H_RUNBOOK.md`
