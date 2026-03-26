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

export const lyzrSchedulerProvider: SchedulerProvider = {
  name: 'lyzr',

  async list({ userId, agentId, isActive, skip, limit }) {
    const query = new URLSearchParams()
    query.set('user_id', userId)
    if (agentId) query.set('agent_id', agentId)
    if (typeof isActive === 'boolean') query.set('is_active', String(isActive))
    if (typeof skip === 'number') query.set('skip', String(skip))
    if (typeof limit === 'number') query.set('limit', String(limit))

    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/?${query}`, { headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')

    const data = await safeJson(response)
    return {
      success: true,
      data: {
        schedules: Array.isArray(data?.schedules) ? data.schedules.map(normalizeSchedule) : [],
        total: Number(data?.total ?? 0),
      },
    }
  },

  async get(_userId, scheduleId) {
    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/${scheduleId}`, { headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')

    const data = await safeJson(response)
    return { success: true, data: { schedule: normalizeSchedule(data) } }
  },

  async byAgent(_userId, agentId) {
    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/by-agent/${agentId}`, { headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')

    const data = await safeJson(response)
    return {
      success: true,
      data: {
        agent_id: String(data?.agent_id || agentId),
        schedules: Array.isArray(data?.schedules) ? data.schedules.map(normalizeSchedule) : [],
        webhooks: Array.isArray(data?.webhooks) ? data.webhooks : [],
      },
    }
  },

  async logs({ scheduleId, skip, limit }) {
    const query = new URLSearchParams()
    if (typeof skip === 'number') query.set('skip', String(skip))
    if (typeof limit === 'number') query.set('limit', String(limit))
    const suffix = query.toString() ? `?${query.toString()}` : ''

    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/${scheduleId}/logs${suffix}`, { headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')

    const data = await safeJson(response)
    return {
      success: true,
      data: {
        executions: Array.isArray(data?.executions) ? data.executions : [],
        total: Number(data?.total ?? 0),
      },
    }
  },

  async recent({ agentId, success, hours, days, skip, limit }) {
    const query = new URLSearchParams()
    if (agentId) query.set('agent_id', agentId)
    if (typeof success === 'boolean') query.set('success', String(success))
    if (typeof hours === 'number') query.set('hours', String(hours))
    if (typeof days === 'number') query.set('days', String(days))
    if (typeof skip === 'number') query.set('skip', String(skip))
    if (typeof limit === 'number') query.set('limit', String(limit))

    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/executions/recent?${query}`, { headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')

    const data = await safeJson(response)
    return {
      success: true,
      data: {
        executions: Array.isArray(data?.executions) ? data.executions : [],
        total: Number(data?.total ?? 0),
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
    return { success: true, status: 201, data: { schedule: normalizeSchedule(data) } }
  },

  async pause(_userId, scheduleId) {
    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/${scheduleId}/pause`, { method: 'POST', headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')
    const data = await safeJson(response)
    return { success: true, data: { schedule: normalizeSchedule(data) } }
  },

  async resume(_userId, scheduleId) {
    const response = await fetch(`${SCHEDULER_BASE_URL}/schedules/${scheduleId}/resume`, { method: 'POST', headers: headers() })
    if (!response.ok) return mapError(response, 'Scheduler API error')
    const data = await safeJson(response)
    return { success: true, data: { schedule: normalizeSchedule(data) } }
  },

  async trigger(_userId, scheduleId) {
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

  async delete(_userId, scheduleId) {
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
