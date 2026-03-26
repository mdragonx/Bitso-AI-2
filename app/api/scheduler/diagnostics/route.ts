import { NextRequest, NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth'
import { getLifecycleMetricsSnapshot } from '@/lib/observability/lifecycle'
import { resolveSchedulerProviderName } from '@/lib/scheduler/providerFactory'
import { getSchedulerMetricsSnapshot } from '@/lib/scheduler/observability'
import { getSchedulerWorkerState } from '@/lib/scheduler/worker'

export const runtime = 'nodejs'

function isAuthorized(request: NextRequest) {
  const session = getSessionFromRequest(request)
  if (!session?.userId) return false

  const configuredToken = process.env.SCHEDULER_ADMIN_TOKEN
  if (!configuredToken) return true

  const incomingToken = request.headers.get('x-scheduler-admin-token')
  return Boolean(incomingToken && incomingToken === configuredToken)
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const provider = resolveSchedulerProviderName()
  return NextResponse.json({
    success: true,
    provider: {
      active: provider,
      mode: 'internal',
    },
    workerHeartbeat: getSchedulerWorkerState(),
    metrics: getSchedulerMetricsSnapshot(),
    lifecycleMetrics: getLifecycleMetricsSnapshot(),
    generatedAt: new Date().toISOString(),
  })
}
