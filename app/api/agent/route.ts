import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

import { getAIProviderClient } from '@/lib/ai/providerFactory'
import type { AIRequestInput } from '@/lib/ai/types'

async function loadResponseSchema(agentId: string): Promise<Record<string, unknown> | undefined> {
  const filename = `${agentId}_response.json`
  const schemaPath = path.join(process.cwd(), 'response_schemas', filename)

  try {
    const schemaContent = await readFile(schemaPath, 'utf8')
    return JSON.parse(schemaContent) as Record<string, unknown>
  } catch {
    return undefined
  }
}

function validatePayload(body: any): { valid: true; input: AIRequestInput } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' }
  }

  if (body.task_id) {
    return { valid: false, error: 'task_id polling is not supported for configured provider' }
  }

  const { message, agent_id, user_id, assets, metadata } = body

  if (!message || !agent_id) {
    return { valid: false, error: 'message and agent_id are required' }
  }

  return {
    valid: true,
    input: {
      message,
      agent_id,
      user_id,
      assets,
      metadata,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = validatePayload(body)

    if (!validated.valid) {
      return NextResponse.json(
        {
          success: false,
          response: { status: 'error', result: {}, message: validated.error },
          error: validated.error,
        },
        { status: validated.error.includes('task_id polling') ? 400 : 400 }
      )
    }

    const schema = await loadResponseSchema(validated.input.agent_id)
    const client = getAIProviderClient()
    const providerResponse = await client.generateStructuredResponse(validated.input, schema)

    return NextResponse.json({
      success: true,
      response: {
        status: providerResponse.status,
        result: providerResponse.result,
        message: providerResponse.message,
      },
      module_outputs: providerResponse.module_outputs,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json(
      {
        success: false,
        response: { status: 'error', result: {}, message: errorMsg },
        error: errorMsg,
      },
      { status: 500 }
    )
  }
}
