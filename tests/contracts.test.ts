import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analysisTriggerRequestSchema,
  analysisTriggerResponseSchema,
  recommendationListResponseSchema,
  tradeExecutionRequestSchema,
  tradeExecutionResponseSchema,
  tradeHistoryQuerySchema,
  tradeHistoryResponseSchema,
  riskSettingsPayloadSchema,
  riskSettingsResponseSchema,
  loginRequestSchema,
  registerRequestSchema,
  authResponseSchema,
  logoutResponseSchema,
} from '../lib/contracts/apiContracts';

test('analysis trigger contracts validate request and response', () => {
  const request = analysisTriggerRequestSchema.parse({ message: 'Analyze BTC', agent_id: 'agent-1' });
  assert.equal(request.agent_id, 'agent-1');
  assert.equal('user_id' in request, false);

  const response = analysisTriggerResponseSchema.parse({
    success: true,
    data: { result: { signal: 'BUY' } },
  });
  assert.equal(response.success, true);
});

test('recommendation retrieval response contract', () => {
  const response = recommendationListResponseSchema.parse({
    success: true,
    data: [{ pair: 'btc_mxn', signal: 'BUY', confidence: 70, status: 'pending' }],
  });
  assert.equal(response.data?.[0]?.pair, 'btc_mxn');
});

test('trade execution request/response contracts', () => {
  const request = tradeExecutionRequestSchema.parse({
    recommendation: { pair: 'btc_mxn', signal: 'BUY', status: 'approved' },
    execution: { type: 'market' },
  });
  assert.equal(request.recommendation.signal, 'BUY');

  const response = tradeExecutionResponseSchema.parse({ success: true, data: { execution_id: 'ex-1' } });
  assert.equal(response.success, true);
});

test('trade history contracts', () => {
  const query = tradeHistoryQuerySchema.parse({ status: 'filled', pair: 'BTC/MXN' });
  assert.equal(query.pair, 'btc_mxn');

  const response = tradeHistoryResponseSchema.parse({
    success: true,
    data: [{ pair: 'btc_mxn', side: 'buy', status: 'filled' }],
  });
  assert.equal(response.data?.length, 1);
});

test('risk settings contracts', () => {
  const payload = riskSettingsPayloadSchema.parse({ max_trade_amount: 100, behavioral_position: 'moderate' });
  assert.equal(payload.behavioral_position, 'moderate');

  const response = riskSettingsResponseSchema.parse({ success: true, data: { max_trade_amount: 100 } });
  assert.equal(response.success, true);
});

test('auth flow contracts', () => {
  const login = loginRequestSchema.parse({ email: 'USER@example.com', password: '12345678' });
  assert.equal(login.email, 'user@example.com');

  const register = registerRequestSchema.parse({ email: 'user@example.com', password: '12345678', name: 'User' });
  assert.equal(register.name, 'User');

  const auth = authResponseSchema.parse({
    success: true,
    data: { user: { _id: 'u1', email: 'user@example.com', name: 'User' } },
  });
  assert.equal(auth.success, true);

  const logout = logoutResponseSchema.parse({ success: true });
  assert.equal(logout.success, true);
});
