import { randomUUID } from 'crypto'
import getScheduleExecutionModel from '@/models/ScheduleExecution'
import getScheduleModel from '@/models/Schedule'
import { getAIProviderClient } from '@/lib/ai/providerFactory'
import {
  getSchedulerMetricsSnapshot,
  logSchedulerEvent,
  persistSchedulerAuditEvent,
  recordExecutionMetrics,
  recordWorkerHeartbeat,
} from '@/lib/scheduler/observability'
import { getNextRunTime } from '@/lib/scheduler/cron'

const MIN_INTERVAL_MS = 30_000
const MAX_INTERVAL_MS = 60_000
const DEFAULT_INTERVAL_MS = 30_000
const DEFAULT_LEASE_MS = 90_000

const WORKER_ID = process.env.SCHEDULER_WORKER_ID || `scheduler-${randomUUID()}`

type SchedulerWorkerStatus = 'idle' | 'running' | 'stopped'

interface SchedulerWorkerState {
  status: SchedulerWorkerStatus
  timer: NodeJS.Timeout | null
  intervalMs: number
  leaseMs: number
  tickInFlight: boolean
  lastStartedAt: Date | null
  lastCompletedAt: Date | null
  lastError: string | null
}

const state: SchedulerWorkerState = {
  status: 'idle',
  timer: null,
  intervalMs: DEFAULT_INTERVAL_MS,
  leaseMs: DEFAULT_LEASE_MS,
  tickInFlight: false,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastError: null,
}

function clampInterval(intervalMs?: number) {
  if (!intervalMs || !Number.isFinite(intervalMs)) return DEFAULT_INTERVAL_MS
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.floor(intervalMs)))
}

function getNow() {
  return new Date()
}

export function computeNextRunTime(cronExpression: string, timezone = 'UTC', fromDate = new Date()) {
  return getNextRunTime(cronExpression, timezone, fromDate)
}

async function callAIAgentServerSide(message: string, agentId: string, userId?: string) {
  const client = getAIProviderClient()

  return client.generateStructuredResponse(
    {
      message,
      agent_id: agentId,
      user_id: userId,
    },
    undefined
  )
}

async function acquireScheduleLock(scheduleId: string, leaseMs: number) {
  const Schedule = await getScheduleModel()
  const now = getNow()
  const leaseUntil = new Date(now.getTime() + leaseMs)

  return Schedule.findOneAndUpdate(
    {
      _id: scheduleId,
      is_active: true,
      next_run_time: { $lte: now },
      $or: [{ lock_expires_at: null }, { lock_expires_at: { $exists: false } }, { lock_expires_at: { $lte: now } }],
    },
    {
      $set: {
        lock_owner: WORKER_ID,
        lock_expires_at: leaseUntil,
        last_run_started_at: now,
      },
    },
    { new: true }
  )
}

async function releaseScheduleLock(scheduleId: string) {
  const Schedule = await getScheduleModel()
  await Schedule.updateOne(
    { _id: scheduleId, lock_owner: WORKER_ID },
    { $set: { lock_owner: null, lock_expires_at: null } }
  )
}

