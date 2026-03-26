import getSchedulerAuditEventModel from '@/models/SchedulerAuditEvent'

export type SchedulerAction = 'create' | 'pause' | 'resume' | 'trigger' | 'execute'
export type SchedulerStatus = 'success' | 'failure'

interface SchedulerLogInput {
  owner_user_id: string
  schedule_id?: string | null
  action: SchedulerAction
  provider: string
  status: SchedulerStatus
  latency_ms?: number
  error_class?: string | null
  details?: Record<string, unknown>
}

interface SchedulerAuditInput {
  owner_user_id: string
  schedule_id?: string | null
  action: SchedulerAction
  provider: string
  status: SchedulerStatus
  latency_ms: number
  error_class?: string | null
  details?: Record<string, unknown>
}

interface SchedulerMetricsState {
  totalRuns: number
  totalSuccess: number
  totalFailure: number
  retries: number
  queueLagSamples: number
  queueLagTotalMs: number
  queueLagMaxMs: number
  lastHeartbeatAt: string | null
  lastRunAt: string | null
}

const metricsState: SchedulerMetricsState = {
  totalRuns: 0,
  totalSuccess: 0,
  totalFailure: 0,
  retries: 0,
  queueLagSamples: 0,
  queueLagTotalMs: 0,
  queueLagMaxMs: 0,
  lastHeartbeatAt: null,
  lastRunAt: null,
}

function normalizeErrorClass(errorClass?: string | null) {
  if (!errorClass) return null
  return String(errorClass).trim() || null
}

export function logSchedulerEvent(input: SchedulerLogInput) {
  const payload = {
    component: 'scheduler',
    owner_user_id: input.owner_user_id,
    schedule_id: input.schedule_id || null,
    action: input.action,
    provider: input.provider,
    status: input.status,
    latency_ms: typeof input.latency_ms === 'number' ? Math.max(0, Math.floor(input.latency_ms)) : null,
    error_class: normalizeErrorClass(input.error_class),
    ...(input.details ? { details: input.details } : {}),
    timestamp: new Date().toISOString(),
  }

  const serialized = JSON.stringify(payload)
  if (input.status === 'failure') {
    console.error(serialized)
    return
  }

  console.info(serialized)
}

export async function persistSchedulerAuditEvent(input: SchedulerAuditInput) {
  try {
    const SchedulerAuditEvent = await getSchedulerAuditEventModel()
    await SchedulerAuditEvent.create({
      owner_user_id: input.owner_user_id,
      schedule_id: input.schedule_id || null,
      action: input.action,
      provider: input.provider,
      status: input.status,
      latency_ms: Math.max(0, Math.floor(input.latency_ms)),
      error_class: normalizeErrorClass(input.error_class),
      details: input.details || {},
      occurred_at: new Date(),
    })
  } catch (error) {
    console.error(
      JSON.stringify({
        component: 'scheduler',
        action: 'audit_write',
        status: 'failure',
        error_class: error instanceof Error ? error.name : 'UnknownError',
        error_message: error instanceof Error ? error.message : 'Unknown audit event write error',
        timestamp: new Date().toISOString(),
      })
    )
  }
}

export function recordExecutionMetrics(input: { success: boolean; queueLagMs?: number; retries?: number }) {
  metricsState.totalRuns += 1
  metricsState.lastRunAt = new Date().toISOString()

  if (input.success) {
    metricsState.totalSuccess += 1
  } else {
    metricsState.totalFailure += 1
  }

  if (typeof input.retries === 'number' && input.retries > 0) {
    metricsState.retries += Math.floor(input.retries)
  }

  if (typeof input.queueLagMs === 'number' && Number.isFinite(input.queueLagMs) && input.queueLagMs >= 0) {
    const normalized = Math.floor(input.queueLagMs)
    metricsState.queueLagSamples += 1
    metricsState.queueLagTotalMs += normalized
    metricsState.queueLagMaxMs = Math.max(metricsState.queueLagMaxMs, normalized)
  }
}

export function recordWorkerHeartbeat() {
  metricsState.lastHeartbeatAt = new Date().toISOString()
}

export function getSchedulerMetricsSnapshot() {
  const totalRuns = metricsState.totalRuns
  const totalSuccess = metricsState.totalSuccess
  const totalFailure = metricsState.totalFailure

  return {
    totalRuns,
    totalSuccess,
    totalFailure,
    successRate: totalRuns ? totalSuccess / totalRuns : 0,
    failureRate: totalRuns ? totalFailure / totalRuns : 0,
    retries: metricsState.retries,
    queueLag: {
      samples: metricsState.queueLagSamples,
      avgMs: metricsState.queueLagSamples ? metricsState.queueLagTotalMs / metricsState.queueLagSamples : 0,
      maxMs: metricsState.queueLagMaxMs,
    },
    lastHeartbeatAt: metricsState.lastHeartbeatAt,
    lastRunAt: metricsState.lastRunAt,
  }
}
