import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listRecentExecutions,
  listScheduleExecutions,
  listSchedules,
  listSchedulesByAgent,
  pauseSchedule,
  resumeSchedule,
  triggerScheduleOnDemand,
} from '@/lib/scheduler/localService'
import {
  SchedulerCreateParams,
  SchedulerLogsParams,
  SchedulerProvider,
  SchedulerRecentParams,
} from '@/lib/scheduler/providers/types'

export const localSchedulerProvider: SchedulerProvider = {
  name: 'local',

  async list({ userId, agentId, isActive, skip = 0, limit = 50 }) {
    const data = await listSchedules({
      owner_user_id: userId,
      agent_id: agentId,
      is_active: isActive,
      skip,
      limit,
    })

    return { success: true, data }
  },

  async get(userId, scheduleId) {
    const schedule = await getSchedule(userId, scheduleId)
    if (!schedule) {
      return { success: false, status: 404, error: 'Schedule not found' }
    }

    return { success: true, data: { schedule } }
  },

  async byAgent(userId, agentId) {
    const schedules = await listSchedulesByAgent(userId, agentId)

    return {
      success: true,
      data: {
        agent_id: agentId,
        schedules,
        webhooks: [],
      },
    }
  },

  async logs({ userId, scheduleId, skip = 0, limit = 50 }: SchedulerLogsParams) {
    const data = await listScheduleExecutions({
      owner_user_id: userId,
      schedule_id: scheduleId,
      skip,
      limit,
    })

    if (!data) return { success: false, status: 404, error: 'Schedule not found' }

    return {
      success: true,
      data,
    }
  },

  async recent({ userId, agentId, success, hours, days, skip = 0, limit = 50 }: SchedulerRecentParams) {
    const data = await listRecentExecutions({
      owner_user_id: userId,
      agent_id: agentId,
      success,
      hours,
      days,
      skip,
      limit,
    })

    return {
      success: true,
      data,
    }
  },

  async create(params: SchedulerCreateParams) {
    const schedule = await createSchedule({
      owner_user_id: params.userId,
      agent_id: params.agent_id,
      cron_expression: params.cron_expression,
      message: params.message,
      timezone: params.timezone,
      max_retries: params.max_retries,
      retry_delay: params.retry_delay,
    })

    return {
      success: true,
      status: 201,
      data: { schedule },
    }
  },

  async pause(userId, scheduleId) {
    const schedule = await pauseSchedule(userId, scheduleId)

    if (!schedule) return { success: false, status: 404, error: 'Schedule not found' }
    return { success: true, data: { schedule } }
  },

  async resume(userId, scheduleId) {
    const schedule = await resumeSchedule(userId, scheduleId)

    if (!schedule) return { success: false, status: 404, error: 'Schedule not found' }
    return { success: true, data: { schedule } }
  },

  async trigger(userId, scheduleId) {
    const result = await triggerScheduleOnDemand(userId, scheduleId)
    if (!result) return { success: false, status: 404, error: 'Schedule not found' }

    return { success: true, status: 202, data: { message: result.message } }
  },

  async delete(userId, scheduleId) {
    const removed = await deleteSchedule(userId, scheduleId)
    if (!removed) return { success: false, status: 404, error: 'Schedule not found' }

    return { success: true, data: { message: 'Schedule deleted successfully', scheduleId } }
  },
}
