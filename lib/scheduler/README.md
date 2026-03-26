# Scheduler Worker

`lib/scheduler/worker.ts` provides a server-side interval worker that:

- fetches due schedules (`is_active=true` and `next_run_time <= now`)
- acquires an atomic per-schedule lease lock (`lock_owner` + `lock_expires_at`) to avoid duplicate runs
- executes the AI agent server-side using schedule `message` + `agent_id`
- writes execution logs into `ScheduleExecution`
- computes and persists the next run timestamp from the schedule cron expression and timezone

## Bootstrapping

Two bootstrap paths are available:

1. **Runtime bootstrap** (`instrumentation.ts`) when `ENABLE_SCHEDULER_WORKER=true`
2. **Dedicated worker control endpoint** (`/api/scheduler/worker`) with actions:
   - `POST {"action":"start"}`
   - `POST {"action":"stop"}`
   - `POST {"action":"tick"}`
   - `GET` for state

Protect the API route with `SCHEDULER_WORKER_TOKEN` and send it as `x-scheduler-worker-token`.

## Horizontal scaling requirement

> Run **exactly one active scheduler runner** in production.

Even though per-schedule leases prevent most duplicate executions, deploying multiple always-on runners can increase lock contention and operational complexity. The recommended pattern is a single dedicated worker process (or one instance with worker enabled) per environment.

## Environment variables

- `ENABLE_SCHEDULER_WORKER=true` to auto-start in runtime bootstrap
- `SCHEDULER_WORKER_INTERVAL_MS` default `30000` (clamped to `30000-60000`)
- `SCHEDULER_WORKER_LEASE_MS` default `90000`
- `SCHEDULER_WORKER_ID` optional worker identity override
- `SCHEDULER_WORKER_TOKEN` optional API authorization token
