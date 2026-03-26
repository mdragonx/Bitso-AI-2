import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import { createRiskSettingsForUser, getRiskSettingsForUser, updateRiskSettingsForUser } from '@/lib/services/tradingDataService';
import { createRiskSettingsSchema, parseOrThrow, updateRiskSettingsSchema } from '@/lib/validation/trading';

const updateRiskSettingsRequestSchema = z.object({
  id: z.string().min(1),
}).and(updateRiskSettingsSchema);

async function handler(req: NextRequest) {
  try {
    const userId = getCurrentUserId(req);

    if (req.method === 'GET') {
      const data = await getRiskSettingsForUser(userId);
      return NextResponse.json({ success: true, data });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const payload = parseOrThrow(createRiskSettingsSchema, body);
      const doc = await createRiskSettingsForUser(userId, payload);
      return NextResponse.json({ success: true, data: doc });
    }

    if (req.method === 'PUT') {
      const body = await req.json();
      const { id, ...updates } = parseOrThrow(updateRiskSettingsRequestSchema, body);
      const doc = await updateRiskSettingsForUser(userId, id, updates);
      return NextResponse.json({ success: true, data: doc });
    }

    return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    const status = error?.message?.includes('Validation failed') ? 400 : 500;
    return NextResponse.json({ success: false, error: error.message || 'Server error' }, { status });
  }
}

const protectedHandler = withAuth(handler);
export const GET = protectedHandler;
export const POST = protectedHandler;
export const PUT = protectedHandler;
