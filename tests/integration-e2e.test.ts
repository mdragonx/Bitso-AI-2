import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { createSessionToken } from '../lib/auth';
import { POST as registerPost, __resetRegisterRouteTestDependencies, __setRegisterRouteTestDependencies } from '../app/api/auth/register/route';
import { POST as loginPost, __resetLoginRouteTestDependencies, __setLoginRouteTestDependencies } from '../app/api/auth/login/route';
import { GET as meGet, __resetMeRouteTestDependencies, __setMeRouteTestDependencies } from '../app/api/auth/me/route';
import { POST as logoutPost } from '../app/api/auth/logout/route';
import { POST as agentPost, __resetAgentRouteTestDependencies, __setAgentRouteTestDependencies } from '../app/api/agent/route';
import { POST as executionPost, __resetExecutionRouteTestDependencies, __setExecutionRouteTestDependencies } from '../app/api/execution/route';
import { POST as orderPost, __resetBitsoOrderRouteTestDependencies, __setBitsoOrderRouteTestDependencies } from '../app/api/bitso/order/route';
import {
  __resetExecutionServiceTestDependencies,
  __setExecutionServiceTestDependencies,
  executeApprovedRecommendation,
} from '../lib/services/executionService';
import { runtimeConfig } from '../lib/config/runtime';

type TradeRecord = Record<string, any>;

