import parseLLMJson from '@/lib/jsonParser'
import type { AIProviderClient, AIRequestInput, AIResponseOutput } from '@/lib/ai/types'

const LOCAL_LLM_BASE_URL = process.env.LOCAL_LLM_BASE_URL || ''
const LOCAL_LLM_API_KEY = process.env.LOCAL_LLM_API_KEY || ''
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || ''

function normalizeLocalResponse(parsed: unknown): AIResponseOutput {
  if (!parsed) {
    return { status: 'error', result: {}, message: 'Empty response from provider' }
  }

  if (typeof parsed === 'string') {
    return { status: 'success', result: { text: parsed }, message: parsed }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const payload = parsed as Record<string, unknown>
    if ('status' in payload && 'result' in payload) {
      return {
        status: payload.status === 'error' ? 'error' : 'success',
        result: (payload.result as Record<string, unknown>) || {},
        message: typeof payload.message === 'string' ? payload.message : undefined,
        module_outputs: payload.module_outputs as AIResponseOutput['module_outputs'],
      }
    }

    return {
      status: 'success',
      result: payload,
      message: typeof payload.message === 'string' ? payload.message : undefined,
      module_outputs: payload.module_outputs as AIResponseOutput['module_outputs'],
    }
  }

  return { status: 'success', result: { value: parsed }, message: String(parsed) }
}

export class LocalProviderClient implements AIProviderClient {
  async generateStructuredResponse(input: AIRequestInput, schema?: Record<string, unknown>): Promise<AIResponseOutput> {
    if (!LOCAL_LLM_BASE_URL || !LOCAL_LLM_MODEL) {
      throw new Error('LOCAL_LLM_BASE_URL and LOCAL_LLM_MODEL are required for local provider')
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (LOCAL_LLM_API_KEY) {
      headers.Authorization = `Bearer ${LOCAL_LLM_API_KEY}`
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

    const completionRes = await fetch(`${LOCAL_LLM_BASE_URL.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: LOCAL_LLM_MODEL,
        messages: [{ role: 'user', content: input.message }],
        response_format: responseFormat,
      }),
    })

    const rawResponseText = await completionRes.text()

    if (!completionRes.ok) {
      let errorMsg = `Local completion failed with status ${completionRes.status}`
      try {
        const errorData = JSON.parse(rawResponseText)
        errorMsg = errorData?.error?.message || errorData?.error || errorData?.message || errorMsg
      } catch {}
      throw new Error(errorMsg)
    }

    const completion = JSON.parse(rawResponseText)
    const assistantText = completion?.choices?.[0]?.message?.content || ''
    const parsed = parseLLMJson(assistantText)

    return normalizeLocalResponse(parsed || assistantText)
  }
}
