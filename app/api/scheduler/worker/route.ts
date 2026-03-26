import { NextRequest, NextResponse } from 'next/server'

import {
  getSchedulerWorkerState,
  runSchedulerTick,
  startSchedulerWorker,
  stopSchedulerWorker,
} from '@/lib/scheduler/worker'

export const runtime = 'nodejs'

function isAuthorized(request: NextRequest) {
  const configuredToken = process.env.SCHEDULER_WORKER_TOKEN
  if (!configuredToken) return true

  const incomingToken = request.headers.get('x-scheduler-worker-token')
  return Boolean(incomingToken && incomingToken === configuredToken)
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    success: true,
    state: getSchedulerWorkerState(),
  })
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const action = body?.action || 'start'

  if (action === 'start') {
    const state = startSchedulerWorker({
      intervalMs: typeof body.intervalMs === 'number' ? body.intervalMs : undefined,
      leaseMs: typeof body.leaseMs === 'number' ? body.leaseMs : undefined,
      runOnStart: body.runOnStart !== false,
    })

    return NextResponse.json({ success: true, action: 'start', state })
  }

  if (action === 'stop') {
    const state = stopSchedulerWorker()
    return NextResponse.json({ success: true, action: 'stop', state })
  }

  if (action === 'tick') {
    await runSchedulerTick()
    return NextResponse.json({ success: true, action: 'tick', state: getSchedulerWorkerState() })
  }

  return NextResponse.json({ success: false, error: 'Invalid action. Use start, stop, or tick.' }, { status: 400 })
}
