import { localSchedulerProvider } from '@/lib/scheduler/providers/local'
import { SchedulerProvider, SchedulerProviderName } from '@/lib/scheduler/providers/types'

const ENABLE_SCHEDULER = process.env.ENABLE_SCHEDULER?.toLowerCase() !== 'false'

export function resolveSchedulerProviderName(): SchedulerProviderName {
  const override = process.env.SCHEDULER_PROVIDER?.toLowerCase()

  if (override && override !== 'local') {
    console.warn(`[scheduler] Unsupported provider override "${override}". Falling back to local provider.`)
  }

  if (!ENABLE_SCHEDULER) {
    return 'local'
  }

  return 'local'
}

export function getSchedulerProvider(): SchedulerProvider {
  return localSchedulerProvider
}
