export interface AIRequestInput {
  message: string
  user_id?: string
  assets?: string[]
  agent_id: string
  metadata?: Record<string, unknown>
}

export interface ArtifactFile {
  file_url: string
  name: string
  format_type: string
}

export interface ModuleOutputs {
  artifact_files?: ArtifactFile[]
  [key: string]: unknown
}

export interface AIResponseOutput {
  status: 'success' | 'error'
  result: Record<string, unknown>
  message?: string
  module_outputs?: ModuleOutputs
}

export interface AIProviderClient {
  generateStructuredResponse(input: AIRequestInput, schema?: Record<string, unknown>): Promise<AIResponseOutput>
}
