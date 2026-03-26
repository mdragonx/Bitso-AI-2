import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import getBitsoCredentialModel from '@/models/BitsoCredential';
import { decryptSecret, migratePlaintextBitsoSecrets } from '@/lib/cryptoSecrets';
import crypto from 'crypto';

function createBitsoAuthHeader(apiKey: string, apiSecret: string, method: string, path: string, body: string = '') {
  const nonce = Date.now().toString();
  const message = nonce + method.toUpperCase() + path + body;
  const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
  return `Bitso ${apiKey}:${nonce}:${signature}`;
}

async function handler(req: NextRequest) {
  try {
    await migratePlaintextBitsoSecrets();
    const Model = await getBitsoCredentialModel();
    const creds = await Model.find({ owner_user_id: getCurrentUserId(req) });

    if (!Array.isArray(creds) || creds.length === 0) {
      return NextResponse.json({ success: false, error: 'No Bitso API credentials configured. Go to API Settings to add your keys.' }, { status: 400 });
    }

    const credential = creds[0];
    const apiKey = credential.api_key;
    const apiSecret = decryptSecret({
      ciphertext: credential.encrypted_api_secret_ciphertext,
      iv: credential.encrypted_api_secret_iv,
      tag: credential.encrypted_api_secret_tag,
    });

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ success: false, error: 'Invalid Bitso credentials' }, { status: 400 });
    }

    const path = '/api/v3/balance/';
    const authHeader = createBitsoAuthHeader(apiKey, apiSecret, 'GET', path);

    const response = await fetch('https://bitso.com/api/v3/balance/', {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!data.success) {
      return NextResponse.json({ success: false, error: data.error?.message || 'Bitso API error', bitso_error: data.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: data.payload });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch balance' }, { status: 500 });
  }
}

const protectedHandler = withAuth(handler);
export const GET = protectedHandler;
