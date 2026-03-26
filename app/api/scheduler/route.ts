import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getSchedulerProvider, resolveSchedulerProviderName } from '@/lib/scheduler/providerFactory'
import { SchedulerProviderResult } from '@/lib/scheduler/providers/types'
import { logSchedulerEvent, persistSchedulerAuditEvent, SchedulerAction, SchedulerStatus } from '@/lib/scheduler/observability'
import { z } from 'zod'
import { CronExpressionParser } from 'cron-parser'

const ENABLE_SCHEDULER = process.env.ENABLE_SCHEDULER?.toLowerCase() !== 'false'
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const MAX_SKIP = 1000
const MAX_MESSAGE_CHARS = 4000
const MAX_MESSAGE_BYTES = 16_000

const createLimiterStore = new Map<string, number[]>()
const triggerLimiterStore = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000
const CREATE_RATE_LIMIT_MAX = 10
const TRIGGER_RATE_LIMIT_MAX = 30

const scheduleIdSchema = z.string().trim().min(1).max(128)
const agentIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/)
const cronExpressionSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .superRefine((value, ctx) => {
    try {
      CronExpressionParser.parse(value, { strict: true })
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cron expression' })
    }
  })

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .superRefine((value, ctx) => {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid timezone' })
    }
  })

const maxRetriesSchema = z.number().int().min(0).max(10)
const retryDelaySchema = z.number().int().min(0).max(86_400)

const createPayloadSchema = z.object({
  action: z.literal('create').optional(),
  agent_id: agentIdSchema,
  cron_expression: cronExpressionSchema,
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  timezone: timezoneSchema.optional(),
  max_retries: maxRetriesSchema.optional(),
  retry_delay: retryDelaySchema.optional(),
})

function schedulerDisabledResponse() {
  return NextResponse.json(
    {
      success: false,
      error: 'Scheduler feature is disabled. Set ENABLE_SCHEDULER=true to enable /api/scheduler.',
      actionable: 'Update environment config with ENABLE_SCHEDULER=true and restart the app.',
    },
    { status: 501 }
  )
}

function featureCheck() {
  if (!ENABLE_SCHEDULER) {
    return schedulerDisabledResponse()
  }
  return null
}

function getAuthenticatedUserId(request: NextRequest) {
  const session = getSessionFromRequest(request)
  const authenticatedUserId = session?.userId

  if (!authenticatedUserId) {
    return {
      userId: null,
      error: NextResponse.json(
        { success: false, error: 'Authenticated user identity is required' },
        { status: 400 }
      ),
    }
  }

  return { userId: authenticatedUserId, error: null }
}

function validateClientIdentityInput(
  userId: string,
  identityValues: Array<{ key: string; value: unknown }>
) {
  for (const identity of identityValues) {
    if (identity.value == null) continue
    if (typeof identity.value !== 'string' || identity.value !== userId) {
      return NextResponse.json(
        { success: false, error: `${identity.key} must match authenticated user identity` },
        { status: 403 }
      )
    }
  }
  return null
}

function toBool(value: string | null): boolean | undefined {
  if (value == null || value.trim() === '') return undefined
  return value.toLowerCase() === 'true'
}

function toNumber(value: string | null): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function sanitizePagination(input: { skip?: number; limit?: number }) {
  const skipInput = typeof input.skip === 'number' && Number.isFinite(input.skip) ? Math.floor(input.skip) : 0
  const limitInput = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.floor(input.limit) : DEFAULT_LIMIT

  return {
    skip: Math.min(Math.max(0, skipInput), MAX_SKIP),
    limit: Math.min(Math.max(1, limitInput), MAX_LIMIT),
  }
}

function enforceRateLimit(key: string, maxEvents: number, store: Map<string, number[]>) {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const values = (store.get(key) || []).filter(timestamp => timestamp > cutoff)
  if (values.length >= maxEvents) {
    return NextResponse.json(
      { success: false, code: 'SCHEDULER_RATE_LIMITED', error: 'Too many requests' },
      { status: 429 }
    )
  }

  values.push(now)
  store.set(key, values)
  return null
}

function policyViolation(code: string, message: string, status = 422) {
  return NextResponse.json({ success: false, code, error: message }, { status })
}

function activeProviderName() {
  return resolveSchedulerProviderName()
}

