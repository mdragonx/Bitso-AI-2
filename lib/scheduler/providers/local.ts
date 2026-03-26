import getSchedulerExecutionLogModel from '@/models/SchedulerExecutionLog'
import getSchedulerScheduleModel from '@/models/SchedulerSchedule'
import {
  SchedulerCreateParams,
  SchedulerExecutionLog,
  SchedulerLogsParams,
  SchedulerProvider,
  SchedulerRecentParams,
  SchedulerSchedule,
} from '@/lib/scheduler/providers/types'

function normalizeSchedule(doc: any): SchedulerSchedule {
  return {
    id: String(doc?._id || doc?.id || ''),
    user_id: String(doc?.user_id || ''),
    agent_id: String(doc?.agent_id || ''),
    message: String(doc?.message || ''),
    cron_expression: String(doc?.cron_expression || ''),
    timezone: String(doc?.timezone || 'UTC'),
    max_retries: Number(doc?.max_retries ?? 3),
    retry_delay: Number(doc?.retry_delay ?? 300),
    is_active: Boolean(doc?.is_active),
    created_at: doc?.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    updated_at: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
    next_run_time: doc?.next_run_time ? new Date(doc.next_run_time).toISOString() : null,
    last_run_at: doc?.last_run_at ? new Date(doc.last_run_at).toISOString() : null,
    last_run_success: typeof doc?.last_run_success === 'boolean' ? doc.last_run_success : null,
  }
}

function normalizeExecutionLog(doc: any): SchedulerExecutionLog {
  return {
    id: String(doc?._id || doc?.id || ''),
    schedule_id: String(doc?.schedule_id || ''),
    agent_id: String(doc?.agent_id || ''),
    user_id: String(doc?.user_id || ''),
    session_id: String(doc?.session_id || ''),
    executed_at: doc?.executed_at ? new Date(doc.executed_at).toISOString() : new Date().toISOString(),
    attempt: Number(doc?.attempt ?? 1),
    max_attempts: Number(doc?.max_attempts ?? 1),
    success: Boolean(doc?.success),
    payload_message: String(doc?.payload_message || ''),
    response_status: Number(doc?.response_status ?? 0),
    response_output: String(doc?.response_output || ''),
    error_message: doc?.error_message ? String(doc.error_message) : null,
  }
}

async function getOwnedSchedule(userId: string, scheduleId: string) {
  const Schedule = await getSchedulerScheduleModel()
  return Schedule.findOne({ _id: scheduleId, user_id: userId })
}

