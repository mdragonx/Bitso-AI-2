import {
  SchedulerCreateParams,
  SchedulerLogsParams,
  SchedulerProvider,
  SchedulerProviderResult,
  SchedulerRecentParams,
  SchedulerSchedule,
} from '@/lib/scheduler/providers/types'

const SCHEDULER_BASE_URL = 'https://scheduler.studio.lyzr.ai'
const LYZR_API_KEY = process.env.LYZR_API_KEY || ''
const MAX_LIMIT = 100
const MAX_SKIP = 1000

function headers() {
  return {
    'Content-Type': 'application/json',
    accept: 'application/json',
    'x-api-key': LYZR_API_KEY,
  }
}

async function safeJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function safeText(response: Response) {
  try {
    return await response.text()
  } catch {
    return null
  }
}

async function mapError(response: Response, prefix: string): Promise<SchedulerProviderResult<never>> {
  const details = (await safeText(response)) || undefined
  return {
    success: false,
    status: response.status,
    error: `${prefix}: ${response.status}`,
    details,
  }
}

function normalizeSchedule(raw: any): SchedulerSchedule {
  return {
    id: String(raw?.id || raw?._id || ''),
    user_id: String(raw?.user_id || ''),
    agent_id: String(raw?.agent_id || ''),
    message: String(raw?.message || ''),
    cron_expression: String(raw?.cron_expression || ''),
    timezone: String(raw?.timezone || 'UTC'),
    max_retries: Number(raw?.max_retries ?? 3),
    retry_delay: Number(raw?.retry_delay ?? 300),
    is_active: Boolean(raw?.is_active),
    created_at: raw?.created_at ? new Date(raw.created_at).toISOString() : new Date().toISOString(),
    updated_at: raw?.updated_at ? new Date(raw.updated_at).toISOString() : new Date().toISOString(),
    next_run_time: raw?.next_run_time ? new Date(raw.next_run_time).toISOString() : null,
    last_run_at: raw?.last_run_at ? new Date(raw.last_run_at).toISOString() : null,
    last_run_success: typeof raw?.last_run_success === 'boolean' ? raw.last_run_success : null,
  }
}

function sanitizePagination(skip?: number, limit?: number) {
  const normalizedSkip = typeof skip === 'number' && Number.isFinite(skip) ? Math.floor(skip) : 0
  const normalizedLimit = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 50
  return {
    skip: Math.min(Math.max(0, normalizedSkip), MAX_SKIP),
    limit: Math.min(Math.max(1, normalizedLimit), MAX_LIMIT),
  }
}

function scheduleOwnedByUser(schedule: SchedulerSchedule, userId: string) {
  return schedule.user_id === userId
}

