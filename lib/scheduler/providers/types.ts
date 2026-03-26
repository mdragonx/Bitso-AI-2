export interface SchedulerSchedule {
  id: string
  user_id: string
  agent_id: string
  message: string
  cron_expression: string
  timezone: string
  max_retries: number
  retry_delay: number
  is_active: boolean
  created_at: string
  updated_at: string
  next_run_time: string | null
  last_run_at: string | null
  last_run_success: boolean | null
}

export interface SchedulerExecutionLog {
  id: string
  schedule_id: string
  agent_id: string
  user_id: string
  session_id: string
  executed_at: string
  attempt: number
  max_attempts: number
  success: boolean
  payload_message: string
  response_status: number
  response_output: string
  error_message: string | null
}

export interface SchedulerWebhook {
  id: string
  agent_id: string
  user_id: string
  description: string
  webhook_url: string
  is_active: boolean
  created_at: string
  last_triggered_at: string | null
  last_trigger_success: boolean | null
  trigger_count: number
}

export type SchedulerProviderName = 'local'

export interface SchedulerProviderResult<T = unknown> {
  success: boolean
  status?: number
  error?: string
  details?: unknown
  data?: T
}

export interface SchedulerListParams {
  userId: string
  agentId?: string | null
  isActive?: boolean
  skip?: number
  limit?: number
}

export interface SchedulerRecentParams {
  userId: string
  agentId?: string | null
  success?: boolean
  hours?: number
  days?: number
  skip?: number
  limit?: number
}

export interface SchedulerLogsParams {
  userId: string
  scheduleId: string
  skip?: number
  limit?: number
}

export interface SchedulerCreateParams {
  userId: string
  agent_id: string
  cron_expression: string
  message: string
  timezone?: string
  max_retries?: number
  retry_delay?: number
}

export interface SchedulerProvider {
  name: SchedulerProviderName
  list(params: SchedulerListParams): Promise<SchedulerProviderResult<{ schedules: SchedulerSchedule[]; total: number }>>
  get(userId: string, scheduleId: string): Promise<SchedulerProviderResult<{ schedule: SchedulerSchedule }>>
  byAgent(userId: string, agentId: string): Promise<SchedulerProviderResult<{ agent_id: string; schedules: SchedulerSchedule[]; webhooks: SchedulerWebhook[] }>>
  logs(params: SchedulerLogsParams): Promise<SchedulerProviderResult<{ executions: SchedulerExecutionLog[]; total: number }>>
  recent(params: SchedulerRecentParams): Promise<SchedulerProviderResult<{ executions: SchedulerExecutionLog[]; total: number }>>
  create(params: SchedulerCreateParams): Promise<SchedulerProviderResult<{ schedule: SchedulerSchedule }>>
  pause(userId: string, scheduleId: string): Promise<SchedulerProviderResult<{ schedule: SchedulerSchedule }>>
  resume(userId: string, scheduleId: string): Promise<SchedulerProviderResult<{ schedule: SchedulerSchedule }>>
  trigger(userId: string, scheduleId: string): Promise<SchedulerProviderResult<{ message: string }>>
  delete(userId: string, scheduleId: string): Promise<SchedulerProviderResult<{ message: string; scheduleId: string }>>
}
