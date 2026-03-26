import getScheduleExecutionModel from '@/models/ScheduleExecution'
import getScheduleModel from '@/models/Schedule'
import { computeNextRunTime } from '@/lib/scheduler/worker'

interface ScheduleCreateInput {
  owner_user_id: string
  agent_id: string
  message: string
  cron_expression: string
  timezone?: string
  max_retries?: number
  retry_delay?: number
}

interface ScheduleUpdateInput {
  is_active?: boolean
  message?: string
  cron_expression?: string
  timezone?: string
  max_retries?: number
  retry_delay?: number
  next_run_time?: Date | null
  last_run_at?: Date | null
  last_run_success?: boolean | null
}

function normalizeSchedule(doc: any) {
  return {
    id: String(doc?._id || doc?.id || ''),
    user_id: String(doc?.owner_user_id || ''),
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

function normalizeExecution(doc: any, schedule: any) {
  return {
    id: String(doc?._id || doc?.id || ''),
    schedule_id: String(doc?.schedule_id || ''),
    agent_id: String(schedule?.agent_id || ''),
    user_id: String(doc?.owner_user_id || ''),
    session_id: String(doc?._id || ''),
    executed_at: doc?.executed_at ? new Date(doc.executed_at).toISOString() : new Date().toISOString(),
    attempt: Number(doc?.attempt ?? 1),
    max_attempts: Number(schedule?.max_retries ?? 1),
    success: Boolean(doc?.success),
    payload_message: String(schedule?.message || ''),
    response_status: Number(doc?.response_status ?? 0),
    response_output: String(doc?.response_output || ''),
    error_message: doc?.error_message ? String(doc.error_message) : null,
  }
}

export async function listSchedules(params: {
  owner_user_id: string
  agent_id?: string | null
  is_active?: boolean
  skip?: number
  limit?: number
}) {
  const Schedule = await getScheduleModel()
  const query: Record<string, unknown> = { owner_user_id: params.owner_user_id }

  if (params.agent_id) query.agent_id = params.agent_id
  if (typeof params.is_active === 'boolean') query.is_active = params.is_active

  const skip = params.skip ?? 0
  const limit = params.limit ?? 50

  const [docs, total] = await Promise.all([
    Schedule.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Schedule.countDocuments(query),
  ])

  return { schedules: docs.map(normalizeSchedule), total }
}

export async function getSchedule(owner_user_id: string, scheduleId: string) {
  const Schedule = await getScheduleModel()
  const schedule = await Schedule.findOne({ _id: scheduleId, owner_user_id })
  if (!schedule) return null
  return normalizeSchedule(schedule)
}

export async function getScheduleDoc(owner_user_id: string, scheduleId: string) {
  const Schedule = await getScheduleModel()
  return Schedule.findOne({ _id: scheduleId, owner_user_id })
}

export async function listSchedulesByAgent(owner_user_id: string, agent_id: string) {
  const Schedule = await getScheduleModel()
  const docs = await Schedule.find({ owner_user_id, agent_id }).sort({ createdAt: -1 })
  return docs.map(normalizeSchedule)
}

export async function createSchedule(input: ScheduleCreateInput) {
  const Schedule = await getScheduleModel()
  const timezone = input.timezone || 'UTC'
  const nextRunTime = computeNextRunTime(input.cron_expression, timezone, new Date())

  const created = await Schedule.create({
    ...input,
    timezone,
    max_retries: input.max_retries ?? 3,
    retry_delay: input.retry_delay ?? 300,
    is_active: true,
    next_run_time: nextRunTime,
  })

  return normalizeSchedule(created)
}

export async function updateSchedule(owner_user_id: string, scheduleId: string, updates: ScheduleUpdateInput) {
  const Schedule = await getScheduleModel()
  const updated = await Schedule.findOneAndUpdate(
    { _id: scheduleId, owner_user_id },
    { $set: updates },
    { new: true }
  )

  if (!updated) return null
  return normalizeSchedule(updated)
}

export async function pauseSchedule(owner_user_id: string, scheduleId: string) {
  return updateSchedule(owner_user_id, scheduleId, { is_active: false })
}

export async function resumeSchedule(owner_user_id: string, scheduleId: string) {
  const schedule = await getScheduleDoc(owner_user_id, scheduleId)
  if (!schedule) return null

  const nextRunTime = computeNextRunTime(schedule.cron_expression, schedule.timezone || 'UTC', new Date())
  return updateSchedule(owner_user_id, scheduleId, { is_active: true, next_run_time: nextRunTime })
}

export async function deleteSchedule(owner_user_id: string, scheduleId: string) {
  const Schedule = await getScheduleModel()
  const removed = await Schedule.findOneAndDelete({ _id: scheduleId, owner_user_id })
  if (!removed) return null

  return { id: String(removed._id) }
}

export async function listScheduleExecutions(params: {
  owner_user_id: string
  schedule_id: string
  skip?: number
  limit?: number
}) {
  const scheduleDoc = await getScheduleDoc(params.owner_user_id, params.schedule_id)
  if (!scheduleDoc) return null

  const Execution = await getScheduleExecutionModel()
  const skip = params.skip ?? 0
  const limit = params.limit ?? 50

  const query = {
    owner_user_id: params.owner_user_id,
    schedule_id: params.schedule_id,
  }

  const [docs, total] = await Promise.all([
    Execution.find(query).sort({ executed_at: -1 }).skip(skip).limit(limit),
    Execution.countDocuments(query),
  ])

  return {
    executions: docs.map(doc => normalizeExecution(doc, scheduleDoc)),
    total,
  }
}

export async function listRecentExecutions(params: {
  owner_user_id: string
  agent_id?: string | null
  success?: boolean
  hours?: number
  days?: number
  skip?: number
  limit?: number
}) {
  const Schedule = await getScheduleModel()
  const Execution = await getScheduleExecutionModel()

  const scheduleQuery: Record<string, unknown> = { owner_user_id: params.owner_user_id }
  if (params.agent_id) scheduleQuery.agent_id = params.agent_id

  const scheduleDocs = await Schedule.find(scheduleQuery).select({ _id: 1, agent_id: 1, message: 1, max_retries: 1 })
  const scheduleMap = new Map(scheduleDocs.map((doc: any) => [String(doc._id), doc]))
  const scheduleIds = Array.from(scheduleMap.keys())

  if (!scheduleIds.length) return { executions: [], total: 0 }

  const query: Record<string, unknown> = {
    owner_user_id: params.owner_user_id,
    schedule_id: { $in: scheduleIds },
  }

  if (typeof params.success === 'boolean') query.success = params.success

  const now = Date.now()
  if (typeof params.hours === 'number' && params.hours > 0) {
    query.executed_at = { $gte: new Date(now - params.hours * 60 * 60 * 1000) }
  } else if (typeof params.days === 'number' && params.days > 0) {
    query.executed_at = { $gte: new Date(now - params.days * 24 * 60 * 60 * 1000) }
  }

  const skip = params.skip ?? 0
  const limit = params.limit ?? 50
  const [docs, total] = await Promise.all([
    Execution.find(query).sort({ executed_at: -1 }).skip(skip).limit(limit),
    Execution.countDocuments(query),
  ])

  return {
    executions: docs.map(doc => normalizeExecution(doc, scheduleMap.get(String(doc.schedule_id)))),
    total,
  }
}

export async function triggerScheduleOnDemand(owner_user_id: string, scheduleId: string) {
  const scheduleDoc = await getScheduleDoc(owner_user_id, scheduleId)
  if (!scheduleDoc) return null

  const executedAt = new Date()
  const Execution = await getScheduleExecutionModel()

  await Execution.create({
    schedule_id: String(scheduleDoc._id),
    owner_user_id,
    executed_at: executedAt,
    attempt: 1,
    success: true,
    response_status: 202,
    response_output: 'Triggered locally',
    error_message: null,
    provider: 'local',
  })

  scheduleDoc.last_run_at = executedAt
  scheduleDoc.last_run_success = true
  await scheduleDoc.save()

  return {
    message: 'Schedule triggered successfully',
    schedule: normalizeSchedule(scheduleDoc),
  }
}
