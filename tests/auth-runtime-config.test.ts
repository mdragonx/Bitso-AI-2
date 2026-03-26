import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from '../lib/auth';
import { validateRuntimeConfigAtStartup } from '../lib/config/runtime';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('startup validation fails when auth secret env vars are missing', () => {
  process.env = {
    ...ORIGINAL_ENV,
    AUTH_SECRET: '',
    NEXTAUTH_SECRET: '',
    MONGODB_URI: 'mongodb://localhost:27017/test',
    CREDENTIALS_ENCRYPTION_KEY: '12345678901234567890123456789012',
    AI_PROVIDER: 'local',
    OPENAI_API_KEY: '',
  };

  assert.throws(
    () => validateRuntimeConfigAtStartup(),
    /AUTH_SECRET \(or NEXTAUTH_SECRET\)/
  );
});

test('withAuth throws when auth secret env vars are missing', async () => {
  process.env = {
    ...ORIGINAL_ENV,
    AUTH_SECRET: '',
    NEXTAUTH_SECRET: '',
  };

  const protectedHandler = withAuth(async () => NextResponse.json({ success: true }));
  const req = new NextRequest('http://localhost:3000/api/agent', {
    headers: {
      cookie: 'bitso_session=payload.signature',
    },
  });

  await assert.rejects(
    async () => protectedHandler(req),
    /AUTH_SECRET \(or NEXTAUTH_SECRET\)/
  );
});

test('createSessionToken throws when auth secret env vars are missing', async () => {
  process.env = {
    ...ORIGINAL_ENV,
    AUTH_SECRET: '',
    NEXTAUTH_SECRET: '',
  };

  const { createSessionToken } = await import('../lib/auth');

  assert.throws(
    () => createSessionToken('user-1', 'user@example.com'),
    /AUTH_SECRET \(or NEXTAUTH_SECRET\)/
  );
});