function normalizeProviderError(action: string, result: SchedulerProviderResult<unknown>) {
  const status = result.status || 500
  const detailString = typeof result.details === 'string' ? result.details.toLowerCase() : JSON.stringify(result.details || {}).toLowerCase()
  const errorString = String(result.error || '').toLowerCase()
  const combined = `${errorString} ${detailString}`

  if (status === 404) {
    return { status: 404, code: 'SCHEDULE_NOT_FOUND', error: 'Schedule not found' }
  }

  if (action === 'pause' && combined.includes('already') && (combined.includes('paused') || combined.includes('inactive'))) {
    return { status: 409, code: 'SCHEDULE_ALREADY_INACTIVE', error: 'Schedule is already paused' }
  }

  if (action === 'resume' && combined.includes('already') && combined.includes('active')) {
    return { status: 409, code: 'SCHEDULE_ALREADY_ACTIVE', error: 'Schedule is already active' }
  }

  if (status >= 400 && status < 500) {
    if (status === 403) {
      return { status: 403, code: 'SCHEDULER_POLICY_VIOLATION', error: 'Scheduler ownership policy violation' }
    }
    if (status === 413) {
      return { status: 413, code: 'SCHEDULER_PAYLOAD_TOO_LARGE', error: 'Scheduler payload too large' }
    }
    if (status === 429) {
      return { status: 429, code: 'SCHEDULER_RATE_LIMITED', error: 'Too many scheduler requests' }
    }
    return { status, code: 'SCHEDULER_VALIDATION_ERROR', error: 'Invalid scheduler request' }
  }

  return { status, code: 'SCHEDULER_PROVIDER_ERROR', error: 'Scheduler provider request failed' }
}

function providerError(action: string, result: SchedulerProviderResult<unknown>, fallbackStatus = 500) {
  const normalized = normalizeProviderError(action, result)

  return NextResponse.json(
    {
      success: false,
      provider: activeProviderName(),
      code: normalized.code,
      error: normalized.error,
      details: result.details,
    },
    { status: normalized.status || fallbackStatus }
  )
}

function normalizedSuccess(action: string, payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    {
      success: true,
      provider: activeProviderName(),
      action,
      ...payload,
    },
    { status }
  )
}

async function emitSchedulerAuditAndLog(input: {
  owner_user_id: string
  schedule_id?: string | null
  action: SchedulerAction
  provider: string
  status: SchedulerStatus
  startedAtMs: number
  error?: unknown
}) {
  const latencyMs = Date.now() - input.startedAtMs
  const errorClass =
    input.error instanceof Error ? input.error.name : input.error ? 'SchedulerRequestError' : null

  logSchedulerEvent({
    owner_user_id: input.owner_user_id,
    schedule_id: input.schedule_id,
    action: input.action,
    provider: input.provider,
    status: input.status,
    latency_ms: latencyMs,
    error_class: errorClass,
  })

  await persistSchedulerAuditEvent({
    owner_user_id: input.owner_user_id,
    schedule_id: input.schedule_id,
    action: input.action,
    provider: input.provider,
    status: input.status,
    latency_ms: latencyMs,
    error_class: errorClass,
  })
}

