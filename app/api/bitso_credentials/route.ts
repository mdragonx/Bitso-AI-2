import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import {
  assertCredentialsEncryptionKeyConfigured,
  decryptSecret,
  encryptSecret,
  maskSecret,
  migratePlaintextBitsoSecrets,
} from '@/lib/cryptoSecrets';
import getBitsoCredentialModel from '@/models/BitsoCredential';

async function handler(req: NextRequest) {
  try {
    assertCredentialsEncryptionKeyConfigured();

    const userId = getCurrentUserId(req);
    await migratePlaintextBitsoSecrets({ ownerUserIdForBackfill: userId });

    const Model = await getBitsoCredentialModel();

    if (req.method === 'GET') {
      const data = await Model.find({ owner_user_id: userId });
      const masked = Array.isArray(data)
        ? data.map((d: any) => {
            const obj = d.toObject ? d.toObject() : { ...d };
            const decrypted = decryptSecret({
              ciphertext: obj.encrypted_api_secret_ciphertext,
              iv: obj.encrypted_api_secret_iv,
              tag: obj.encrypted_api_secret_tag,
            });

            obj.api_secret_masked = maskSecret(decrypted);
            delete obj.api_secret;
            delete obj.encrypted_api_secret_ciphertext;
            delete obj.encrypted_api_secret_iv;
            delete obj.encrypted_api_secret_tag;
            return obj;
          })
        : [];
      return NextResponse.json({ success: true, data: masked });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      if (!body.api_key || !body.api_secret) {
        return NextResponse.json({ success: false, error: 'api_key and api_secret are required' }, { status: 400 });
      }

      await Model.deleteMany({ owner_user_id: userId });
      const encrypted = encryptSecret(body.api_secret);
      const doc = await Model.create({
        api_key: body.api_key,
        encrypted_api_secret_ciphertext: encrypted.ciphertext,
        encrypted_api_secret_iv: encrypted.iv,
        encrypted_api_secret_tag: encrypted.tag,
        is_active: true,
        owner_user_id: userId,
      });

      return NextResponse.json({
        success: true,
        data: {
          _id: doc._id,
          api_key: doc.api_key,
          api_secret_masked: maskSecret(body.api_secret),
          is_active: doc.is_active,
        },
      });
    }

    if (req.method === 'DELETE') {
      await Model.deleteMany({ owner_user_id: userId });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Server error' }, { status: 500 });
  }
}

const protectedHandler = withAuth(handler);
export const GET = protectedHandler;
export const POST = protectedHandler;
export const DELETE = protectedHandler;
