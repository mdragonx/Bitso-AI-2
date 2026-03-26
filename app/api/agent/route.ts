import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

import { getAIProviderClient } from '@/lib/ai/providerFactory'
import type { AIRequestInput } from '@/lib/ai/types'
import { analysisTriggerRequestSchema } from '@/lib/contracts/apiContracts'
import {
  getCorrelationContextFromRequest,
  recordAnalysisMetric,
  withLifecycleLog,
} from '@/lib/observability/lifecycle'
import { parseOrThrow } from '@/lib/validation/trading'

const MARKET_ANALYSIS_COORDINATOR_AGENT_ID = '69c440a030aebe1ba52aede0'
const TECHNICAL_ANALYSIS_AGENT_ID = '69c4408d967781c77f39ef10'
const MARKET_RESEARCH_AGENT_ID = '69c4408daced56c171490320'

const AGENT_SCHEMA_FILE_MAP: Record<string, string> = {
  [MARKET_ANALYSIS_COORDINATOR_AGENT_ID]: 'market_analysis_coordinator_response.json',
  '69c440b01b19ba3adafaf1d7': 'trade_execution_agent_response.json',
}

const SUB_AGENT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    signal: { type: 'string' },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    risk_assessment: { type: 'string' },
    reasoning: { type: 'string' },
  },
  required: ['signal', 'confidence', 'summary', 'risk_assessment', 'reasoning'],
  additionalProperties: true,
}

const SIGNAL_VALUES = new Set(['BUY', 'SELL', 'HOLD'])

function normalizeSchemaDefinition(rawSchema: unknown): Record<string, unknown> | undefined {
  if (!rawSchema || typeof rawSchema !== 'object') {
    return undefined
  }

  const schemaObject = rawSchema as Record<string, unknown>

  if (schemaObject.type === 'object' && schemaObject.properties && typeof schemaObject.properties === 'object') {
    return schemaObject
  }

  const compactSchema = schemaObject.response_schema
  if (!compactSchema || typeof compactSchema !== 'object' || Array.isArray(compactSchema)) {
    return undefined
  }

  const properties: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(compactSchema as Record<string, unknown>)) {
    if (typeof value === 'string') {
      properties[key] = { type: value }
      continue
    }

    if (value && typeof value === 'object') {
      properties[key] = value
    }
  }

  const required = Object.keys(properties)
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: true,
  }
}

async function loadResponseSchema(agentId: string): Promise<Record<string, unknown> | undefined> {
  const mappedFilename = AGENT_SCHEMA_FILE_MAP[agentId]
  const filename = mappedFilename || `${agentId}_response.json`
  const schemaPath = path.join(process.cwd(), 'response_schemas', filename)

  try {
    const schemaContent = await readFile(schemaPath, 'utf8')
    const parsedSchema = JSON.parse(schemaContent) as unknown
    const normalizedSchema = normalizeSchemaDefinition(parsedSchema)

    if (!normalizedSchema) {
      console.warn(
        `[agent-route] Invalid schema format for agent_id=${agentId}. file=${schemaPath}. Expected JSON Schema object or response_schema map.`
      )
    }

    return normalizedSchema
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown read/parse error'
    console.warn(
      `[agent-route] Schema missing or unreadable for agent_id=${agentId}. file=${schemaPath}. mapped=${Boolean(mappedFilename)}. error=${errorMessage}`
    )
    return undefined
  }
}

function validateType(value: unknown, expectedType: string): boolean {
  if (expectedType === 'array') return Array.isArray(value)
  if (expectedType === 'null') return value === null
  return typeof value === expectedType
}

function validateAgainstSchema(
  value: unknown,
  schema: Record<string, unknown>
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = []

  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, errors: ['Expected result to be an object'] }
    }

    const payload = value as Record<string, unknown>
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
    for (const field of required) {
      if (!(field in payload)) {
        errors.push(`Missing required field: result.${field}`)
      }
    }

    const properties = schema.properties
    if (properties && typeof properties === 'object') {
      for (const [field, definition] of Object.entries(properties as Record<string, unknown>)) {
        if (!(field in payload) || !definition || typeof definition !== 'object') continue
        const fieldValue = payload[field]
        const fieldSchema = definition as Record<string, unknown>
        const expectedType = fieldSchema.type
        if (typeof expectedType === 'string' && !validateType(fieldValue, expectedType)) {
          errors.push(
            `Type mismatch for result.${field}: expected ${expectedType}, received ${
              fieldValue === null ? 'null' : Array.isArray(fieldValue) ? 'array' : typeof fieldValue
            }`
          )
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true }
}

function validatePayload(body: unknown): AIRequestInput {
  if (body && typeof body === 'object' && 'task_id' in (body as Record<string, unknown>)) {
    throw new Error('task_id polling is not supported for configured provider')
  }

  return parseOrThrow(analysisTriggerRequestSchema, body)
}

function sanitizeForLogs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForLogs)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const input = value as Record<string, unknown>
  const output: Record<string, unknown> = {}

  for (const [key, nestedValue] of Object.entries(input)) {
    if (/(api[_-]?key|secret|token|authorization|password)/i.test(key)) {
      output[key] = '[REDACTED]'
      continue
    }
    output[key] = sanitizeForLogs(nestedValue)
  }

  return output
}