function createRequest(url: string, method: string, body?: Record<string, unknown>, cookie?: string) {
  const headers = new Headers();
  if (body) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createInMemoryTradeModel() {
  const trades: TradeRecord[] = [];

  function toDoc(record: TradeRecord) {
    return {
      ...record,
      async save() {
        const index = trades.findIndex((item) => item._id === record._id);
        if (index >= 0) {
          trades[index] = { ...trades[index], ...this };
          Object.assign(record, trades[index]);
        }
        return this;
      },
    };
  }

  return {
    trades,
    model: {
      async findOne(query: Record<string, any>) {
        const found = trades.find((trade) => {
          return Object.entries(query).every(([key, value]) => {
            if (value && typeof value === 'object' && '$ne' in value) {
              return trade[key] !== value.$ne;
            }
            return trade[key] === value;
          });
        });
        return found ? toDoc(found) : null;
      },
      async create(payload: Record<string, any>) {
        if (payload.idempotency_key) {
          const duplicate = trades.find(
            (trade) =>
              trade.owner_user_id === payload.owner_user_id && trade.idempotency_key === payload.idempotency_key
          );
          if (duplicate) {
            const error: any = new Error('Duplicate key');
            error.code = 11000;
            throw error;
          }
        }

        const created = {
          _id: `trade-${trades.length + 1}`,
          createdAt: new Date(),
          ...payload,
        };
        trades.push(created);
        return toDoc(created);
      },
      async findOneAndUpdate(query: Record<string, any>, payload: Record<string, any>) {
        const existing = trades.find(
          (trade) =>
            trade.owner_user_id === query.owner_user_id &&
            trade.idempotency_key === query.idempotency_key
        );
        if (existing) {
          Object.assign(existing, payload);
          return toDoc(existing);
        }

        const created = {
          _id: `trade-${trades.length + 1}`,
          createdAt: new Date(),
          ...payload,
        };
        trades.push(created);
        return toDoc(created);
      },
    },
  };
}

const originalTradingMode = runtimeConfig.tradingMode;

test.afterEach(() => {
  __resetRegisterRouteTestDependencies();
  __resetLoginRouteTestDependencies();
  __resetMeRouteTestDependencies();
  __resetAgentRouteTestDependencies();
  __resetExecutionRouteTestDependencies();
  __resetBitsoOrderRouteTestDependencies();
  __resetExecutionServiceTestDependencies();
  runtimeConfig.tradingMode = originalTradingMode;
});

test('auth flow register -> login -> me -> logout and protected endpoint guards', async () => {
  process.env.AUTH_SECRET = 'test-secret';

  const users: Record<string, any>[] = [];

  __setRegisterRouteTestDependencies({
    findUserByEmail: async (email: string) => users.find((u) => u.email === email) ?? null,
    createUser: async (input: Record<string, string>) => {
      const user = { _id: 'user-1', ...input };
      users.push(user);
      return user as any;
    },
    migrateAndSeedCollections: async () => undefined,
  });

  __setLoginRouteTestDependencies({
    getUserModel: async () => ({
      findOne: async ({ email }: { email: string }) => users.find((u) => u.email === email) ?? null,
      updateOne: async () => ({ acknowledged: true }),
    } as any),
    migrateAndSeedCollections: async () => undefined,
  });

  __setMeRouteTestDependencies({
    findUserById: async (id: string) => users.find((u) => u._id === id) ?? null,
  });

  const registerResponse = await registerPost(
    createRequest('http://localhost:3000/api/auth/register', 'POST', {
      email: 'flow@example.com',
      password: 'MyStrongPassword123!',
      name: 'Flow User',
    })
  );
  assert.equal(registerResponse.status, 200);

  const loginResponse = await loginPost(
    createRequest('http://localhost:3000/api/auth/login', 'POST', {
      email: 'flow@example.com',
      password: 'MyStrongPassword123!',
    })
  );
  assert.equal(loginResponse.status, 200);
  const sessionCookie = loginResponse.headers.get('set-cookie') || '';
  assert.match(sessionCookie, /bitso_session=/);

  const meResponse = await meGet(createRequest('http://localhost:3000/api/auth/me', 'GET', undefined, sessionCookie));
  assert.equal(meResponse.status, 200);

  const logoutResponse = await logoutPost();
  assert.equal(logoutResponse.status, 200);

  const unauthAgent = await agentPost(
    createRequest('http://localhost:3000/api/agent', 'POST', { message: 'x', agent_id: 'a' })
  );
  const unauthExecution = await executionPost(
    createRequest('http://localhost:3000/api/execution', 'POST', {
      recommendation: { pair: 'btc_mxn', signal: 'BUY', status: 'approved' },
      execution: { amount_major: '1' },
    })
  );
  const unauthOrder = await orderPost(
    createRequest('http://localhost:3000/api/bitso/order', 'POST', { book: 'btc_mxn', side: 'buy' })
  );

  assert.equal(unauthAgent.status, 401);
  assert.equal(unauthExecution.status, 401);
  assert.equal(unauthOrder.status, 401);
});

test('analysis orchestration aggregates coordinator sub-agent outputs', async () => {
  process.env.AUTH_SECRET = 'test-secret';
  const token = createSessionToken('user-42', 'coord@example.com');

  let calls = 0;
  __setAgentRouteTestDependencies({
    getAIProviderClient: () => ({
      generateStructuredResponse: async () => {
        calls += 1;
        if (calls === 1) {
          return { status: 'success', result: { signal: 'BUY', confidence: 70, summary: 'TA', risk_assessment: 'ra1', reasoning: 'r1' } };
        }
        return { status: 'success', result: { signal: 'SELL', confidence: 90, summary: 'MR', risk_assessment: 'ra2', reasoning: 'r2' } };
      },
    } as any),
  });

  const response = await agentPost(
    createRequest(
      'http://localhost:3000/api/agent',
      'POST',
      {
        message: 'Analyze BTC',
        agent_id: '69c440a030aebe1ba52aede0',
        metadata: { selected_pair: 'btc_mxn', timeframe: '1h', ohlc: [{ close: 1 }], market_context_items: ['news'] },
      },
      `bitso_session=${token}`
    )
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.response.result.signal, 'HOLD');
  assert.equal(payload.response.result.confidence.score, 80);
  assert.equal(payload.module_outputs.coordinator_flow.ohlc_points, 1);
});

test('execution service lifecycle persists transitions and idempotency replay', async () => {
  const { trades, model } = createInMemoryTradeModel();
  runtimeConfig.tradingMode = 'paper';

  __setExecutionServiceTestDependencies({
    migratePlaintextBitsoSecrets: async () => undefined,
    getBitsoCredentialModel: async () => ({ findOne: async () => ({ encrypted_api_key: 'x' }) } as any),
    decryptBitsoCredentialPair: () => ({ apiKey: 'k', apiSecret: 's' }),
    getTradeModel: async () => model as any,
    validateExecutionRiskRules: async () => ({ ok: true, details: { requested_notional: 100 } } as any),
    fetchBitsoBalances: async () => ({ success: true, status: 200, balances: [{ currency: 'mxn', available: '10000' }] } as any),
  });

  const first = await executeApprovedRecommendation('owner-1', {
    recommendation: { pair: 'btc_mxn', signal: 'BUY', status: 'approved', recommended_entry_price: '100' },
    execution: { amount_minor: '100', type: 'market' },
    idempotency_key: 'idem-1',
  });

  assert.equal(first.success, true);
  assert.equal(first.trade?.status, 'filled');

  const replay = await executeApprovedRecommendation('owner-1', {
    recommendation: { pair: 'btc_mxn', signal: 'BUY', status: 'approved', recommended_entry_price: '100' },
    execution: { amount_minor: '100', type: 'market' },
    idempotency_key: 'idem-1',
  });

  assert.equal(replay.idempotent_replay, true);
  assert.equal(trades.length, 1);
  assert.deepEqual(trades.map((trade) => trade.status), ['filled']);
});

test('execution service marks failed when exchange submission fails in live mode', async () => {
  const { trades, model } = createInMemoryTradeModel();
  runtimeConfig.tradingMode = 'live';

  __setExecutionServiceTestDependencies({
    migratePlaintextBitsoSecrets: async () => undefined,
    getBitsoCredentialModel: async () => ({ findOne: async () => ({ encrypted_api_key: 'x' }) } as any),
    decryptBitsoCredentialPair: () => ({ apiKey: 'k', apiSecret: 's' }),
    getTradeModel: async () => model as any,
    validateExecutionRiskRules: async () => ({ ok: true, details: { requested_notional: 100 } } as any),
    fetchBitsoBalances: async () => ({ success: true, status: 200, balances: [{ currency: 'mxn', available: '10000' }] } as any),
    submitBitsoOrder: async () => ({ success: false, status: 500, error: { message: 'down' } } as any),
  });

  const result = await executeApprovedRecommendation('owner-2', {
    recommendation: { pair: 'btc_mxn', signal: 'BUY', status: 'approved', recommended_entry_price: '100' },
    execution: { amount_minor: '100', type: 'market' },
    idempotency_key: 'idem-live-1',
  });

  assert.equal(result.success, false);
  assert.equal(trades[0].status, 'failed');
  assert.equal(trades[0].result_status, 'failed');
});

test('risk-rule enforcement persists rejected trades and order endpoint idempotency replay', async () => {
  process.env.AUTH_SECRET = 'test-secret';
  const token = createSessionToken('owner-3', 'risk@example.com');

  const { model } = createInMemoryTradeModel();
  const persisted: Record<string, any>[] = [];

  __setBitsoOrderRouteTestDependencies({
    migratePlaintextBitsoSecrets: async () => undefined,
    getBitsoCredentialModel: async () => ({ find: async () => [{ encrypted_api_key: 'abc' }] } as any),
    decryptBitsoCredentialPair: () => ({ apiKey: 'k', apiSecret: 's' }),
    getTradeModel: async () => ({
      findOne: async () => ({
        bitso_order_id: 'oid-123',
        pair: 'btc_mxn',
        side: 'buy',
        amount: '0.01',
        total_value: '100',
      }),
    } as any),
    validateExecutionRiskRules: async () => ({
      ok: false,
      code: 'MAX_TRADE_AMOUNT_EXCEEDED',
      message: 'too large',
      details: { max_trade_amount: 10 },
    } as any),
    persistRejectedTradeAttempt: async (payload: Record<string, any>) => {
      persisted.push(payload);
      return model.create(payload);
    },
  });

  const riskRejected = await orderPost(
    createRequest(
      'http://localhost:3000/api/bitso/order',
      'POST',
      {
        idempotency_key: 'order-risk-1',
        book: 'btc_mxn',
        side: 'buy',
        major: '1',
      },
      `bitso_session=${token}`
    )
  );
  assert.equal(riskRejected.status, 400);
  assert.equal(persisted.length, 1);

  __setBitsoOrderRouteTestDependencies({
    validateExecutionRiskRules: async () => ({ ok: true, details: {} } as any),
  });

  const replayResponse = await orderPost(
    createRequest(
      'http://localhost:3000/api/bitso/order',
      'POST',
      {
        idempotency_key: 'order-replay-1',
        book: 'btc_mxn',
        side: 'buy',
        major: '1',
      },
      `bitso_session=${token}`
    )
  );

  assert.equal(replayResponse.status, 200);
  const replayPayload = await replayResponse.json();
  assert.equal(replayPayload.data.idempotent_replay, true);
});

test('execution endpoint propagates risk rejection response payload', async () => {
  process.env.AUTH_SECRET = 'test-secret';
  const token = createSessionToken('owner-4', 'execution@example.com');

  __setExecutionRouteTestDependencies({
    executeApprovedRecommendation: async () => ({
      success: false,
      risk_violation_code: 'DAILY_LIMIT_EXCEEDED',
      error: 'daily exceeded',
      details: { projected_notional: 1000 },
    } as any),
  });

  const response = await executionPost(
    createRequest(
      'http://localhost:3000/api/execution',
      'POST',
      {
        recommendation: {
          pair: 'btc_mxn',
          signal: 'BUY',
          status: 'approved',
        },
        execution: {
          amount_major: '0.01',
        },
      },
      `bitso_session=${token}`
    )
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.risk_violation_code, 'DAILY_LIMIT_EXCEEDED');
});