export async function GET(request: NextRequest) {
  const feature = featureCheck()
  if (feature) return feature

  const { userId, error: userError } = getAuthenticatedUserId(request)
  if (userError || !userId) return userError

  try {
    const provider = getSchedulerProvider()
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'list'
    const scheduleId = searchParams.get('scheduleId')
    const agentId = searchParams.get('agentId')
    const pagination = sanitizePagination({
      skip: toNumber(searchParams.get('skip')),
      limit: toNumber(searchParams.get('limit')),
    })

    const identityQueryError = validateClientIdentityInput(userId, [
      { key: 'user_id', value: searchParams.get('user_id') },
      { key: 'userId', value: searchParams.get('userId') },
      { key: 'owner_user_id', value: searchParams.get('owner_user_id') },
      { key: 'ownerUserId', value: searchParams.get('ownerUserId') },
    ])
    if (identityQueryError) return identityQueryError

    switch (action) {
      case 'get': {
        const scheduleIdResult = scheduleIdSchema.safeParse(scheduleId)
        if (!scheduleIdResult.success) {
          return NextResponse.json({ success: false, error: 'scheduleId is required' }, { status: 400 })
        }
        const result = await provider.get(userId, scheduleIdResult.data)
        if (!result.success || !result.data) return providerError('get', result)
        return normalizedSuccess('get', result.data.schedule)
      }

      case 'by-agent': {
        const agentIdResult = agentIdSchema.safeParse(agentId)
        if (!agentIdResult.success) {
          return policyViolation('SCHEDULER_VALIDATION_ERROR', 'Invalid agentId', 422)
        }
        const result = await provider.byAgent(userId, agentIdResult.data)
        if (!result.success || !result.data) return providerError('by-agent', result)
        return normalizedSuccess('by-agent', result.data)
      }

      case 'logs': {
        const scheduleIdResult = scheduleIdSchema.safeParse(scheduleId)
        if (!scheduleIdResult.success) {
          return policyViolation('SCHEDULER_VALIDATION_ERROR', 'Invalid scheduleId', 422)
        }
        const result = await provider.logs({
          userId,
          scheduleId: scheduleIdResult.data,
          skip: pagination.skip,
          limit: pagination.limit,
        })
        if (!result.success || !result.data) return providerError('logs', result)
        return normalizedSuccess('logs', result.data)
      }

      case 'recent': {
        const result = await provider.recent({
          userId,
          agentId,
          success: toBool(searchParams.get('success')),
          hours: toNumber(searchParams.get('hours')),
          days: toNumber(searchParams.get('days')),
          skip: pagination.skip,
          limit: pagination.limit,
        })
        if (!result.success || !result.data) return providerError('recent', result)
        return normalizedSuccess('recent', result.data)
      }

      case 'list':
      default: {
        const result = await provider.list({
          userId,
          agentId,
          isActive: toBool(searchParams.get('is_active')),
          skip: pagination.skip,
          limit: pagination.limit,
        })
        if (!result.success || !result.data) return providerError('list', result)
        return normalizedSuccess('list', result.data)
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        provider: activeProviderName(),
        code: 'SCHEDULER_INTERNAL_ERROR',
        error: error instanceof Error ? error.message : 'Server error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const feature = featureCheck()
  if (feature) return feature

  const { userId, error: userError } = getAuthenticatedUserId(request)
  if (userError || !userId) return userError

  try {
    const startedAtMs = Date.now()
    const provider = getSchedulerProvider()
    const providerName = provider.name
    const body = await request.json()
    const { action, scheduleId, ...params } = body

    const identityBodyError = validateClientIdentityInput(userId, [
      { key: 'user_id', value: body?.user_id },
      { key: 'userId', value: body?.userId },
      { key: 'owner_user_id', value: body?.owner_user_id },
      { key: 'ownerUserId', value: body?.ownerUserId },
    ])
    if (identityBodyError) return identityBodyError

    switch (action) {
      case 'trigger': {
        const scheduleIdResult = scheduleIdSchema.safeParse(scheduleId)
        if (!scheduleIdResult.success) {
          return policyViolation('SCHEDULER_VALIDATION_ERROR', 'Invalid scheduleId', 422)
        }
        const triggerRateLimitError = enforceRateLimit(userId, TRIGGER_RATE_LIMIT_MAX, triggerLimiterStore)
        if (triggerRateLimitError) return triggerRateLimitError

        const result = await provider.trigger(userId, scheduleIdResult.data)
        if (!result.success || !result.data) {
          await emitSchedulerAuditAndLog({
            owner_user_id: userId,
            schedule_id: scheduleIdResult.data,
            action: 'trigger',
            provider: providerName,
            status: 'failure',
            startedAtMs,
            error: result.error,
          })
          return providerError('trigger', result)
        }
        await emitSchedulerAuditAndLog({
          owner_user_id: userId,
          schedule_id: scheduleIdResult.data,
          action: 'trigger',
          provider: providerName,
          status: 'success',
          startedAtMs,
        })
        return normalizedSuccess('trigger', result.data, result.status || 200)
      }

      case 'pause': {
        const scheduleIdResult = scheduleIdSchema.safeParse(scheduleId)
        if (!scheduleIdResult.success) {
          return policyViolation('SCHEDULER_VALIDATION_ERROR', 'Invalid scheduleId', 422)
        }
        const result = await provider.pause(userId, scheduleIdResult.data)
        if (!result.success || !result.data) {
          await emitSchedulerAuditAndLog({
            owner_user_id: userId,
            schedule_id: scheduleIdResult.data,
            action: 'pause',
            provider: providerName,
            status: 'failure',
            startedAtMs,
            error: result.error,
          })
          return providerError('pause', result)
        }
        await emitSchedulerAuditAndLog({
          owner_user_id: userId,
          schedule_id: scheduleIdResult.data,
          action: 'pause',
          provider: providerName,
          status: 'success',
          startedAtMs,
        })
        return normalizedSuccess('pause', result.data.schedule)
      }

      case 'resume': {
        const scheduleIdResult = scheduleIdSchema.safeParse(scheduleId)
        if (!scheduleIdResult.success) {
          return policyViolation('SCHEDULER_VALIDATION_ERROR', 'Invalid scheduleId', 422)
        }
        const result = await provider.resume(userId, scheduleIdResult.data)
        if (!result.success || !result.data) {
          await emitSchedulerAuditAndLog({
            owner_user_id: userId,
            schedule_id: scheduleIdResult.data,
            action: 'resume',
            provider: providerName,
            status: 'failure',
            startedAtMs,
            error: result.error,
          })
          return providerError('resume', result)
        }
        await emitSchedulerAuditAndLog({
          owner_user_id: userId,
          schedule_id: scheduleIdResult.data,
          action: 'resume',
          provider: providerName,
          status: 'success',
          startedAtMs,
        })
        return normalizedSuccess('resume', result.data.schedule)
      }

      case 'create':
      default: {
        const createRateLimitError = enforceRateLimit(userId, CREATE_RATE_LIMIT_MAX, createLimiterStore)
        if (createRateLimitError) return createRateLimitError

        const parsedPayload = createPayloadSchema.safeParse({
          action,
          ...params,
        })
        if (!parsedPayload.success) {
          return policyViolation('SCHEDULER_VALIDATION_ERROR', parsedPayload.error.issues[0]?.message || 'Invalid request payload', 422)
        }

        const messageBytes = Buffer.byteLength(parsedPayload.data.message, 'utf8')
        if (messageBytes > MAX_MESSAGE_BYTES) {
          return policyViolation('SCHEDULER_PAYLOAD_TOO_LARGE', 'Schedule message exceeds byte size limit', 413)
        }

        const result = await provider.create({
          userId,
          agent_id: parsedPayload.data.agent_id,
          cron_expression: parsedPayload.data.cron_expression,
          message: parsedPayload.data.message,
          timezone: parsedPayload.data.timezone,
          max_retries: parsedPayload.data.max_retries,
          retry_delay: parsedPayload.data.retry_delay,
        })
        if (!result.success || !result.data) {
          await emitSchedulerAuditAndLog({
            owner_user_id: userId,
            schedule_id: null,
            action: 'create',
            provider: providerName,
            status: 'failure',
            startedAtMs,
            error: result.error,
          })
          return providerError('create', result)
        }
        await emitSchedulerAuditAndLog({
          owner_user_id: userId,
          schedule_id: result.data.schedule.id,
          action: 'create',
          provider: providerName,
          status: 'success',
          startedAtMs,
        })
        return normalizedSuccess('create', result.data.schedule, result.status || 201)
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        provider: activeProviderName(),
        code: 'SCHEDULER_INTERNAL_ERROR',
        error: error instanceof Error ? error.message : 'Server error',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const feature = featureCheck()
  if (feature) return feature

  const { userId, error: userError } = getAuthenticatedUserId(request)
  if (userError || !userId) return userError

  try {
    const provider = getSchedulerProvider()
    const body = await request.json()
    const { scheduleId } = body

    const identityBodyError = validateClientIdentityInput(userId, [
      { key: 'user_id', value: body?.user_id },
      { key: 'userId', value: body?.userId },
      { key: 'owner_user_id', value: body?.owner_user_id },
      { key: 'ownerUserId', value: body?.ownerUserId },
    ])
    if (identityBodyError) return identityBodyError

    const scheduleIdResult = scheduleIdSchema.safeParse(scheduleId)
    if (!scheduleIdResult.success) {
      return policyViolation('SCHEDULER_VALIDATION_ERROR', 'Invalid scheduleId', 422)
    }

    const result = await provider.delete(userId, scheduleIdResult.data)
    if (!result.success || !result.data) return providerError('delete', result)

    return normalizedSuccess('delete', result.data)
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        provider: activeProviderName(),
        code: 'SCHEDULER_INTERNAL_ERROR',
        error: error instanceof Error ? error.message : 'Server error',
      },
      { status: 500 }
    )
  }
}
