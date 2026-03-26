# Scheduler Production Runbook

This runbook describes how to operate the scheduler subsystem in production across Local and Lyzr providers.

## 1) Environment matrix

| Variable | Required | Local Provider | Lyzr Provider | Notes |
| --- | --- | --- | --- | --- |
| `ENABLE_SCHEDULER` | Yes | `true` to process schedules, `false` to hard-disable | `true` to process schedules, `false` to hard-disable | Global emergency switch. Keep this exposed in deployment config for instant rollback. |
| `SCHEDULER_PROVIDER` | Yes | `local` | `lyzr` | Controls provider factory routing and topology. |
| `LYZR_API_KEY` | Conditionally required | Not used | Required and non-empty | Store only in secret manager; never commit in `.env*`. |

### Validation checklist

- At deploy time, enforce: when `SCHEDULER_PROVIDER=lyzr`, `LYZR_API_KEY` must be present.
- At runtime startup, log effective scheduler mode: disabled/local/lyzr.
- In all environments, verify `ENABLE_SCHEDULER=false` fully suppresses trigger execution.

## 2) Topology: Local vs Lyzr

### Local topology

Use `SCHEDULER_PROVIDER=local` when schedule orchestration and execution are handled inside this service.

- API creates/updates schedules in application persistence.
- Worker loop scans due schedules and acquires a lease lock before execution.
- Execution logs are written to local scheduler execution collections.

Recommended uses:

- Development, staging, and low-complexity production setups.
- Environments where data residency requires in-cluster orchestration.

### Lyzr topology

Use `SCHEDULER_PROVIDER=lyzr` when orchestration is delegated to Lyzr.

- API syncs schedule definitions to Lyzr.
- Lyzr triggers schedule execution callbacks/webhooks into this service.
- Service persists normalized execution/audit logs so operational tooling remains consistent.

Recommended uses:

- Higher-scale production environments.
- Teams preferring external orchestration and trigger fan-out management.

### Topology decision guide

- Prefer **Local** when minimizing external dependency footprint is the priority.
- Prefer **Lyzr** when operational scale, distributed dispatch, or managed scheduler features are needed.

## 3) Scaling model

Choose one model per environment and document it in the environment runbook.

### Model A: Single worker leader (default)

- Exactly one active worker process runs trigger polling/execution at a time.
- Optional standby workers are deployed with scheduler disabled.
- Failover is achieved by promoting standby and demoting failed leader.

Pros:

- Simpler reasoning and lower lock contention.
- Easier incident triage.

Cons:

- Leader failure causes temporary trigger lag until failover.

### Model B: Distributed locking (advanced)

- Multiple workers are active concurrently.
- Every schedule execution must acquire a lease/lock with expiration.
- Idempotency keys are required to guard against duplicate side effects.

Pros:

- Higher availability and throughput.
- Faster recovery from individual worker loss.

Cons:

- More complex failure modes (split-brain, lock starvation, duplicate attempts).

### Scaling safeguards (both models)

- Set lock TTL > max expected execution time + network jitter.
- Enforce max concurrent executions per tenant/workspace.
- Emit metrics for lock acquisition success rate, queue lag, and execution duration p95/p99.

## 4) Failure recovery and replay strategy

## Failure classes

1. **Transient execution failure** (timeouts, intermittent dependency failure).
2. **Persistent execution failure** (invalid config, auth failure, malformed payload).
3. **Scheduler drift/backlog** (workers down, lock contention, provider outage).
4. **Write-path failure** (cannot persist execution/log state).

## Recovery policy

- Use capped exponential backoff for retries (e.g., 1m, 5m, 15m, 60m; cap and dead-letter after N attempts).
- Mark jobs as terminal failure after retry budget exhaustion.
- Alert on repeated terminal failures by action, schedule, and tenant.
- Preserve full attempt history with error class and correlation id.

## Replay strategy

- Replay scope must be explicit: by schedule id, action type, tenant, and time window.
- Replays must support dry-run mode and idempotency controls.
- Default replay order: oldest-first to reduce drift and preserve causal ordering.
- Enforce rate limits during replay to avoid secondary incidents.
- Record replay operator identity, reason, and replay batch id in audit logs.

## 5) Incident response

## A) Stuck schedules (not firing)

1. **Detect**
   - Check trigger lag dashboards and schedule `next_run` vs current time.
   - Validate worker heartbeat or provider webhook delivery metrics.
2. **Contain**
   - If system is unstable, set `ENABLE_SCHEDULER=false` to stop further trigger churn.
3. **Diagnose**
   - Confirm provider selection (`SCHEDULER_PROVIDER`) and secret availability.
   - Inspect lock state for expired/orphaned leases.
   - Verify indexes on due-schedule query and lock fields.
4. **Recover**
   - Restart/promote worker leader or clear stale locks per approved procedure.
   - Run bounded replay for missed interval.
5. **Validate**
   - Confirm new executions and lag trend returning to baseline.
   - Re-enable scheduler if disabled.

## B) Repeated failures (same schedules repeatedly erroring)

1. **Detect**
   - Alert threshold on repeated failure count and terminal-failure ratio.
2. **Contain**
   - Disable only impacted schedules/tenants when possible.
   - Use global `ENABLE_SCHEDULER=false` only for widespread blast radius.
3. **Diagnose**
   - Classify failure domain: provider auth, payload contract, downstream dependency, DB write path.
   - Compare with recent deploys/migrations/config changes.
4. **Mitigate**
   - Fix root cause (secret rotation, schema correction, rollback, dependency failover).
   - Retry a small canary subset before broad replay.
5. **Communicate**
   - Update incident channel every 15–30 minutes with ETA and risk.
6. **Close-out**
   - Capture postmortem with action items, alert tuning, and runbook updates.

## 6) Ship gates (must pass before production rollout)

1. **Contract tests (Local + Lyzr)**
   - For every scheduler action (create/update/delete/trigger/list/log retrieval), run provider-specific contract tests for both `local` and `lyzr`.
   - Reject release if any action lacks dual-provider coverage.

2. **Migration and index readiness**
   - Apply migrations for scheduler collections and required indexes in target environment before enabling traffic.
   - Verify index existence and query plans for trigger/list/log endpoints.

3. **Load test gates**
   - Execute load tests for:
     - trigger endpoint
     - schedule list endpoint
     - execution logs endpoint
   - Define and enforce SLO pass criteria (latency, error rate, saturation).

4. **Canary + rollback switch**
   - Perform staged canary rollout with live monitoring.
   - Keep `ENABLE_SCHEDULER` as immediate rollback switch for rapid disable.
   - Document operator command/path to toggle rollback within minutes.

## 7) Pre-release operational checklist

- [ ] Env matrix validated in deployment system.
- [ ] Provider contract tests passed on CI for Local and Lyzr.
- [ ] Migrations and indexes confirmed in production.
- [ ] Load tests meet SLO.
- [ ] Canary plan approved with explicit rollback owner.
- [ ] On-call has this runbook linked in incident tooling.
