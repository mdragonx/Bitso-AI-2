import { model, models, Schema } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';

const BitsoCredentialSchema = new Schema(
  {
    api_key: { type: String, required: true },
    api_secret: { type: String, required: true },
    is_active: { type: Boolean, default: true },
    owner_user_id: { type: String, default: '' },
  },
  { timestamps: true }
);

export default async function getBitsoCredentialModel() {
  await connectToDatabase();
  return models.BitsoCredential || model('BitsoCredential', BitsoCredentialSchema);
}
