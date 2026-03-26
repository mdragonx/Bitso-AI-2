import parseLLMJson from '@/lib/jsonParser'
import type { AIProviderClient, AIRequestInput, AIResponseOutput } from '@/lib/ai/types'

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini'

function normalizeParsedResponse(parsed: unknown): AIResponseOutput {
  if (!parsed) {
    return {
      status: 'error',
      result: {},
      message: 'Empty response from provider',
    }
  }

  if (typeof parsed === 'string') {
    return { status: 'success', result: { text: parsed }, message: parsed }
  }

  if (typeof parsed !== 'object') {
    return { status: 'success', result: { value: parsed }, message: String(parsed) }
  }

  const objectParsed = parsed as Record<string, unknown>

  if ('status' in objectParsed && 'result' in objectParsed) {
    return {
      status: objectParsed.status === 'error' ? 'error' : 'success',
      result: (objectParsed.result as Record<string, unknown>) || {},
      message: typeof objectParsed.message === 'string' ? objectParsed.message : undefined,
      module_outputs: objectParsed.module_outputs as AIResponseOutput['module_outputs'],
    }
  }

  if ('result' in objectParsed) {
    const result = objectParsed.result
    const textMessage = typeof objectParsed.message === 'string'
      ? objectParsed.message
      : typeof result === 'string'
        ? result
        : undefined

    return {
      status: 'success',
      result: typeof result === 'string' ? { text: result } : ((result as Record<string, unknown>) || {}),
      message: textMessage,
      module_outputs: objectParsed.module_outputs as AIResponseOutput['module_outputs'],
    }
  }

  return {
    status: 'success',
    result: objectParsed,
    message: typeof objectParsed.message === 'string' ? objectParsed.message : undefined,
    module_outputs: objectParsed.module_outputs as AIResponseOutput['module_outputs'],
  }
}

function extractAssistantText(rawContent: unknown): string {
  if (typeof rawContent === 'string') return rawContent
  if (!Array.isArray(rawContent)) return ''

  return rawContent
    .map((item: unknown) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && 'text' in item) return String(item.text || '')
      return ''
    })
    .join('')
}

export class OpenAIProviderClient implements AIProviderClient {
  async generateStructuredResponse(input: AIRequestInput, schema?: Record<string, unknown>): Promise<AIResponseOutput> {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    const responseFormat = schema
      ? {
          type: 'json_schema',
          json_schema: {
            name: `${input.agent_id}_response_schema`.replace(/[^a-zA-Z0-9_]/g, '_'),
            schema,
          },
        }
      : { type: 'json_object' }

    const completionRes = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: 'user', content: input.message }],
        response_format: responseFormat,
        metadata: {
          user_id: input.user_id,
          agent_id: input.agent_id,
          ...(input.metadata || {}),
        },
      }),
    })

    const rawResponseText = await completionRes.text()

    if (!completionRes.ok) {
      let errorMsg = `OpenAI completion failed with status ${completionRes.status}`
      try {
        const errorData = JSON.parse(rawResponseText)
        errorMsg = errorData?.error?.message || errorData?.error || errorData?.message || errorMsg
      } catch {}
      throw new Error(errorMsg)
    }

    const completion = JSON.parse(rawResponseText)
    const assistantText = extractAssistantText(completion?.choices?.[0]?.message?.content)
    const parsed = parseLLMJson(assistantText)

    return normalizeParsedResponse(parsed || assistantText)
  }
}
