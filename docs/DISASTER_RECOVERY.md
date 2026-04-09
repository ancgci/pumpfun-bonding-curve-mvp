# Disaster Recovery

This project now uses a two-layer backup strategy:

1. Local full VPS backup
   - Includes `.env`, `data/`, SQLite DB, logs and runtime state
   - Stored outside git in `backups/vps-runtime/<timestamp>/`

2. GitHub-safe runtime snapshot
   - Excludes `.env` and logs
   - Includes trained agent state, simulation history and a compressed SQLite snapshot
   - Stored in `recovery/github-state/latest/`

## Create Both Layers

```bash
./scripts/backup/two-layer-backup.sh
```

Defaults:

- host from `.vps_host`
- user `anto`
- remote dir `/home/anto/pumpfun-bot`

You can override them:

```bash
./scripts/backup/two-layer-backup.sh --host 1.2.3.4 --user anto --remote-dir /home/anto/pumpfun-bot
```

## What Goes To GitHub

The GitHub-safe snapshot includes:

- `data/agent/`
- `data/simulation/metrics.json`
- compressed `data/simulation/trades.json.gz`
- compressed `dashboard-api/db/pnl_history.db.gz`
- `circuit_breaker_state.json`
- selected persisted runtime config files when present

The snapshot does **not** include:

- `.env`
- logs
- `node_modules`
- temporary output folders

## Restore From GitHub Snapshot

After cloning the repository:

```bash
./scripts/backup/restore-github-state.sh
```

Then provide a valid `.env` manually and start the services.

## Restore From Local Full Backup

The full local backup is a tarball such as:

```bash
backups/vps-runtime/20260409_123456/runtime-state.tgz
```

It contains the complete runtime state, including `.env`. If GitHub is not enough, this is the authoritative local disaster recovery backup.
