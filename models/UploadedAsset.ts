import { model, models, Schema } from 'mongoose'
import connectToDatabase from '@/lib/mongodb'

const UploadedAssetSchema = new Schema(
  {
    asset_id: { type: String, required: true, unique: true, index: true },
    filename: { type: String, required: true },
    mime: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    storage_key: { type: String, required: true },
    owner_user_id: { type: String, required: true, index: true },
  },
  { timestamps: true, collection: 'uploaded_assets' }
)

export default async function getUploadedAssetModel() {
  await connectToDatabase()
  return models.UploadedAsset || model('UploadedAsset', UploadedAssetSchema)
}
