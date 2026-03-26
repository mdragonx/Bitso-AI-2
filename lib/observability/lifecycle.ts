import crypto from 'crypto'
import type { NextRequest } from 'next/server'

type LogSeverity = 'debug' | 'info' | 'warn' | 'error'

type LifecycleMetricState = {
  analysis: {
    count: number
    totalLatencyMs: number
    maxLatencyMs: number
    failures: number
  }
  execution: {
    success: number
    failure: number
    consecutiveFailures: number
    rejectionReasons: Record<string, number>
    lastFailureAt: string | null
  }
  auth: {
    anomalies: number
    recentAnomalyTimestamps: number[]
  }
  alerts: {
    executionFailureBursts: number
    authAnomalyBursts: number
    lastExecutionAlertAt: string | null
    lastAuthAlertAt: string | null
  }
}

const lifecycleMetricsState: LifecycleMetricState = {
  analysis: {
    count: 0,
    totalLatencyMs: 0,
    maxLatencyMs: 0,
    failures: 0,
  },
  execution: {
    success: 0,
    failure: 0,
    consecutiveFailures: 0,
    rejectionReasons: {},
    lastFailureAt: null,
  },
  auth: {
    anomalies: 0,
    recentAnomalyTimestamps: [],
  },
  alerts: {
    executionFailureBursts: 0,
    authAnomalyBursts: 0,
    lastExecutionAlertAt: null,
    lastAuthAlertAt: null,
  },
}

const EXECUTION_FAILURE_ALERT_THRESHOLD = Math.max(2, Number(process.env.EXECUTION_FAILURE_ALERT_THRESHOLD || 3))
const AUTH_ANOMALY_ALERT_THRESHOLD = Math.max(3, Number(process.env.AUTH_ANOMALY_ALERT_THRESHOLD || 5))
const AUTH_ANOMALY_WINDOW_MS = Math.max(60_000, Number(process.env.AUTH_ANOMALY_WINDOW_MS || 10 * 60 * 1000))

export type CorrelationContext = {
  correlationId: string
  requestId: string
}

export function getCorrelationContextFromRequest(req: NextRequest): CorrelationContext {
  const fromHeader = req.headers.get('x-correlation-id') || req.headers.get('x-request-id')
  const correlationId = fromHeader?.trim() || crypto.randomUUID()
  const requestId = req.headers.get('x-request-id')?.trim() || crypto.randomUUID()
  return { correlationId, requestId }
}

export function withLifecycleLog(severity: LogSeverity, event: string, context: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    component: 'agent-lifecycle',
    severity,
    event,
    ...context,
  }

  const serialized = JSON.stringify(payload)
  if (severity === 'error') {
    console.error(serialized)
    return
  }
  if (severity === 'warn') {
    console.warn(serialized)
    return
  }
  if (severity === 'debug') {
    console.debug(serialized)
    return
  }
  console.info(serialized)
}

export function recordAnalysisMetric(input: { latencyMs: number; success: boolean }) {
  lifecycleMetricsState.analysis.count += 1
  lifecycleMetricsState.analysis.totalLatencyMs += Math.max(0, Math.floor(input.latencyMs))
  lifecycleMetricsState.analysis.maxLatencyMs = Math.max(
    lifecycleMetricsState.analysis.maxLatencyMs,
    Math.max(0, Math.floor(input.latencyMs))
  )
  if (!input.success) {
    lifecycleMetricsState.analysis.failures += 1
  }
}

export function recordExecutionMetric(input: { success: boolean; rejectionReason?: string | null }) {
  if (input.success) {
    lifecycleMetricsState.execution.success += 1
    lifecycleMetricsState.execution.consecutiveFailures = 0
    return
  }

  lifecycleMetricsState.execution.failure += 1
  lifecycleMetricsState.execution.consecutiveFailures += 1
  lifecycleMetricsState.execution.lastFailureAt = new Date().toISOString()

  const rejectionReason = String(input.rejectionReason || '').trim()
  if (rejectionReason) {
    lifecycleMetricsState.execution.rejectionReasons[rejectionReason] =
      (lifecycleMetricsState.execution.rejectionReasons[rejectionReason] || 0) + 1
  }

  if (lifecycleMetricsState.execution.consecutiveFailures >= EXECUTION_FAILURE_ALERT_THRESHOLD) {
    lifecycleMetricsState.alerts.executionFailureBursts += 1
    lifecycleMetricsState.alerts.lastExecutionAlertAt = new Date().toISOString()
    withLifecycleLog('error', 'execution_failure_burst_alert', {
      threshold: EXECUTION_FAILURE_ALERT_THRESHOLD,
      consecutive_failures: lifecycleMetricsState.execution.consecutiveFailures,
      rejection_reason: rejectionReason || null,
    })
  }
}

export function recordAuthAnomaly(input: { reason: string; userId?: string | null; correlationId?: string }) {
  lifecycleMetricsState.auth.anomalies += 1
  const now = Date.now()
  lifecycleMetricsState.auth.recentAnomalyTimestamps.push(now)
  lifecycleMetricsState.auth.recentAnomalyTimestamps = lifecycleMetricsState.auth.recentAnomalyTimestamps.filter(
    (timestamp) => now - timestamp <= AUTH_ANOMALY_WINDOW_MS
  )

  withLifecycleLog('warn', 'auth_anomaly', {
    reason: input.reason,
    user_id: input.userId || null,
    correlation_id: input.correlationId || null,
    anomalies_in_window: lifecycleMetricsState.auth.recentAnomalyTimestamps.length,
    window_ms: AUTH_ANOMALY_WINDOW_MS,
  })

  if (lifecycleMetricsState.auth.recentAnomalyTimestamps.length >= AUTH_ANOMALY_ALERT_THRESHOLD) {
    lifecycleMetricsState.alerts.authAnomalyBursts += 1
    lifecycleMetricsState.alerts.lastAuthAlertAt = new Date().toISOString()
    withLifecycleLog('error', 'auth_anomaly_burst_alert', {
      threshold: AUTH_ANOMALY_ALERT_THRESHOLD,
      window_ms: AUTH_ANOMALY_WINDOW_MS,
      anomalies_in_window: lifecycleMetricsState.auth.recentAnomalyTimestamps.length,
    })
  }
}

export function getLifecycleMetricsSnapshot() {
  const analysisCount = lifecycleMetricsState.analysis.count
  return {
    analysis: {
      total: analysisCount,
      failures: lifecycleMetricsState.analysis.failures,
      avgLatencyMs: analysisCount ? lifecycleMetricsState.analysis.totalLatencyMs / analysisCount : 0,
      maxLatencyMs: lifecycleMetricsState.analysis.maxLatencyMs,
    },
    execution: {
      success: lifecycleMetricsState.execution.success,
      failure: lifecycleMetricsState.execution.failure,
      consecutiveFailures: lifecycleMetricsState.execution.consecutiveFailures,
      rejectionReasons: lifecycleMetricsState.execution.rejectionReasons,
      lastFailureAt: lifecycleMetricsState.execution.lastFailureAt,
    },
    auth: {
      anomalies: lifecycleMetricsState.auth.anomalies,
      anomaliesInWindow: lifecycleMetricsState.auth.recentAnomalyTimestamps.length,
      windowMs: AUTH_ANOMALY_WINDOW_MS,
    },
    alerts: lifecycleMetricsState.alerts,
  }
}
