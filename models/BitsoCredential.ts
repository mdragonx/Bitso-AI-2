import { model, models, Schema } from 'mongoose';
import connectToDatabase from '../lib/mongodb';

const BitsoCredentialSchema = new Schema(
  {
    api_key: { type: String, default: '' },
    encrypted_api_key_ciphertext: { type: String, default: '' },
    encrypted_api_key_iv: { type: String, default: '' },
    encrypted_api_key_tag: { type: String, default: '' },
    encrypted_api_secret_ciphertext: { type: String, default: '' },
    encrypted_api_secret_iv: { type: String, default: '' },
    encrypted_api_secret_tag: { type: String, default: '' },
    is_active: { type: Boolean, default: true },
    owner_user_id: { type: String, default: '' },
  },
  { timestamps: true, strict: false }
);

BitsoCredentialSchema.index({ owner_user_id: 1 });

export default async function getBitsoCredentialModel() {
  await connectToDatabase();
  return models.BitsoCredential || model('BitsoCredential', BitsoCredentialSchema);
}
