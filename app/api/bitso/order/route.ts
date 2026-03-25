import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware } from 'lyzr-architect';
import getBitsoCredentialModel from '@/models/BitsoCredential';
import crypto from 'crypto';

function createBitsoAuthHeader(apiKey: string, apiSecret: string, method: string, path: string, body: string = '') {
  const nonce = Date.now().toString();
  const message = nonce + method.toUpperCase() + path + body;
  const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
  return `Bitso ${apiKey}:${nonce}:${signature}`;
}

async function handler(req: NextRequest) {
  try {
    const Model = await getBitsoCredentialModel();
    const creds = await Model.find({});

    if (!Array.isArray(creds) || creds.length === 0) {
      return NextResponse.json({ success: false, error: 'No Bitso API credentials configured.' }, { status: 400 });
    }

    const credential = creds[0];
    const apiKey = credential.api_key;
    const apiSecret = credential.api_secret;

    const body = await req.json();
    const { book, side, type = 'market', major, minor, price } = body;

    if (!book || !side) {
      return NextResponse.json({ success: false, error: 'book and side are required' }, { status: 400 });
    }

    const orderPayload: any = { book, side, type };
    if (major) orderPayload.major = major;
    if (minor) orderPayload.minor = minor;
    if (price && type === 'limit') orderPayload.price = price;

    const path = '/api/v3/orders/';
    const bodyStr = JSON.stringify(orderPayload);
    const authHeader = createBitsoAuthHeader(apiKey, apiSecret, 'POST', path, bodyStr);

    const response = await fetch('https://bitso.com/api/v3/orders/', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: bodyStr,
    });

    const data = await response.json();

    if (!data.success) {
      return NextResponse.json({ success: false, error: data.error?.message || 'Bitso order failed', bitso_error: data.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: data.payload });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to place order' }, { status: 500 });
  }
}

const protectedHandler = authMiddleware(handler);
export const POST = protectedHandler;
