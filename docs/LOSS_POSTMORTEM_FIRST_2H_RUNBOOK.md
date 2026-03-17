# Loss Post-Mortem Agent - First 2 Hours Runbook

This runbook is for the first 2 hours after deploying the Loss Post-Mortem Agent to VPS.

Goal:

- confirm the bot and dashboard stay healthy;
- confirm the new offline worker is running in safe mode;
- confirm API and persistence are intact;
- confirm the first losing-trade autopsy works end-to-end.

Default rollout assumption:

- `POSTMORTEM_AGENT_ENABLED=true`
- `POSTMORTEM_LLM_ENABLED=false`

Remote project path:

- `/home/anto/pumpfun-bot`

---

## T+0 to T+5 min

### 1. Enter the VPS and go to the project

```bash
ssh anto@<VPS_IP>
cd /home/anto/pumpfun-bot
```

### 2. Confirm PM2 processes are healthy

```bash
pm2 status
pm2 logs bot --lines 80
pm2 logs dashboard-api --lines 80
```

What you want to see:

- `bot` online
- `dashboard-api` online
- no startup crash loop
- no SQLite migration error
- no JSON parse error

### 3. Confirm the post-mortem worker startup mode

```bash
pm2 logs bot --lines 200 | grep "PostMortem Agent module loaded"
```

Expected:

```text
PostMortem Agent module loaded (enabled=true, llmEnrichment=false, batchSize=5)
```

If you see `llmEnrichment=true` on the first rollout, stop and verify environment overrides before continuing.

---

## T+5 to T+15 min

### 4. Validate API endpoints manually

```bash
curl http://127.0.0.1:3001/api/agent/learned-rules
curl http://127.0.0.1:3001/api/agent/postmortems
curl http://127.0.0.1:3001/api/simulation/trades?limit=5
```

You want:

- valid JSON on all three endpoints
- no HTTP 500
- `postmortems` may be `[]` initially

### 5. Validate SQLite schema migration

```bash
sqlite3 dashboard-api/db/pnl_history.db "PRAGMA table_info(simulated_trades);"
```

Check that these columns exist:

- `decision_context`
- `entry_snapshot`
- `exit_snapshot`
- `monitoring_trace`
- `postmortem_status`
- `postmortem_summary`
- `postmortem_report`
- `postmortem_analyzed_at`

If `sqlite3` is missing:

```bash
sudo apt-get update && sudo apt-get install -y sqlite3
```

---

## T+15 to T+30 min

### 6. Watch runtime health without flooding yourself

Open one terminal tab and keep this running:

```bash
pm2 logs bot | grep --line-buffered "PostMortemAgent\|LearnerAgent\|ERROR\|Trade closed\|Recorded trade entry"
```

Open another tab for API issues:

```bash
pm2 logs dashboard-api | grep --line-buffered "error\|Error\|500"
```

What you want:

- trades still being recorded normally
- no new crash pattern from the offline worker
- no dashboard API 500s

### 7. Check current simulation trade records

```bash
curl http://127.0.0.1:3001/api/simulation/trades?limit=10
```

You want to confirm:

- trade listing still works
- recent records still appear
- no regression in the dashboard trade feed

---

## T+30 to T+60 min

### 8. Confirm the bot is still operating normally

```bash
pm2 logs bot --lines 300 | grep "\[Pipeline"
pm2 logs bot --lines 300 | grep "EXECUTADO TRADE\|Recording simulated trade\|Trade closed"
```

You want:

- the 8-step pipeline still appears normally
- simulated trades still open and close
- no visible slowdown or stalls around the learning cycle

### 9. Check whether post-mortems are being created

```bash
curl http://127.0.0.1:3001/api/agent/postmortems | jq '.[0]'
```

Possible outcomes:

- `null` or no item: acceptable if no losing trade has closed yet
- an object: validate it contains the new report fields

If you do get a report, validate:

- `postMortemStatus`
- `postMortemSummary`
- `postMortemReport.rootCause`
- `postMortemReport.recommendations`

---

## T+60 to T+120 min

### 10. Validate first end-to-end losing trade autopsy

After the first losing trade closes:

```bash
curl http://127.0.0.1:3001/api/agent/postmortems | jq '.[0] | {tokenSymbol, status, reason, postMortemStatus, postMortemSummary, rootCause: .postMortemReport.rootCause}'
```

Expected:

- `postMortemStatus` is `DONE`
- summary is non-empty
- root cause exists

### 11. Validate learner continuity

```bash
pm2 logs bot --lines 400 | grep "LearnerAgent"
curl http://127.0.0.1:3001/api/agent/learned-rules | jq '.[0:5]'
```

You are checking:

- `LearnerAgent` still runs after `PostMortemAgent`
- learned rules endpoint remains healthy
- no regression in the learning loop

### 12. Inspect raw trade persistence if needed

```bash
sqlite3 dashboard-api/db/pnl_history.db "
  SELECT
    token_symbol,
    status,
    pnl_sol,
    postmortem_status,
    substr(postmortem_summary, 1, 120)
  FROM simulated_trades
  ORDER BY entry_time DESC
  LIMIT 10;
"
```

This is useful if API output looks wrong and you need to verify whether the issue is persistence or serialization.

---

## Success Criteria After 2 Hours

You can consider the rollout healthy if:

- PM2 processes stayed online
- no migration-related errors appeared
- `/api/agent/postmortems` responded throughout
- normal simulated trading behavior continued
- at least one losing trade, if it happened, was analyzed with `postMortemStatus=DONE`
- `LearnerAgent` still ran normally
- no evidence of API or persistence regression

---

## Escalation Conditions

Stop and investigate immediately if you see:

- `dashboard-api` returning 500 on `/api/agent/postmortems`
- PM2 restart loop
- SQLite `ALTER TABLE` or write failures
- trade recording stops after deploy
- repeated `PostMortemAgent` failures on every cycle
- unusually high memory growth after deploy

---

## Fast Commands Block

If you want a minimal command set for live operation, use this sequence:

```bash
ssh anto@<VPS_IP>
cd /home/anto/pumpfun-bot
pm2 status
pm2 logs bot --lines 120 | grep "PostMortem Agent module loaded"
curl http://127.0.0.1:3001/api/agent/postmortems
curl http://127.0.0.1:3001/api/agent/learned-rules
curl http://127.0.0.1:3001/api/simulation/trades?limit=5
pm2 logs bot | grep --line-buffered "PostMortemAgent\|LearnerAgent\|Trade closed\|Recorded trade entry\|ERROR"
```

---

## If You Need to Roll Back Quickly

```bash
cd /home/anto/pumpfun-bot
pm2 stop all
BACKUP_DIR=$(ls -dt data_backup_* | head -1)
rm -rf data
cp -r "$BACKUP_DIR" data
pm2 startOrRestart ecosystem.config.js --update-env
pm2 status
```
