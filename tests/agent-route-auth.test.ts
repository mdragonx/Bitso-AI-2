import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { createSessionToken } from '../lib/auth';
import { __resetAgentRouteTestDependencies, __setAgentRouteTestDependencies, POST } from '../app/api/agent/route';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function createRequest(body: Record<string, unknown>, cookie?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);

  return new NextRequest('http://localhost:3000/api/agent', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
  __resetAgentRouteTestDependencies();
});

test('unauthenticated request returns 401', async () => {
  const request = createRequest({ message: 'Analyze BTC', agent_id: 'agent-1' });
  const response = await POST(request);
  assert.equal(response.status, 401);
});

test('authenticated request succeeds with session-derived user id', async () => {
  const generatedInputs: Array<Record<string, unknown>> = [];
  __setAgentRouteTestDependencies({
    getAIProviderClient: () => ({
      generateStructuredResponse: async (input: Record<string, unknown>) => {
        generatedInputs.push(input);
        return { status: 'success', result: { signal: 'BUY', confidence: 80 } };
      },
    }),
  });

  const token = createSessionToken('server-user-123', 'test@example.com');
  const request = createRequest({ message: 'Analyze BTC', agent_id: 'agent-1' }, `bitso_session=${token}`);
  const response = await POST(request);

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(generatedInputs.length, 1);
  assert.equal(generatedInputs[0].user_id, 'server-user-123');
});

test('spoofed user_id in payload is rejected', async () => {
  const token = createSessionToken('server-user-123', 'test@example.com');
  const request = createRequest(
    { message: 'Analyze BTC', agent_id: 'agent-1', user_id: 'spoofed-user' },
    `bitso_session=${token}`
  );
  const response = await POST(request);

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(String(payload.error || ''), /user_id is derived from the authenticated session/i);
});

test('polling payload is rejected because the endpoint is synchronous only', async () => {
  const token = createSessionToken('server-user-123', 'test@example.com');
  const request = createRequest(
    { message: 'Analyze BTC', agent_id: 'agent-1', task_id: 'task-1' },
    `bitso_session=${token}`
  );
  const response = await POST(request);

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(String(payload.error || ''), /unrecognized key/i);
});
