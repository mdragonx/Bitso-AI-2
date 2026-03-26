const DEFAULT_RAG_BASE_URL = 'https://rag-prod.studio.lyzr.ai/v3'
const DEFAULT_RAG_CRAWL_URL = 'https://api.beta.architect.new/api/v1/rag/crawl'

export class RagProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RagProviderConfigError'
  }
}

function getProviderConfig() {
  const baseUrl = process.env.RAG_PROVIDER_BASE_URL || DEFAULT_RAG_BASE_URL
  const crawlUrl = process.env.RAG_PROVIDER_CRAWL_URL || DEFAULT_RAG_CRAWL_URL
  const apiKey = process.env.RAG_PROVIDER_API_KEY

  if (!apiKey) {
    throw new RagProviderConfigError(
      'Missing internal RAG provider configuration: set RAG_PROVIDER_API_KEY on the server',
    )
  }

  return {
    baseUrl,
    crawlUrl,
    apiKey,
  }
}

function providerHeaders(contentType?: string) {
  const { apiKey } = getProviderConfig()
  return {
    ...(contentType ? { 'Content-Type': contentType } : {}),
    accept: 'application/json',
    'x-api-key': apiKey,
  }
}

async function parseError(response: Response, fallback: string) {
  const details = await response.text().catch(() => '')
  return {
    error: `${fallback}: ${response.status}`,
    details,
    status: response.status,
  }
}

export const ragProvider = {
  async listDocuments(ragId: string) {
    const { baseUrl } = getProviderConfig()
    const response = await fetch(`${baseUrl}/rag/documents/${encodeURIComponent(ragId)}/`, {
      method: 'GET',
      headers: providerHeaders(),
    })

    if (!response.ok) {
      return { success: false as const, ...(await parseError(response, 'Failed to get documents')) }
    }

    const data = await response.json()
    const documents = Array.isArray(data) ? data : data?.documents || data?.data || []

    return {
      success: true as const,
      documents,
    }
  },

  async uploadDocument(params: { ragId: string; fileType: 'pdf' | 'docx' | 'txt'; formData: FormData }) {
    const { baseUrl } = getProviderConfig()
    const response = await fetch(
      `${baseUrl}/train/${params.fileType}/?rag_id=${encodeURIComponent(params.ragId)}`,
      {
        method: 'POST',
        headers: providerHeaders(),
        body: params.formData,
      },
    )

    if (!response.ok) {
      return { success: false as const, ...(await parseError(response, 'Failed to upload document')) }
    }

    const data = await response.json()
    return {
      success: true as const,
      data,
    }
  },

  async trainDocument(params: { ragId: string; fileType: 'pdf' | 'docx' | 'txt'; file: File }) {
    const formData = new FormData()
    formData.append('file', params.file, params.file.name)
    formData.append('data_parser', 'llmsherpa')
    formData.append('chunk_size', '1000')
    formData.append('chunk_overlap', '100')
    formData.append('extra_info', '{}')

    const { baseUrl } = getProviderConfig()
    const response = await fetch(
      `${baseUrl}/train/${params.fileType}/?rag_id=${encodeURIComponent(params.ragId)}`,
      {
        method: 'POST',
        headers: providerHeaders(),
        body: formData,
      },
    )

    if (!response.ok) {
      return { success: false as const, ...(await parseError(response, 'Failed to train document')) }
    }

    const data = await response.json()
    return {
      success: true as const,
      data,
    }
  },

  async deleteDocuments(ragId: string, documentNames: string[]) {
    const { baseUrl } = getProviderConfig()
    const response = await fetch(`${baseUrl}/rag/${encodeURIComponent(ragId)}/docs/`, {
      method: 'DELETE',
      headers: providerHeaders('application/json'),
      body: JSON.stringify(documentNames),
    })

    if (!response.ok) {
      return { success: false as const, ...(await parseError(response, 'Failed to delete documents')) }
    }

    return {
      success: true as const,
    }
  },

  async crawlWebsite(ragId: string, url: string) {
    const { crawlUrl } = getProviderConfig()
    const response = await fetch(crawlUrl, {
      method: 'POST',
      headers: providerHeaders('application/json'),
      body: JSON.stringify({ url, rag_id: ragId }),
    })

    if (!response.ok) {
      return { success: false as const, ...(await parseError(response, 'Failed to crawl website')) }
    }

    return {
      success: true as const,
    }
  },
}
