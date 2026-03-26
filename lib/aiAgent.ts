'use client'

/**
 * AI Agent Client Utility
 *
 * Client-side wrapper for calling the AI Agent API route.
 * API keys are kept secure on the server.
 *
 * @example
 * ```tsx
 * import { callAIAgent } from '@/lib/aiAgent'
 *
 * const result = await callAIAgent('Hello!', 'agent-id')
 * if (result.success) {
 *   console.log(result.response.result)
 * }
 * ```
 */

import { useState } from 'react'
import fetchWrapper from '@/lib/fetchWrapper'
import { clientFeatureFlags, getFeatureDisabledMessage } from '@/lib/featureFlags'

// Types
export interface NormalizedAgentResponse {
  status: 'success' | 'error'
  result: Record<string, any>
  message?: string
  metadata?: {
    agent_name?: string
    timestamp?: string
    [key: string]: any
  }
}

export interface ArtifactFile {
  file_url: string
  name: string
  format_type: string
}

export interface ModuleOutputs {
  artifact_files?: ArtifactFile[]
  [key: string]: any
}

export interface AIAgentResponse {
  success: boolean
  response: NormalizedAgentResponse
  module_outputs?: ModuleOutputs
  agent_id?: string
  user_id?: string
  session_id?: string
  timestamp?: string
  raw_response?: string
  error?: string
  details?: string
}

export interface UploadedFile {
  asset_id: string
  file_name: string
  success: boolean
  error?: string
}

export interface UploadResponse {
  success: boolean
  asset_ids: string[]
  files: UploadedFile[]
  total_files: number
  successful_uploads: number
  failed_uploads: number
  message: string
  timestamp: string
  error?: string
}

/**
 * Call the AI Agent via server-side API route.
 * Contract: synchronous request/response only.
 */
export async function callAIAgent(
  message: string,
  agent_id: string,
  options?: { user_id?: string; session_id?: string; assets?: string[]; metadata?: Record<string, unknown> }
): Promise<AIAgentResponse> {
  try {
    const response = await fetchWrapper('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        agent_id,
        user_id: options?.user_id,
        session_id: options?.session_id,
        assets: options?.assets,
        metadata: options?.metadata,
      }),
    })

    if (!response) {
      return {
        success: false,
        response: { status: 'error', result: {}, message: 'No response from server' },
        error: 'No response from server',
      }
    }

    const data = await response.json()
    return {
      ...data,
      agent_id: data.agent_id ?? agent_id,
      user_id: data.user_id ?? options?.user_id,
      session_id: data.session_id ?? options?.session_id,
    }
  } catch (error) {
    return {
      success: false,
      response: {
        status: 'error',
        result: {},
        message: error instanceof Error ? error.message : 'Network error',
      },
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

/**
 * Upload files via server-side API route
 */
export async function uploadFiles(files: File | File[]): Promise<UploadResponse> {
  const fileArray = Array.isArray(files) ? files : [files]

  if (fileArray.length === 0) {
    return {
      success: false,
      asset_ids: [],
      files: [],
      total_files: 0,
      successful_uploads: 0,
      failed_uploads: 0,
      message: 'No files provided',
      timestamp: new Date().toISOString(),
      error: 'No files provided',
    }
  }

  if (!clientFeatureFlags.upload) {
    return {
      success: false,
      asset_ids: [],
      files: [],
      total_files: fileArray.length,
      successful_uploads: 0,
      failed_uploads: fileArray.length,
      message: 'Upload feature disabled',
      timestamp: new Date().toISOString(),
      error: getFeatureDisabledMessage('upload'),
    }
  }

  try {
    const formData = new FormData()
    for (const file of fileArray) {
      formData.append('files', file, file.name)
    }

    const response = await fetchWrapper('/api/upload', {
      method: 'POST',
      body: formData,
    })

    const data = await response.json()
    return data
  } catch (error) {
    return {
      success: false,
      asset_ids: [],
      files: [],
      total_files: fileArray.length,
      successful_uploads: 0,
      failed_uploads: fileArray.length,
      message: 'Network error during upload',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * React hook for using AI Agent in components
 */
export function useAIAgent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<NormalizedAgentResponse | null>(null)

  const callAgent = async (
    message: string,
    agent_id: string,
    options?: { user_id?: string; session_id?: string; assets?: string[]; metadata?: Record<string, unknown> }
  ) => {
    setLoading(true)
    setError(null)
    setResponse(null)

    const result = await callAIAgent(message, agent_id, options)

    if (result.success) {
      setResponse(result.response)
    } else {
      setError(result.error || 'Unknown error')
      setResponse(result.response)
    }

    setLoading(false)
    return result
  }

  return {
    callAgent,
    loading,
    error,
    response,
  }
}

/**
 * React hook for file uploads
 */
export function useFileUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResponse | null>(null)

  const upload = async (files: File | File[]) => {
    setUploading(true)
    setError(null)
    setResult(null)

    const uploadResult = await uploadFiles(files)

    if (uploadResult.success) {
      setResult(uploadResult)
    } else {
      setError(uploadResult.error || 'Upload failed')
      setResult(uploadResult)
    }

    setUploading(false)
    return uploadResult
  }

  return {
    upload,
    uploading,
    error,
    result,
  }
}

/**
 * Extract text from agent response
 */
export function extractText(response: NormalizedAgentResponse): string {
  if (response.message) return response.message
  if (response.result?.text) return response.result.text
  if (response.result?.message) return response.result.message
  if (response.result?.response) return response.result.response
  if (response.result?.answer) return response.result.answer
  if (response.result?.answer_text) return response.result.answer_text
  if (response.result?.summary) return response.result.summary
  if (response.result?.content) return response.result.content
  if (typeof response.result === 'string') return response.result
  return ''
}
