import { localSchedulerProvider } from '@/lib/scheduler/providers/local'
import { lyzrSchedulerProvider } from '@/lib/scheduler/providers/lyzr'
import { SchedulerProvider, SchedulerProviderName } from '@/lib/scheduler/providers/types'

const ENABLE_SCHEDULER = process.env.ENABLE_SCHEDULER?.toLowerCase() !== 'false'

export function resolveSchedulerProviderName(): SchedulerProviderName {
  const override = process.env.SCHEDULER_PROVIDER?.toLowerCase()
  if (override === 'local') {
    return 'local'
  }

  if (override === 'lyzr') {
    return process.env.LYZR_API_KEY ? 'lyzr' : 'local'
  }

  if (ENABLE_SCHEDULER && process.env.LYZR_API_KEY) {
    return 'lyzr'
  }

  return 'local'
}

export function getSchedulerProvider(): SchedulerProvider {
  const provider = resolveSchedulerProviderName()
  return provider === 'lyzr' ? lyzrSchedulerProvider : localSchedulerProvider
}
