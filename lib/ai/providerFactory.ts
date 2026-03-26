import type { AIProviderClient } from '@/lib/ai/types'
import { LocalProviderClient } from '@/lib/ai/providers/local'
import { OpenAIProviderClient } from '@/lib/ai/providers/openai'

export function getAIProviderClient(): AIProviderClient {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase()

  switch (provider) {
    case 'local':
    case 'openai_compatible':
      return new LocalProviderClient()
    case 'openai':
    default:
      return new OpenAIProviderClient()
  }
}
