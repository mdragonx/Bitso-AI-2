import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getSchedulerProvider, resolveSchedulerProviderName } from '@/lib/scheduler/providerFactory'
import { SchedulerProviderResult } from '@/lib/scheduler/providers/types'
import { logSchedulerEvent, persistSchedulerAuditEvent, SchedulerAction, SchedulerStatus } from '@/lib/scheduler/observability'

const ENABLE_SCHEDULER = process.env.ENABLE_SCHEDULER?.toLowerCase() !== 'false'

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
    const normalized = String(identity.value).trim()
    if (normalized && normalized !== userId) {
      return NextResponse.json(
        { success: false, error: `${identity.key} must match authenticated user identity` },
        { status: 400 }
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

function activeProviderName() {
  const resolved = resolveSchedulerProviderName()
  if (resolved === 'lyzr' && !process.env.LYZR_API_KEY) {
    return 'local' as const
  }
  return resolved
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

    const identityQueryError = validateClientIdentityInput(userId, [
      { key: 'user_id', value: searchParams.get('user_id') },
      { key: 'userId', value: searchParams.get('userId') },
    ])
    if (identityQueryError) return identityQueryError

    switch (action) {
      case 'get': {
        if (!scheduleId) {
          return NextResponse.json({ success: false, error: 'scheduleId is required' }, { status: 400 })
        }
        const result = await provider.get(userId, scheduleId)
        if (!result.success || !result.data) return providerError('get', result)
        return normalizedSuccess('get', result.data.schedule)
      }

      case 'by-agent': {
        if (!agentId) {
          return NextResponse.json({ success: false, error: 'agentId is required' }, { status: 400 })
        }
        const result = await provider.byAgent(userId, agentId)
        if (!result.success || !result.data) return providerError('by-agent', result)
        return normalizedSuccess('by-agent', result.data)
      }

      case 'logs': {
        if (!scheduleId) {
          return NextResponse.json({ success: false, error: 'scheduleId is required' }, { status: 400 })
        }
        const result = await provider.logs({
          userId,
          scheduleId,
          skip: toNumber(searchParams.get('skip')),
          limit: toNumber(searchParams.get('limit')),
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
          skip: toNumber(searchParams.get('skip')),
          limit: toNumber(searchParams.get('limit')),
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
          skip: toNumber(searchParams.get('skip')),
          limit: toNumber(searchParams.get('limit')),
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
    ])
    if (identityBodyError) return identityBodyError

    switch (action) {
      case 'trigger': {
        if (!scheduleId) {
          return NextResponse.json({ success: false, error: 'scheduleId is required' }, { status: 400 })
        }
        const result = await provider.trigger(userId, scheduleId)
        if (!result.success || !result.data) {
          await emitSchedulerAuditAndLog({
            owner_user_id: userId,
            schedule_id: scheduleId,
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
          schedule_id: scheduleId,
          action: 'trigger',
          provider: providerName,
          status: 'success',
          startedAtMs,
        })
        return normalizedSuccess('trigger', result.data, result.status || 200)
      }

      case 'pause': {
        if (!scheduleId) {
          return NextResponse.json({ success: false, error: 'scheduleId is required' }, { status: 400 })
        }
        const result = await provider.pause(userId, scheduleId)
        if (!result.success || !result.data) {
          await emitSchedulerAuditAndLog({
            owner_user_id: userId,
            schedule_id: scheduleId,
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
          schedule_id: scheduleId,
          action: 'pause',
          provider: providerName,
          status: 'success',
          startedAtMs,
        })
        return normalizedSuccess('pause', result.data.schedule)
      }

      case 'resume': {
        if (!scheduleId) {
          return NextResponse.json({ success: false, error: 'scheduleId is required' }, { status: 400 })
        }
        const result = await provider.resume(userId, scheduleId)
        if (!result.success || !result.data) {
          await emitSchedulerAuditAndLog({
            owner_user_id: userId,
            schedule_id: scheduleId,
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
          schedule_id: scheduleId,
          action: 'resume',
          provider: providerName,
          status: 'success',
          startedAtMs,
        })
        return normalizedSuccess('resume', result.data.schedule)
      }

      case 'create':
      default: {
        if (!params.agent_id || !params.cron_expression || !params.message) {
          return NextResponse.json(
            { success: false, error: 'agent_id, cron_expression, and message are required' },
            { status: 400 }
          )
        }

        const result = await provider.create({
          userId,
          agent_id: params.agent_id,
          cron_expression: params.cron_expression,
          message: params.message,
          timezone: params.timezone,
          max_retries: params.max_retries,
          retry_delay: params.retry_delay,
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
    ])
    if (identityBodyError) return identityBodyError

    if (!scheduleId) {
      return NextResponse.json({ success: false, error: 'scheduleId is required' }, { status: 400 })
    }

    const result = await provider.delete(userId, scheduleId)
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
