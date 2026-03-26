import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import { tradeExecutionRequestSchema } from '@/lib/contracts/apiContracts';
import { parseOrThrow } from '@/lib/validation/trading';
import { executeApprovedRecommendation } from '@/lib/services/executionService';

async function handler(req: NextRequest) {
  try {
    const ownerUserId = getCurrentUserId(req);
    const body = await req.json();
    const payload = parseOrThrow(tradeExecutionRequestSchema, body);

    const result = await executeApprovedRecommendation(ownerUserId, payload);

    if (!result.success) {
      const status = result.risk_violation_code ? 400 : 502;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.message?.includes('Validation failed') ? 400 : 500;
    return NextResponse.json({ success: false, error: error?.message || 'Failed to execute recommendation' }, { status });
  }
}

export const POST = withAuth(handler);