export const localSchedulerProvider: SchedulerProvider = {
  name: 'local',

  async list({ userId, agentId, isActive, skip = 0, limit = 50 }) {
    const Schedule = await getSchedulerScheduleModel()
    const query: Record<string, unknown> = { user_id: userId }
    if (agentId) query.agent_id = agentId
    if (typeof isActive === 'boolean') query.is_active = isActive

    const [docs, total] = await Promise.all([
      Schedule.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Schedule.countDocuments(query),
    ])

    return {
      success: true,
      data: {
        schedules: docs.map(normalizeSchedule),
        total,
      },
    }
  },

  async get(userId, scheduleId) {
    const doc = await getOwnedSchedule(userId, scheduleId)
    if (!doc) {
      return { success: false, status: 404, error: 'Schedule not found' }
    }

    return { success: true, data: { schedule: normalizeSchedule(doc) } }
  },

  async byAgent(userId, agentId) {
    const Schedule = await getSchedulerScheduleModel()
    const docs = await Schedule.find({ user_id: userId, agent_id: agentId }).sort({ createdAt: -1 })

    return {
      success: true,
      data: {
        agent_id: agentId,
        schedules: docs.map(normalizeSchedule),
        webhooks: [],
      },
    }
  },

  async logs({ userId, scheduleId, skip = 0, limit = 50 }: SchedulerLogsParams) {
    const schedule = await getOwnedSchedule(userId, scheduleId)
    if (!schedule) return { success: false, status: 404, error: 'Schedule not found' }

    const ExecutionLog = await getSchedulerExecutionLogModel()
    const query = { schedule_id: scheduleId, user_id: userId }
    const [docs, total] = await Promise.all([
      ExecutionLog.find(query).sort({ executed_at: -1 }).skip(skip).limit(limit),
      ExecutionLog.countDocuments(query),
    ])

    return {
      success: true,
      data: {
        executions: docs.map(normalizeExecutionLog),
        total,
      },
    }
  },

  async recent({ userId, agentId, success, hours, days, skip = 0, limit = 50 }: SchedulerRecentParams) {
    const ExecutionLog = await getSchedulerExecutionLogModel()
    const query: Record<string, unknown> = { user_id: userId }
    if (agentId) query.agent_id = agentId
    if (typeof success === 'boolean') query.success = success

    const now = Date.now()
    if (typeof hours === 'number' && hours > 0) {
      query.executed_at = { $gte: new Date(now - hours * 60 * 60 * 1000) }
    } else if (typeof days === 'number' && days > 0) {
      query.executed_at = { $gte: new Date(now - days * 24 * 60 * 60 * 1000) }
    }

    const [docs, total] = await Promise.all([
      ExecutionLog.find(query).sort({ executed_at: -1 }).skip(skip).limit(limit),
      ExecutionLog.countDocuments(query),
    ])

    return {
      success: true,
      data: {
        executions: docs.map(normalizeExecutionLog),
        total,
      },
    }
  },

  async create(params: SchedulerCreateParams) {
    const Schedule = await getSchedulerScheduleModel()
    const created = await Schedule.create({
      user_id: params.userId,
      agent_id: params.agent_id,
      cron_expression: params.cron_expression,
      message: params.message,
      timezone: params.timezone || 'UTC',
      max_retries: params.max_retries ?? 3,
      retry_delay: params.retry_delay ?? 300,
      is_active: true,
    })

    return {
      success: true,
      status: 201,
      data: {
        schedule: normalizeSchedule(created),
      },
    }
  },

  async pause(userId, scheduleId) {
    const Schedule = await getSchedulerScheduleModel()
    const doc = await Schedule.findOneAndUpdate(
      { _id: scheduleId, user_id: userId },
      { $set: { is_active: false } },
      { new: true }
    )

    if (!doc) return { success: false, status: 404, error: 'Schedule not found' }
    return { success: true, data: { schedule: normalizeSchedule(doc) } }
  },

  async resume(userId, scheduleId) {
    const Schedule = await getSchedulerScheduleModel()
    const doc = await Schedule.findOneAndUpdate(
      { _id: scheduleId, user_id: userId },
      { $set: { is_active: true } },
      { new: true }
    )

    if (!doc) return { success: false, status: 404, error: 'Schedule not found' }
    return { success: true, data: { schedule: normalizeSchedule(doc) } }
  },

  async trigger(userId, scheduleId) {
    const schedule = await getOwnedSchedule(userId, scheduleId)
    if (!schedule) return { success: false, status: 404, error: 'Schedule not found' }

    const ExecutionLog = await getSchedulerExecutionLogModel()
    await ExecutionLog.create({
      schedule_id: String(schedule._id),
      agent_id: schedule.agent_id,
      user_id: userId,
      session_id: `local-${Date.now()}`,
      attempt: 1,
      max_attempts: schedule.max_retries ?? 1,
      success: true,
      payload_message: schedule.message,
      response_status: 202,
      response_output: 'Triggered locally',
      error_message: null,
      executed_at: new Date(),
    })

    schedule.last_run_at = new Date()
    schedule.last_run_success = true
    await schedule.save()

    return { success: true, status: 202, data: { message: 'Schedule triggered successfully' } }
  },

  async delete(userId, scheduleId) {
    const Schedule = await getSchedulerScheduleModel()
    const removed = await Schedule.findOneAndDelete({ _id: scheduleId, user_id: userId })
    if (!removed) return { success: false, status: 404, error: 'Schedule not found' }

    return { success: true, data: { message: 'Schedule deleted successfully', scheduleId } }
  },
}
