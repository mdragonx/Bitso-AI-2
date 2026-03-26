import { localSchedulerProvider } from '@/lib/scheduler/providers/local'

/**
 * @deprecated Lyzr scheduler integration has been removed.
 * This module is kept as a compatibility shim and aliases to the local provider.
 */
export const lyzrSchedulerProvider = localSchedulerProvider
