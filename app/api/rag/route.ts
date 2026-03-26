/**
 * Server-side RAG Knowledge Base API Route
 *
 * This route proxies requests through an internal RAG provider adapter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { RagProviderConfigError, ragProvider } from '@/lib/rag/provider'

const ENABLE_RAG = process.env.ENABLE_RAG?.toLowerCase() !== 'false'

const FILE_TYPE_MAP: Record<string, 'pdf' | 'docx' | 'txt'> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
}

function ragDisabledResponse() {
  return NextResponse.json(
    {
      success: false,
      error: 'RAG feature is disabled. Set ENABLE_RAG=true to enable /api/rag routes.',
      actionable: 'Update environment config with ENABLE_RAG=true and restart the app.',
    },
    { status: 501 },
  )
}

function ensureRagEnabled() {
  if (!ENABLE_RAG) {
    return ragDisabledResponse()
  }
  return null
}

function mapProviderConfigError(error: unknown) {
  if (error instanceof RagProviderConfigError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    )
  }

  return null
}

function normalizeDocuments(filePaths: string[]) {
  return filePaths.map((filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    const fileType = ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'txt' ? 'txt' : 'unknown'

    return {
      fileName,
      fileType,
      status: 'active',
    }
  })
}

// POST - List documents (JSON body) or Upload and train (formData)
export async function POST(request: NextRequest) {
  try {
    const disabled = ensureRagEnabled()
    if (disabled) return disabled

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await request.json()
      const { ragId } = body

      if (!ragId) {
        return NextResponse.json(
          {
            success: false,
            error: 'ragId is required',
          },
          { status: 400 },
        )
      }

      const listResult = await ragProvider.listDocuments(ragId)
      if (!listResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: listResult.error,
            details: listResult.details,
          },
          { status: listResult.status },
        )
      }

      return NextResponse.json({
        success: true,
        documents: normalizeDocuments(listResult.documents),
        ragId,
        timestamp: new Date().toISOString(),
      })
    }

    const formData = await request.formData()
    const ragId = formData.get('ragId') as string
    const file = formData.get('file') as File

    if (!ragId || !file) {
      return NextResponse.json(
        {
          success: false,
          error: 'ragId and file are required',
        },
        { status: 400 },
      )
    }

    const fileType = FILE_TYPE_MAP[file.type]
    if (!fileType) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type: ${file.type}. Supported: PDF, DOCX, TXT`,
        },
        { status: 400 },
      )
    }

    const trainResult = await ragProvider.trainDocument({ ragId, fileType, file })
    if (!trainResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: trainResult.error,
          details: trainResult.details,
        },
        { status: trainResult.status },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Document uploaded and trained successfully',
      fileName: file.name,
      fileType,
      documentCount: trainResult.data?.document_count || trainResult.data?.chunks || 1,
      ragId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const providerConfigError = mapProviderConfigError(error)
    if (providerConfigError) return providerConfigError

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Server error',
      },
      { status: 500 },
    )
  }
}

// PATCH - Crawl a website and add content to knowledge base
export async function PATCH(request: NextRequest) {
  try {
    const disabled = ensureRagEnabled()
    if (disabled) return disabled

    const body = await request.json()
    const { ragId, url } = body

    if (!ragId || !url) {
      return NextResponse.json(
        {
          success: false,
          error: 'ragId and url are required',
        },
        { status: 400 },
      )
    }

    const crawlResult = await ragProvider.crawlWebsite(ragId, url)
    if (!crawlResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: crawlResult.error,
          details: crawlResult.details,
        },
        { status: crawlResult.status },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Website crawl started successfully. Content will be available shortly.',
      url,
      ragId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const providerConfigError = mapProviderConfigError(error)
    if (providerConfigError) return providerConfigError

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Server error',
      },
      { status: 500 },
    )
  }
}

// DELETE - Remove documents from knowledge base
export async function DELETE(request: NextRequest) {
  try {
    const disabled = ensureRagEnabled()
    if (disabled) return disabled

    const body = await request.json()
    const { ragId, documentNames } = body

    if (!ragId || !documentNames || !Array.isArray(documentNames)) {
      return NextResponse.json(
        {
          success: false,
          error: 'ragId and documentNames array are required',
        },
        { status: 400 },
      )
    }

    const deleteResult = await ragProvider.deleteDocuments(ragId, documentNames)
    if (!deleteResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: deleteResult.error,
          details: deleteResult.details,
        },
        { status: deleteResult.status },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Documents deleted successfully',
      deletedCount: documentNames.length,
      ragId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const providerConfigError = mapProviderConfigError(error)
    if (providerConfigError) return providerConfigError

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Server error',
      },
      { status: 500 },
    )
  }
}
