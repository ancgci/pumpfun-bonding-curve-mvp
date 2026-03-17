# Loss Post-Mortem Agent

This document records the local implementation completed for the new offline AI agent dedicated to analyzing losing trades.

Status: implemented locally, validated with typecheck and targeted tests, not deployed to VPS yet.

---

## Goal

Add a post-trade feedback layer that:

- analyzes only losing trades;
- runs asynchronously, outside the real-time decision path;
- reconstructs the trade context with technical and structural data;
- explains the most likely root cause of the loss;
- produces reusable recommendations and candidate rules for future learning.

This new layer does not participate in the live buy/sell path. It operates after a trade closes.

---

## What Was Implemented

### 1. Backup Before Changes

A full local backup of the project state was created before implementation:

- `backups/pre-postmortem-agent-20260317-141018.tar.gz`

---

### 2. New Post-Mortem Data Model

New shared types were created in:

- `utils/postMortemTypes.ts`

Main structures:

- `TradeDecisionContext`
- `TradeMarketSnapshot`
- `TradeMonitoringPoint`
- `TradePostMortemReport`
- `PostMortemStatus`

These types define how the bot stores entry context, exit context, monitoring trace, and the final post-mortem analysis.

---

### 3. Trade Context Capture

A new helper layer was added in:

- `utils/postMortemContext.ts`

Implemented helpers:

- `buildTradeEntrySnapshot(...)`
- `buildTradeExitSnapshot(...)`
- `buildTradeMonitoringPoint(...)`
- `buildTradeDecisionContext(...)`

This layer captures:

- TA snapshot at entry/exit;
- TA score and formatted breakdown;
- recent 1-second candles;
- volatility windows;
- organicity snapshot when available;
- decision metadata such as confidence, TP, SL and reasoning.

---

### 4. Extended Volatility Snapshot Support

`utils/volatilityMonitor.ts` was extended to support richer replay data:

- `PricePeriod` now includes `open`;
- `getRecentPeriods1s(...)` returns recent 1-second candles;
- `TASnapshotV2` now includes `closes1s`.

This allows replay-friendly trade reconstruction without relying only on live memory state.

---

### 5. Trade Persistence Enrichment

`utils/simulationEngine.ts` and `utils/db.ts` were upgraded to persist post-mortem context.

New SQLite columns added to `simulated_trades`:

- `decision_context`
- `entry_snapshot`
- `exit_snapshot`
- `monitoring_trace`
- `postmortem_status`
- `postmortem_summary`
- `postmortem_report`
- `postmortem_analyzed_at`

New runtime capabilities:

- save enriched entry snapshot on simulated BUY;
- append monitoring points during trade life;
- save exit snapshot on closure;
- mark trades as pending/processed for post-mortem;
- query pending losing trades and recent analyzed post-mortems.

The JSON backup file `data/simulation/trades.json` now also carries these fields.

---

### 6. PostMortemAgent Worker

New file:

- `utils/postMortemAgent.ts`

Implemented flow:

1. fetch pending losing trades;
2. run deterministic loss analysis first;
3. optionally enrich the result with LLM;
4. persist root cause, evidence, recommendations and candidate rules;
5. mark the trade as `DONE` or `FAILED`.

Current deterministic root-cause families:

- `LATE_ENTRY`
- `WEAK_MOMENTUM`
- `ARTIFICIAL_FLOW`
- `STOP_TOO_TIGHT`
- `NO_FOLLOW_THROUGH`

Produced output includes:

- summary;
- root cause and confidence;
- better-entry suggestion;
- evidence list;
- findings;
- recommendations;
- candidate rules;
- MFE/MAE style excursion metrics.

LLM enrichment is optional and guarded by:

- `POSTMORTEM_LLM_ENABLED=false` to disable;
- missing API key also skips enrichment safely.

---

### 7. Integration With Existing Learning Cycle

`index.ts` now runs the offline learning workers in this order:

1. `runPostMortemCycle()`
2. `runLearningCycle()`

This preserves the original `LearnerAgent`, but improves its input quality.

`utils/learnerAgent.ts` now consumes:

- `postMortemSummary`
- `postMortemReport.rootCause`
- `postMortemReport.recommendations`

So the learned rules are generated from richer reconstructed losses, not only shallow log reasons.

---

### 8. Agent Trade Flow Integration

`utils/agentOrchestrator.ts` was updated to:

- capture an enriched entry snapshot before recording the simulated trade;
- capture monitoring points while the trade is open;
- capture an enriched exit snapshot on TP, SL or timeout.

Important: the online execution pipeline was not slowed down with extra blocking analysis. The heavy reasoning remains offline.

---

### 9. API Exposure

New dashboard/API endpoint added in:

- `dashboard-api/server.ts`

Endpoint:

- `GET /api/agent/postmortems`

Purpose:

- return the most recent completed trade autopsies for inspection in local development and, later, in production.

---

## Validation Performed

Local validation completed:

- `npm run typecheck`
- `npx jest --config jest.config.js test/ai-agent/advanced/full-learning-cycle.test.ts --runInBand`

Additional test coverage was added in:

- `test/ai-agent/advanced/full-learning-cycle.test.ts`

Covered scenarios:

- learner prompt now includes post-mortem context;
- post-mortem worker generates structured analysis for a losing trade;
- learning loop remains compatible with existing agent behavior.

---

## Files Added

- `docs/LOSS_POSTMORTEM_AGENT.md`
- `utils/postMortemAgent.ts`
- `utils/postMortemContext.ts`
- `utils/postMortemTypes.ts`

## Files Updated

- `README.md`
- `docs/AI_AGENT.md`
- `docs/AI_AGENTS_ARCHITECTURE.md`
- `index.ts`
- `dashboard-api/server.ts`
- `utils/agentOrchestrator.ts`
- `utils/db.ts`
- `utils/learnerAgent.ts`
- `utils/simulationEngine.ts`
- `utils/volatilityMonitor.ts`
- `test/ai-agent/advanced/full-learning-cycle.test.ts`

---

## Production Notes

What is ready:

- local implementation;
- schema changes with backward-compatible migrations;
- offline worker flow;
- integration with the existing learning cycle;
- API read access for analyzed losses.
- controlled first-rollout default on VPS with `POSTMORTEM_LLM_ENABLED=false`.

What is intentionally not done yet:

- VPS deployment;
- long-running live validation;
- dashboard UI rendering for post-mortem reports;
- automatic promotion of all candidate rules into hard filters.

The current design keeps the post-mortem agent advisory-first. It improves learning quality without directly mutating live thresholds.

For deployment procedure and rollout checks, see:

- `docs/LOSS_POSTMORTEM_VPS_DEPLOY.md`
