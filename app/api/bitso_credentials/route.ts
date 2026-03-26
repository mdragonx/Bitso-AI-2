import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import getBitsoCredentialModel from '@/models/BitsoCredential';

async function handler(req: NextRequest) {
  try {
    const Model = await getBitsoCredentialModel();
    const userId = getCurrentUserId(req);

    if (req.method === 'GET') {
      const data = await Model.find({ owner_user_id: userId });
      // Mask the secret for security - only return last 4 chars
      const masked = Array.isArray(data) ? data.map((d: any) => {
        const obj = d.toObject ? d.toObject() : { ...d };
        if (obj.api_secret) {
          obj.api_secret_masked = '****' + obj.api_secret.slice(-4);
          delete obj.api_secret;
        }
        return obj;
      }) : [];
      return NextResponse.json({ success: true, data: masked });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      if (!body.api_key || !body.api_secret) {
        return NextResponse.json({ success: false, error: 'api_key and api_secret are required' }, { status: 400 });
      }
      // Remove any existing credentials for this user first
      await Model.deleteMany({ owner_user_id: userId });
      const doc = await Model.create({
        api_key: body.api_key,
        api_secret: body.api_secret,
        is_active: true,
        owner_user_id: userId,
      });
      return NextResponse.json({ success: true, data: { _id: doc._id, api_key: doc.api_key, api_secret_masked: '****' + doc.api_secret.slice(-4), is_active: doc.is_active } });
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
