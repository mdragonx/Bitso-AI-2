import { randomUUID } from 'crypto'
import getUploadedAssetModel from '@/models/UploadedAsset'

export interface CreateAssetRecordInput {
  filename: string
  mime: string
  size: number
  storageKey: string
  ownerUserId: string
}

export interface AssetRecord {
  asset_id: string
  filename: string
  mime: string
  size: number
  storage_key: string
  owner_user_id: string
  createdAt: Date
  updatedAt: Date
}

export async function createAssetRecord(input: CreateAssetRecordInput): Promise<AssetRecord> {
  const UploadedAsset = await getUploadedAssetModel()

  const record = await UploadedAsset.create({
    asset_id: randomUUID(),
    filename: input.filename,
    mime: input.mime,
    size: input.size,
    storage_key: input.storageKey,
    owner_user_id: input.ownerUserId,
  })

  return {
    asset_id: record.asset_id,
    filename: record.filename,
    mime: record.mime,
    size: record.size,
    storage_key: record.storage_key,
    owner_user_id: record.owner_user_id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}
