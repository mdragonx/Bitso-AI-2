import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import getRiskSettingModel from '@/models/RiskSetting';

async function handler(req: NextRequest) {
  try {
    const Model = await getRiskSettingModel();
    const userId = getCurrentUserId(req);

    if (req.method === 'GET') {
      const data = await Model.find({ owner_user_id: userId });
      return NextResponse.json({ success: true, data });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const doc = await Model.create({ ...body, owner_user_id: userId });
      return NextResponse.json({ success: true, data: doc });
    }

    if (req.method === 'PUT') {
      const body = await req.json();
      const { id, ...updates } = body;
      if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      const doc = await Model.findOneAndUpdate({ _id: id, owner_user_id: userId }, updates, { new: true });
      return NextResponse.json({ success: true, data: doc });
    }

    return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Server error' }, { status: 500 });
  }
}

const protectedHandler = withAuth(handler);
export const GET = protectedHandler;
export const POST = protectedHandler;
export const PUT = protectedHandler;
