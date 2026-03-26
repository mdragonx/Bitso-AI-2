import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

export interface StoredObject {
  storageKey: string
  byteSize: number
}

export interface PutObjectInput {
  bytes: Buffer
  contentType: string
  originalFilename: string
  ownerUserId: string
}

interface ObjectStore {
  putObject(input: PutObjectInput): Promise<StoredObject>
}

class LocalObjectStore implements ObjectStore {
  constructor(private readonly baseDir: string) {}

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const safeFileName = input.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storageKey = `${input.ownerUserId}/${Date.now()}-${randomUUID()}-${safeFileName}`
    const filePath = path.join(this.baseDir, storageKey)

    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, input.bytes)

    return {
      storageKey,
      byteSize: input.bytes.length,
    }
  }
}

/**
 * S3-compatible upload using pre-signed PUT URLs.
 * Required envs:
 * - S3_BUCKET
 * - S3_PRESIGNED_UPLOAD_URL_TEMPLATE (must include {bucket} and {key} placeholders)
 */
class S3CompatibleObjectStore implements ObjectStore {
  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const bucket = process.env.S3_BUCKET
    const urlTemplate = process.env.S3_PRESIGNED_UPLOAD_URL_TEMPLATE

    if (!bucket || !urlTemplate) {
      throw new Error('S3_BUCKET and S3_PRESIGNED_UPLOAD_URL_TEMPLATE are required for s3 backend')
    }

    const safeFileName = input.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storageKey = `${input.ownerUserId}/${Date.now()}-${randomUUID()}-${safeFileName}`

    const uploadUrl = urlTemplate
      .replace('{bucket}', encodeURIComponent(bucket))
      .replace('{key}', encodeURIComponent(storageKey))

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': input.contentType,
      },
      body: input.bytes,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`S3 upload failed with status ${response.status}: ${errorText}`)
    }

    return {
      storageKey,
      byteSize: input.bytes.length,
    }
  }
}

let cachedStore: ObjectStore | null = null

function resolveLocalUploadDir() {
  if (process.env.UPLOAD_LOCAL_DIR) {
    return process.env.UPLOAD_LOCAL_DIR
  }

  if (process.env.NODE_ENV === 'production') {
    return '/tmp/uploads'
  }

  return path.join(process.cwd(), '.data', 'uploads')
}

export function getObjectStore(): ObjectStore {
  if (cachedStore) {
    return cachedStore
  }

  const backend = (process.env.OBJECT_STORE_BACKEND || (process.env.NODE_ENV === 'production' ? 's3' : 'local')).toLowerCase()

  cachedStore = backend === 's3' ? new S3CompatibleObjectStore() : new LocalObjectStore(resolveLocalUploadDir())
  return cachedStore
}

export async function storeUploadObject(input: PutObjectInput): Promise<StoredObject> {
  return getObjectStore().putObject(input)
}
