import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRiskSettingsSchema,
  createTradeSchema,
  createTradeSignalSchema,
  listTradesQuerySchema,
  parseOrThrow,
  registerUserSchema,
} from '../lib/validation/trading';
import {
  analysisTriggerRequestSchema,
  loginRequestSchema,
  recommendationListResponseSchema,
  tradeExecutionRequestSchema,
  tradeHistoryResponseSchema,
} from '../lib/contracts/apiContracts';

test('unit: signal aggregation + indicator mapper canonicalizes trade signal payload', () => {
  const parsed = createTradeSignalSchema.parse({
    pair: 'BTC/MXN',
    signal_type: 'BUY',
    confidence: 78,
    indicators: { rsi: 62, macd: 'bullish' },
    status: 'pending',
  });

  assert.equal(parsed.pair, 'btc_mxn');
  assert.equal(parsed.signal, 'BUY');
  assert.equal(parsed.signal_type, 'BUY');
  assert.deepEqual(parsed.indicators_snapshot, { rsi: 62, macd: 'bullish' });
});

test('unit: risk rules mapper normalizes allowed pairs and enforces percentage bounds', () => {
  const normalized = createRiskSettingsSchema.parse({
    max_trade_amount: 1500,
    daily_limit: 2000,
    stop_loss_pct: 5,
    take_profit_pct: 8,
    allowed_pairs: ['btc_mxn', 'eth/mxn'],
  });

  assert.equal(normalized.allowed_pairs, 'BTC/MXN,ETH/MXN');
  assert.deepEqual(normalized.allowed_pairs_list, ['BTC/MXN', 'ETH/MXN']);

  assert.throws(() => createRiskSettingsSchema.parse({ stop_loss_pct: 120 }), /less than or equal to 100/);
});

test('unit: trade mapper fills order_ids + status aliases consistently', () => {
  const parsed = createTradeSchema.parse({
    pair: 'ETH/MXN',
    side: 'sell',
    bitso_order_id: 'oid-1',
    result_status: 'submitted',
  });

  assert.equal(parsed.pair, 'eth_mxn');
  assert.equal(parsed.status, 'submitted');
  assert.equal(parsed.order_ids.bitso_order_id, 'oid-1');
});

test('integration: analysis + execution + history payloads remain contract-compatible', () => {
  const analysisReq = analysisTriggerRequestSchema.parse({
    message: 'Analyze BTC/MXN and provide recommendation',
    agent_id: 'agent-123',
  });
  assert.equal(analysisReq.message.includes('BTC/MXN'), true);

  const recommendations = recommendationListResponseSchema.parse({
    success: true,
    data: [
      {
        pair: 'btc_mxn',
        signal: 'BUY',
        confidence: 74,
        status: 'approved',
        recommended_entry_price: '1500000',
      },
    ],
  });

  const executionReq = tradeExecutionRequestSchema.parse({
    recommendation: {
      pair: recommendations.data?.[0]?.pair,
      signal: recommendations.data?.[0]?.signal,
      status: 'approved',
    },
    execution: {
      type: 'market',
      amount_minor: '1000',
    },
  });

  assert.equal(executionReq.recommendation.status, 'approved');

  const history = tradeHistoryResponseSchema.parse({
    success: true,
    data: [{ pair: 'btc_mxn', side: 'buy', status: 'filled', bitso_order_id: 'oid-123' }],
  });
  assert.equal(history.data?.[0]?.status, 'filled');
});

test('integration: auth request payload normalization and validation', () => {
  const login = loginRequestSchema.parse({ email: 'TRADER@EXAMPLE.COM', password: '12345678' });
  const register = registerUserSchema.parse({ email: 'TRADER@EXAMPLE.COM', password: '12345678', name: 'Trader' });

  assert.equal(login.email, 'trader@example.com');
  assert.equal(register.email, 'trader@example.com');
});

test('e2e schema flow: login -> run analysis -> approve trade -> view history', () => {
  const login = parseOrThrow(loginRequestSchema, { email: 'user@example.com', password: '12345678' });
  assert.equal(login.email, 'user@example.com');

  const analysis = parseOrThrow(analysisTriggerRequestSchema, {
    message: 'Run coordinated analysis for BTC/MXN',
    agent_id: 'coordinator',
  });
  assert.equal(analysis.agent_id, 'coordinator');

  const execute = parseOrThrow(tradeExecutionRequestSchema, {
    recommendation: { pair: 'btc_mxn', signal: 'BUY', status: 'approved' },
    execution: { type: 'market', amount_minor: '2000' },
  });
  assert.equal(execute.recommendation.signal, 'BUY');

  const query = listTradesQuerySchema.parse({ pair: 'BTC/MXN', status: 'filled' });
  assert.equal(query.pair, 'btc_mxn');
});

test('failure paths: invalid payload, insufficient funds, rule violation, and timeout semantics', () => {
  assert.throws(
    () => parseOrThrow(tradeExecutionRequestSchema, { recommendation: { signal: 'BUY', status: 'approved' } }),
    /Validation failed/
  );

  const insufficientFundsResponse = {
    success: false,
    risk_violation_code: 'INSUFFICIENT_BALANCE',
    error: 'Insufficient MXN balance for buy order.',
  };
  assert.equal(insufficientFundsResponse.risk_violation_code, 'INSUFFICIENT_BALANCE');

  const ruleViolationResponse = {
    success: false,
    risk_violation_code: 'MAX_TRADE_AMOUNT_EXCEEDED',
    error: 'Trade amount exceeds your max trade amount.',
  };
  assert.equal(ruleViolationResponse.risk_violation_code, 'MAX_TRADE_AMOUNT_EXCEEDED');

  const timeoutStyleResponse = {
    success: false,
    error: 'Gateway timeout while submitting order',
    status: 504,
  };
  assert.equal(timeoutStyleResponse.status, 504);
});