function normalizeSignal(raw: unknown): 'BUY' | 'SELL' | 'HOLD' {
  const normalized = String(raw || '').trim().toUpperCase()
  return SIGNAL_VALUES.has(normalized) ? (normalized as 'BUY' | 'SELL' | 'HOLD') : 'HOLD'
}

function normalizeConfidence(raw: unknown): number {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 0
  return Math.max(0, Math.min(100, raw))
}

async function runMarketCoordinatorFlow(
  input: AIRequestInput,
  trace: { correlationId: string; requestId: string; userId: string | null }
) {
  const metadata = (input.metadata && typeof input.metadata === 'object') ? input.metadata as Record<string, unknown> : {}
  const selectedPair = typeof metadata.selected_pair === 'string' ? metadata.selected_pair : 'unknown_pair'
  const timeframe = typeof metadata.timeframe === 'string' ? metadata.timeframe : 'unknown_timeframe'
  const ohlc = Array.isArray(metadata.ohlc) ? metadata.ohlc : []
  const marketContextItems = Array.isArray(metadata.market_context_items) ? metadata.market_context_items : []

  const sharedContext = {
    selected_pair: selectedPair,
    timeframe,
    ohlc,
    market_context_items: marketContextItems,
    user_message: input.message,
  }

  const client = getAIProviderClient()
  const technicalPrompt = `You are the Technical Analysis Agent.
Analyze only technicals from the provided OHLC data.
Return JSON fields: signal (BUY/SELL/HOLD), confidence (0-100), summary, risk_assessment, reasoning.
Context: ${JSON.stringify(sharedContext)}`

  const marketPrompt = `You are the Market Research and Sentiment Agent.
Analyze market context/news/sentiment only (avoid technical indicators).
Return JSON fields: signal (BUY/SELL/HOLD), confidence (0-100), summary, risk_assessment, reasoning.
Context: ${JSON.stringify(sharedContext)}`

  const technicalOutput = await client.generateStructuredResponse(
    {
      ...input,
      agent_id: TECHNICAL_ANALYSIS_AGENT_ID,
      message: technicalPrompt,
      metadata: { ...metadata, correlation_id: trace.correlationId, parent_request_id: trace.requestId },
    },
    SUB_AGENT_RESPONSE_SCHEMA
  )
  const marketOutput = await client.generateStructuredResponse(
    {
      ...input,
      agent_id: MARKET_RESEARCH_AGENT_ID,
      message: marketPrompt,
      metadata: { ...metadata, correlation_id: trace.correlationId, parent_request_id: trace.requestId },
    },
    SUB_AGENT_RESPONSE_SCHEMA
  )

  const technicalSignal = normalizeSignal(technicalOutput.result.signal)
  const marketSignal = normalizeSignal(marketOutput.result.signal)
  const technicalConfidence = normalizeConfidence(technicalOutput.result.confidence)
  const marketConfidence = normalizeConfidence(marketOutput.result.confidence)
  const averagedConfidence = Math.round((technicalConfidence + marketConfidence) / 2)

  const signal = technicalSignal === marketSignal ? technicalSignal : 'HOLD'
  const confidenceExplanation = `Technical agent: ${technicalSignal} (${technicalConfidence}%). Market research agent: ${marketSignal} (${marketConfidence}%). Final signal is ${signal} based on cross-agent consensus policy.`

  const result = {
    signal,
    confidence: {
      score: averagedConfidence,
      explanation: confidenceExplanation,
    },
    risk_assessment: [
      `Technical: ${technicalOutput.result.risk_assessment || 'No technical risk notes.'}`,
      `Market: ${marketOutput.result.risk_assessment || 'No market risk notes.'}`,
    ].join('\n'),
    indicator_summary: {
      technical_analysis: String(technicalOutput.result.summary || ''),
      market_research: String(marketOutput.result.summary || ''),
    },
    reasoning_trace: `Pair ${selectedPair} on timeframe ${timeframe}. Combined technical and market/sentiment analyses into a consensus recommendation.`,
    technical_summary: String(technicalOutput.result.summary || ''),
    market_summary: String(marketOutput.result.summary || ''),
    reasoning: `Technical reasoning: ${String(technicalOutput.result.reasoning || '')}\nMarket reasoning: ${String(marketOutput.result.reasoning || '')}`,
  }

  const intermediateOutputs = {
    trace: {
      correlation_id: trace.correlationId,
      request_id: trace.requestId,
      user_id: trace.userId,
    },
    coordinator_input: sanitizeForLogs(sharedContext),
    technical_analysis_output: sanitizeForLogs(technicalOutput.result),
    market_research_output: sanitizeForLogs(marketOutput.result),
    combined_recommendation_output: sanitizeForLogs(result),
  }
  console.info('[agent-route][coordinator-flow]', JSON.stringify(intermediateOutputs))

  return {
    status: 'success' as const,
    result,
    module_outputs: {
      ...intermediateOutputs,
      coordinator_flow: {
        selected_pair: selectedPair,
        timeframe,
        ohlc_points: ohlc.length,
      },
    },
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const correlation = getCorrelationContextFromRequest(request)

  try {
    const body = await request.json()
    const input = validatePayload(body)
    const userId = typeof input.user_id === 'string' ? input.user_id : null
    const baseLogContext = {
      correlation_id: correlation.correlationId,
      request_id: correlation.requestId,
      user_id: userId,
      agent_id: input.agent_id,
    }

    withLifecycleLog('info', 'analysis_request_received', baseLogContext)

    const schema = await loadResponseSchema(input.agent_id)
    const providerResponse = input.agent_id === MARKET_ANALYSIS_COORDINATOR_AGENT_ID
      ? await runMarketCoordinatorFlow(input, {
          correlationId: correlation.correlationId,
          requestId: correlation.requestId,
          userId,
        })
      : await getAIProviderClient().generateStructuredResponse(input, schema)

    if (schema) {
      const validation = validateAgainstSchema(providerResponse.result, schema)
      if (!validation.valid) {
        const errorMessage = `Response validation failed for agent_id=${input.agent_id}: ${validation.errors.join(
          '; '
        )}`
        const latencyMs = Date.now() - startedAt
        recordAnalysisMetric({ latencyMs, success: false })
        withLifecycleLog('warn', 'analysis_response_schema_validation_failed', {
          ...baseLogContext,
          latency_ms: latencyMs,
          validation_errors: validation.errors,
        })
        const response = NextResponse.json(
          {
            success: false,
            response: { status: 'error', result: {}, message: errorMessage },
            error: errorMessage,
            details: {
              parse_stage: 'schema_validation',
              validation_errors: validation.errors,
              expected_schema_keys: Object.keys((schema.properties as Record<string, unknown>) || {}),
            },
          },
          { status: 502 }
        )
        response.headers.set('x-correlation-id', correlation.correlationId)
        response.headers.set('x-request-id', correlation.requestId)
        return response
      }
    }

    const latencyMs = Date.now() - startedAt
    recordAnalysisMetric({ latencyMs, success: true })
    withLifecycleLog('info', 'analysis_request_completed', {
      ...baseLogContext,
      latency_ms: latencyMs,
      provider_status: providerResponse.status,
    })

    const response = NextResponse.json({
      success: true,
      response: {
        status: providerResponse.status,
        result: providerResponse.result,
        message: providerResponse.message,
      },
      module_outputs: providerResponse.module_outputs,
      timestamp: new Date().toISOString(),
    })
    response.headers.set('x-correlation-id', correlation.correlationId)
    response.headers.set('x-request-id', correlation.requestId)
    return response
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Server error'
    const latencyMs = Date.now() - startedAt
    recordAnalysisMetric({ latencyMs, success: false })
    withLifecycleLog('error', 'analysis_request_failed', {
      correlation_id: correlation.correlationId,
      request_id: correlation.requestId,
      latency_ms: latencyMs,
      error_message: errorMsg,
    })
    const response = NextResponse.json(
      {
        success: false,
        response: { status: 'error', result: {}, message: errorMsg },
        error: errorMsg,
      },
      { status: errorMsg.includes('Validation failed') || errorMsg.includes('task_id polling') ? 400 : 500 }
    )
    response.headers.set('x-correlation-id', correlation.correlationId)
    response.headers.set('x-request-id', correlation.requestId)
    return response
  }
}
