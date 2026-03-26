import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import {
  createTradeSignalForUser,
  deleteTradeSignalForUser,
  getTradeSignalsForUser,
  updateTradeSignalForUser,
} from '@/lib/services/tradingDataService';
import { createTradeSignalSchema, parseOrThrow, updateTradeSignalSchema } from '@/lib/validation/trading';

const updateTradeSignalRequestSchema = z.object({
  id: z.string().min(1),
}).and(updateTradeSignalSchema);

const deleteTradeSignalQuerySchema = z.object({
  id: z.string().min(1),
});

async function handler(req: NextRequest) {
  try {
    const userId = getCurrentUserId(req);

    if (req.method === 'GET') {
      const data = await getTradeSignalsForUser(userId);
      return NextResponse.json({ success: true, data });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const payload = parseOrThrow(createTradeSignalSchema, body);
      const doc = await createTradeSignalForUser(userId, payload);
      return NextResponse.json({ success: true, data: doc });
    }

    if (req.method === 'PUT') {
      const body = await req.json();
      const { id, ...updates } = parseOrThrow(updateTradeSignalRequestSchema, body);
      const doc = await updateTradeSignalForUser(userId, id, updates);
      return NextResponse.json({ success: true, data: doc });
    }

    if (req.method === 'DELETE') {
      const { searchParams } = new URL(req.url);
      const { id } = parseOrThrow(deleteTradeSignalQuerySchema, Object.fromEntries(searchParams.entries()));
      await deleteTradeSignalForUser(userId, id);
      return NextResponse.json({ success: true, data: { deleted: true } });
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
export const DELETE = protectedHandler;