async function processSchedule(scheduleDoc: any) {
  const Execution = await getScheduleExecutionModel()
  const Schedule = await getScheduleModel()

  const scheduleId = String(scheduleDoc._id)
  const executedAt = getNow()
  const startedAtMs = Date.now()
  const queueLagMs = Math.max(0, executedAt.getTime() - new Date(scheduleDoc.next_run_time || executedAt).getTime())
  const provider = 'local'
  const maxAttempts = Math.max(1, Number(scheduleDoc.max_retries ?? 1))
  const retryDelayMs = Math.max(0, Number(scheduleDoc.retry_delay ?? 0) * 1000)
  let finalSuccess = false
  let retriesUsed = 0
  let errorClass: string | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const aiResponse = await callAIAgentServerSide(scheduleDoc.message, scheduleDoc.agent_id, scheduleDoc.owner_user_id)
      const success = aiResponse.status === 'success'
      if (!success) {
        errorClass = 'AgentExecutionError'
      }

      await Execution.create({
        schedule_id: scheduleId,
        owner_user_id: scheduleDoc.owner_user_id,
        executed_at: executedAt,
        attempt,
        success,
        response_status: success ? 200 : 500,
        response_output: JSON.stringify(aiResponse.result ?? {}),
        error_message: aiResponse.status === 'error' ? aiResponse.message || 'Agent execution failed' : null,
        provider,
      })

      if (success) {
        finalSuccess = true
        retriesUsed = Math.max(0, attempt - 1)
        break
      }

      if (attempt < maxAttempts && retryDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown scheduler error'
      errorClass = error instanceof Error ? error.name : 'UnknownSchedulerError'

      await Execution.create({
        schedule_id: scheduleId,
        owner_user_id: scheduleDoc.owner_user_id,
        executed_at: executedAt,
        attempt,
        success: false,
        response_status: 500,
        response_output: '',
        error_message: errorMessage,
        provider,
      })

      if (attempt < maxAttempts && retryDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }
  }

  const nextRun = computeNextRunTime(scheduleDoc.cron_expression, scheduleDoc.timezone || 'UTC', executedAt)
  if (!finalSuccess) {
    retriesUsed = Math.max(0, maxAttempts - 1)
  }

  await Schedule.updateOne(
    { _id: scheduleDoc._id, lock_owner: WORKER_ID },
    {
      $set: {
        last_run_at: executedAt,
        last_run_success: finalSuccess,
        next_run_time: nextRun,
        lock_owner: null,
        lock_expires_at: null,
      },
    }
  )

  const latencyMs = Date.now() - startedAtMs
  const status = finalSuccess ? 'success' : 'failure'
  logSchedulerEvent({
    owner_user_id: scheduleDoc.owner_user_id,
    schedule_id: scheduleId,
    action: 'execute',
    provider,
    status,
    latency_ms: latencyMs,
    error_class: errorClass,
    details: { queue_lag_ms: queueLagMs, retries: retriesUsed },
  })
  await persistSchedulerAuditEvent({
    owner_user_id: scheduleDoc.owner_user_id,
    schedule_id: scheduleId,
    action: 'execute',
    provider,
    status,
    latency_ms: latencyMs,
    error_class: errorClass,
    details: { queue_lag_ms: queueLagMs, retries: retriesUsed },
  })
  recordExecutionMetrics({ success: finalSuccess, queueLagMs, retries: retriesUsed })
}

export async function runSchedulerTick() {
  if (state.tickInFlight) return

  state.tickInFlight = true
  state.status = 'running'
  state.lastStartedAt = getNow()

  try {
    recordWorkerHeartbeat()
    const Schedule = await getScheduleModel()
    const now = getNow()

    const dueSchedules = await Schedule.find({
      is_active: true,
      next_run_time: { $lte: now },
    })
      .sort({ next_run_time: 1 })
      .limit(25)

    for (const dueSchedule of dueSchedules) {
      const scheduleId = String(dueSchedule._id)
      const locked = await acquireScheduleLock(scheduleId, state.leaseMs)
      if (!locked) continue

      await processSchedule(locked)
      await releaseScheduleLock(scheduleId)
    }

    state.lastCompletedAt = getNow()
    state.lastError = null
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : 'Unknown worker error'
  } finally {
    state.tickInFlight = false
    state.status = state.timer ? 'idle' : 'stopped'
  }
}

export function startSchedulerWorker(options?: { intervalMs?: number; leaseMs?: number; runOnStart?: boolean }) {
  if (state.timer) {
    return getSchedulerWorkerState()
  }

  state.intervalMs = clampInterval(options?.intervalMs)
  state.leaseMs = options?.leaseMs && options.leaseMs > 0 ? Math.floor(options.leaseMs) : DEFAULT_LEASE_MS

  if (options?.runOnStart ?? true) {
    void runSchedulerTick()
  }

  state.timer = setInterval(() => {
    void runSchedulerTick()
  }, state.intervalMs)

  return getSchedulerWorkerState()
}

export function stopSchedulerWorker() {
  if (state.timer) {
    clearInterval(state.timer)
    state.timer = null
  }

  state.status = 'stopped'
  return getSchedulerWorkerState()
}

export function getSchedulerWorkerState() {
  return {
    workerId: WORKER_ID,
    status: state.status,
    intervalMs: state.intervalMs,
    leaseMs: state.leaseMs,
    tickInFlight: state.tickInFlight,
    lastStartedAt: state.lastStartedAt?.toISOString() || null,
    lastCompletedAt: state.lastCompletedAt?.toISOString() || null,
    lastError: state.lastError,
    metrics: getSchedulerMetricsSnapshot(),
  }
}
