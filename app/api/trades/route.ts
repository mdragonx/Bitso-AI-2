import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import { createTradeForUser, getTradeByIdempotencyForUser, getTradesForUser } from '@/lib/services/tradingDataService';
import { createTradeSchema, parseOrThrow } from '@/lib/validation/trading';
import { tradeHistoryQuerySchema } from '@/lib/contracts/apiContracts';

async function handler(req: NextRequest) {
  try {
    const userId = getCurrentUserId(req);

    if (req.method === 'GET') {
      const { searchParams } = new URL(req.url);
      const query = parseOrThrow(
        tradeHistoryQuerySchema,
        Object.fromEntries(searchParams.entries())
      );

      const data = await getTradesForUser(userId, {
        status: query.status,
        pair: query.pair,
        from: query.from?.toISOString(),
        to: query.to?.toISOString(),
      });
      return NextResponse.json({ success: true, data });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const payload = parseOrThrow(createTradeSchema, body);
      try {
        const doc = await createTradeForUser(userId, payload);
        return NextResponse.json({ success: true, data: doc });
      } catch (createError: any) {
        if (createError?.code === 11000 && payload?.idempotency_key) {
          const existing = await getTradeByIdempotencyForUser(userId, payload.idempotency_key);

          if (existing) {
            return NextResponse.json({ success: true, data: existing, idempotent_replay: true });
          }
        }
        throw createError;
      }
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
