import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth'
import { storeUploadObject } from '@/lib/storage/objectStore'
import { createAssetRecord } from '@/lib/uploads/assetRegistry'

const ENABLE_UPLOAD = process.env.ENABLE_UPLOAD?.toLowerCase() !== 'false'

function uploadDisabledResponse() {
  return NextResponse.json(
    {
      success: false,
      asset_ids: [],
      files: [],
      total_files: 0,
      successful_uploads: 0,
      failed_uploads: 0,
      message: 'Upload feature is disabled. Set ENABLE_UPLOAD=true to enable /api/upload.',
      timestamp: new Date().toISOString(),
      error: 'Upload feature disabled by server feature flag',
      actionable: 'Update environment config with ENABLE_UPLOAD=true and restart the app.',
    },
    { status: 501 }
  )
}

export async function POST(request: NextRequest) {
  try {
    if (!ENABLE_UPLOAD) {
      return uploadDisabledResponse()
    }

    const userId = getCurrentUserId(request)
    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          asset_ids: [],
          files: [],
          total_files: 0,
          successful_uploads: 0,
          failed_uploads: 0,
          message: 'Unauthorized',
          timestamp: new Date().toISOString(),
          error: 'Unauthorized',
        },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const files = formData
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File)

    if (files.length === 0) {
      return NextResponse.json(
        {
          success: false,
          asset_ids: [],
          files: [],
          total_files: 0,
          successful_uploads: 0,
          failed_uploads: 0,
          message: 'No files provided',
          timestamp: new Date().toISOString(),
          error: 'No files provided',
        },
        { status: 400 }
      )
    }

    const uploadedFiles: Array<{ asset_id: string; file_name: string; success: boolean; error?: string }> = []

    for (const file of files) {
      try {
        const bytes = Buffer.from(await file.arrayBuffer())

        const stored = await storeUploadObject({
          bytes,
          contentType: file.type || 'application/octet-stream',
          originalFilename: file.name,
          ownerUserId: userId,
        })

        const assetRecord = await createAssetRecord({
          filename: file.name,
          mime: file.type || 'application/octet-stream',
          size: stored.byteSize,
          storageKey: stored.storageKey,
          ownerUserId: userId,
        })

        uploadedFiles.push({
          asset_id: assetRecord.asset_id,
          file_name: file.name,
          success: true,
        })
      } catch (fileError) {
        uploadedFiles.push({
          asset_id: '',
          file_name: file.name,
          success: false,
          error: fileError instanceof Error ? fileError.message : String(fileError),
        })
      }
    }

    const assetIds = uploadedFiles.filter((f) => f.success && f.asset_id).map((f) => f.asset_id)
    const failedUploads = uploadedFiles.filter((f) => !f.success).length

    return NextResponse.json({
      success: failedUploads === 0,
      asset_ids: assetIds,
      files: uploadedFiles,
      total_files: files.length,
      successful_uploads: assetIds.length,
      failed_uploads: failedUploads,
      message:
        failedUploads === 0
          ? `Successfully uploaded ${assetIds.length} file(s)`
          : `Uploaded ${assetIds.length} file(s), ${failedUploads} failed`,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('File upload error:', error)

    return NextResponse.json(
      {
        success: false,
        asset_ids: [],
        files: [],
        total_files: 0,
        successful_uploads: 0,
        failed_uploads: 0,
        message: 'Server error during upload',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