async function fetchOwnedSchedule(userId: string, scheduleId: string): Promise<SchedulerProviderResult<{ schedule: SchedulerSchedule }>> {
  const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/${scheduleId}`, { headers: headers() })
  if (!response.ok) return mapError(response, 'Scheduler API error')

  const data = await safeJson(response)
  const schedule = normalizeSchedule(data)
  if (!scheduleOwnedByUser(schedule, userId)) {
    return { success: false, status: 403, error: 'Cross-user schedule access denied' }
  }

  return { success: true, data: { schedule } }
}

export const lyzrSchedulerProvider: SchedulerProvider = {
  name: 'lyzr',

  async list({ userId, agentId, isActive, skip, limit }) {
    const pagination = sanitizePagination(skip, limit)
    const query = new URLSearchParams()
    query.set('user_id', userId)
    if (agentId) query.set('agent_id', agentId)
    if (typeof isActive === 'boolean') query.set('is_active', String(isActive))
    query.set('skip', String(pagination.skip))
    query.set('limit', String(pagination.limit))

    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/?${query}`, { headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')

    const data = await safeJson(response)
    const schedules = Array.isArray(data?.schedules) ? data.schedules.map(normalizeSchedule) : []
    const scopedSchedules = schedules.filter(schedule => scheduleOwnedByUser(schedule, userId))
    if (scopedSchedules.length !== schedules.length) {
      return { success: false, status: 403, error: 'Cross-user schedule access denied' }
    }
    return {
      success: true,
      data: {
        schedules: scopedSchedules,
        total: scopedSchedules.length,
      },
    }
  },

  async get(userId, scheduleId) {
    return fetchOwnedSchedule(userId, scheduleId)
  },

  async byAgent(userId, agentId) {
    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/by-agent/${agentId}`, { headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')

    const data = await safeJson(response)
    const schedules = Array.isArray(data?.schedules) ? data.schedules.map(normalizeSchedule) : []
    const scopedSchedules = schedules.filter(schedule => scheduleOwnedByUser(schedule, userId))
    if (scopedSchedules.length !== schedules.length) {
      return { success: false, status: 403, error: 'Cross-user schedule access denied' }
    }
    return {
      success: true,
      data: {
        agent_id: String(data?.agent_id || agentId),
        schedules: scopedSchedules,
        webhooks: Array.isArray(data?.webhooks) ? data.webhooks : [],
      },
    }
  },

  async logs({ userId, scheduleId, skip, limit }) {
    const ownership = await fetchOwnedSchedule(userId, scheduleId)
    if (!ownership.success) {
      return { success: false, status: ownership.status || 403, error: ownership.error || 'Cross-user schedule access denied' }
    }

    const pagination = sanitizePagination(skip, limit)
    const query = new URLSearchParams()
    query.set('skip', String(pagination.skip))
    query.set('limit', String(pagination.limit))
    const suffix = query.toString() ? `?${query.toString()}` : ''

    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/${scheduleId}/logs${suffix}`, { headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')

    const data = await safeJson(response)
    const executions = Array.isArray(data?.executions)
      ? data.executions.filter((execution: any) => String(execution?.user_id || execution?.owner_user_id || '') === userId)
      : []
    if (Array.isArray(data?.executions) && executions.length !== data.executions.length) {
      return { success: false, status: 403, error: 'Cross-user execution access denied' }
    }
    return {
      success: true,
      data: {
        executions,
        total: executions.length,
      },
    }
  },

  async recent({ userId, agentId, success, hours, days, skip, limit }) {
    const pagination = sanitizePagination(skip, limit)
    const query = new URLSearchParams()
    query.set('user_id', userId)
    if (agentId) query.set('agent_id', agentId)
    if (typeof success === 'boolean') query.set('success', String(success))
    if (typeof hours === 'number') query.set('hours', String(hours))
    if (typeof days === 'number') query.set('days', String(days))
    query.set('skip', String(pagination.skip))
    query.set('limit', String(pagination.limit))

    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/executions/recent?${query}`, { headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')

    const data = await safeJson(response)
    const executions = Array.isArray(data?.executions)
      ? data.executions.filter((execution: any) => String(execution?.user_id || execution?.owner_user_id || '') === userId)
      : []
    if (Array.isArray(data?.executions) && executions.length !== data.executions.length) {
      return { success: false, status: 403, error: 'Cross-user execution access denied' }
    }
    return {
      success: true,
      data: {
        executions,
        total: executions.length,
      },
    }
  },

  async create(params: SchedulerCreateParams) {
    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        agent_id: params.agent_id,
        cron_expression: params.cron_expression,
        message: params.message,
        timezone: params.timezone || 'UTC',
        user_id: params.userId,
        max_retries: params.max_retries ?? 3,
        retry_delay: params.retry_delay ?? 300,
      }),
    })
    if (!response.ok) return mapError(response, 'Scheduler API error')

    const data = await safeJson(response)
    const schedule = normalizeSchedule(data)
    if (!scheduleOwnedByUser(schedule, params.userId)) {
      return { success: false, status: 403, error: 'Cross-user schedule access denied' }
    }
    return { success: true, status: 201, data: { schedule } }
  },

  async pause(userId, scheduleId) {
    const ownership = await fetchOwnedSchedule(userId, scheduleId)
    if (!ownership.success) return { success: false, status: ownership.status || 403, error: ownership.error || 'Cross-user schedule access denied' }
    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/${scheduleId}/pause`, { method: 'POST', headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')
    const data = await safeJson(response)
    const schedule = normalizeSchedule(data)
    if (!scheduleOwnedByUser(schedule, userId)) return { success: false, status: 403, error: 'Cross-user schedule access denied' }
    return { success: true, data: { schedule } }
  },

  async resume(userId, scheduleId) {
    const ownership = await fetchOwnedSchedule(userId, scheduleId)
    if (!ownership.success) return { success: false, status: ownership.status || 403, error: ownership.error || 'Cross-user schedule access denied' }
    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/${scheduleId}/resume`, { method: 'POST', headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')
    const data = await safeJson(response)
    const schedule = normalizeSchedule(data)
    if (!scheduleOwnedByUser(schedule, userId)) return { success: false, status: 403, error: 'Cross-user schedule access denied' }
    return { success: true, data: { schedule } }
  },

  async trigger(userId, scheduleId) {
    const ownership = await fetchOwnedSchedule(userId, scheduleId)
    if (!ownership.success) return { success: false, status: ownership.status || 403, error: ownership.error || 'Cross-user schedule access denied' }
    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/${scheduleId}/trigger`, { method: 'POST', headers: headers() })
    if (response.status === 202) {
      return { success: true, status: 202, data: { message: 'Schedule triggered successfully' } }
    }
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `Trigger failed: ${response.status}`,
        details: await safeText(response),
      }
    }
    return { success: true, data: { message: 'Schedule triggered successfully' } }
  },

  async delete(userId, scheduleId) {
    const ownership = await fetchOwnedSchedule(userId, scheduleId)
    if (!ownership.success) return { success: false, status: ownership.status || 403, error: ownership.error || 'Cross-user schedule access denied' }
    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/${scheduleId}`, { method: 'DELETE', headers: headers() })
    if (response.status === 204 || response.ok) {
      return { success: true, data: { message: 'Schedule deleted successfully', scheduleId } }
    }

    return {
      success: false,
      status: response.status,
      error: `Failed to delete schedule: ${response.status}`,
      details: await safeText(response),
    }
  },
}
