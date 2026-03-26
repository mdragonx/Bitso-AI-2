import { startSchedulerWorker } from '@/lib/scheduler/worker'
import { validateRuntimeConfigAtStartup } from '@/lib/config/runtime'

let initialized = false

export async function register() {
  if (initialized) return
  initialized = true

  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') {
    return
  }

  validateRuntimeConfigAtStartup()

  if (process.env.ENABLE_SCHEDULER_WORKER?.toLowerCase() !== 'true') {
    return
  }

  startSchedulerWorker({
    intervalMs: Number(process.env.SCHEDULER_WORKER_INTERVAL_MS || 30_000),
    leaseMs: Number(process.env.SCHEDULER_WORKER_LEASE_MS || 90_000),
    runOnStart: true,
  })
}
