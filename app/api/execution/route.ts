import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import { executeApprovedRecommendation } from '@/lib/services/executionService';

const executeRecommendationSchema = z.object({
  recommendation: z.object({
    signal_id: z.string().optional(),
    pair: z.string().min(3),
    signal: z.enum(['BUY', 'SELL', 'HOLD']),
    status: z.enum(['approved', 'pending', 'rejected']),
    recommended_entry_price: z.string().optional(),
    stop_loss_price: z.string().optional(),
    recommended_exit_price: z.string().optional(),
  }),
  execution: z.object({
    amount_major: z.string().optional(),
    amount_minor: z.string().optional(),
    type: z.enum(['market', 'limit']).optional(),
    price: z.string().optional(),
  }),
  idempotency_key: z.string().optional(),
});

async function handler(req: NextRequest) {
  try {
    const ownerUserId = getCurrentUserId(req);
    const body = await req.json();
    const parsed = executeRecommendationSchema.safeParse(body);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      return NextResponse.json({ success: false, error: `Validation failed - ${issues.join('; ')}` }, { status: 400 });
    }

    const result = await executeApprovedRecommendation(ownerUserId, parsed.data);

    if (!result.success) {
      const status = result.risk_violation_code ? 400 : 502;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to execute recommendation' }, { status: 500 });
  }
}

export const POST = withAuth(handler);
