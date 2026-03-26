import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import { tradeExecutionRequestSchema } from '@/lib/contracts/apiContracts';
import {
  getCorrelationContextFromRequest,
  recordExecutionMetric,
  withLifecycleLog,
} from '@/lib/observability/lifecycle';
import { parseOrThrow } from '@/lib/validation/trading';
import { executeApprovedRecommendation } from '@/lib/services/executionService';

async function handler(req: NextRequest) {
  const startedAt = Date.now();
  const correlation = getCorrelationContextFromRequest(req);
  try {
    const ownerUserId = getCurrentUserId(req);
    const body = await req.json();
    const payload = parseOrThrow(tradeExecutionRequestSchema, body);
    const baseLogContext = {
      correlation_id: correlation.correlationId,
      request_id: correlation.requestId,
      owner_user_id: ownerUserId,
      signal_id: payload.recommendation.signal_id || null,
      pair: payload.recommendation.pair,
      signal: payload.recommendation.signal,
    };

    withLifecycleLog('info', 'execution_request_received', baseLogContext);

    const result = await executeApprovedRecommendation(ownerUserId, payload);

    if (!result.success) {
      const latencyMs = Date.now() - startedAt;
      recordExecutionMetric({ success: false, rejectionReason: result.risk_violation_code || 'EXECUTION_FAILED' });
      withLifecycleLog('warn', 'execution_request_rejected', {
        ...baseLogContext,
        latency_ms: latencyMs,
        risk_violation_code: result.risk_violation_code || null,
        error: result.error || null,
      });
      const status = result.risk_violation_code ? 400 : 502;
      const response = NextResponse.json(result, { status });
      response.headers.set('x-correlation-id', correlation.correlationId);
      response.headers.set('x-request-id', correlation.requestId);
      return response;
    }

    const latencyMs = Date.now() - startedAt;
    recordExecutionMetric({ success: true });
    withLifecycleLog('info', 'execution_request_completed', {
      ...baseLogContext,
      latency_ms: latencyMs,
      trade_id: result.trade?._id ? String(result.trade._id) : null,
      idempotent_replay: Boolean(result.idempotent_replay),
    });
    const response = NextResponse.json(result);
    response.headers.set('x-correlation-id', correlation.correlationId);
    response.headers.set('x-request-id', correlation.requestId);
    return response;
  } catch (error: any) {
    const latencyMs = Date.now() - startedAt;
    recordExecutionMetric({ success: false, rejectionReason: 'EXECUTION_EXCEPTION' });
    withLifecycleLog('error', 'execution_request_failed', {
      correlation_id: correlation.correlationId,
      request_id: correlation.requestId,
      latency_ms: latencyMs,
      error_message: error?.message || 'Failed to execute recommendation',
    });
    const status = error?.message?.includes('Validation failed') ? 400 : 500;
    const response = NextResponse.json(
      { success: false, error: error?.message || 'Failed to execute recommendation' },
      { status }
    );
    response.headers.set('x-correlation-id', correlation.correlationId);
    response.headers.set('x-request-id', correlation.requestId);
    return response;
  }
}

export const POST = withAuth(handler);
