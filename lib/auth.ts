import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { recordAuthAnomaly } from '@/lib/observability/lifecycle';
import { hashPassword, verifyPassword } from '@/lib/passwordHash.mjs';

export { hashPassword, verifyPassword };

const AUTH_COOKIE_NAME = 'bitso_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-secret-change-me';

interface SessionPayload {
  userId: string;
  email: string;
  exp: number;
}

interface SessionValidationResult {
  session: SessionPayload | null;
  errorCode: 'UNAUTHORIZED' | 'SESSION_EXPIRED';
}

function base64UrlEncode(input: string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string) {
  const pad = input.length % 4;
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized + (pad ? '='.repeat(4 - pad) : ''), 'base64').toString('utf8');
}

function sign(data: string) {
  return createHmac('sha256', SECRET).update(data).digest('hex');
}

export function createSessionToken(userId: string, email: string) {
  const payload: SessionPayload = {
    userId,
    email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function validateSessionToken(token: string | undefined): SessionValidationResult {
  if (!token) return { session: null, errorCode: 'UNAUTHORIZED' };

  const [encodedPayload, sig] = token.split('.');
  if (!encodedPayload || !sig) {
    recordAuthAnomaly({ reason: 'SESSION_TOKEN_MALFORMED' });
    return { session: null, errorCode: 'UNAUTHORIZED' };
  }
  if (sign(encodedPayload) !== sig) {
    recordAuthAnomaly({ reason: 'SESSION_SIGNATURE_MISMATCH' });
    return { session: null, errorCode: 'UNAUTHORIZED' };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!payload.userId || !payload.exp) {
      recordAuthAnomaly({ reason: 'SESSION_PAYLOAD_INVALID' });
      return { session: null, errorCode: 'UNAUTHORIZED' };
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      recordAuthAnomaly({ reason: 'SESSION_EXPIRED' });
      return { session: null, errorCode: 'SESSION_EXPIRED' };
    }

    return { session: payload, errorCode: 'UNAUTHORIZED' };
  } catch {
    recordAuthAnomaly({ reason: 'SESSION_PAYLOAD_PARSE_FAILED' });
    return { session: null, errorCode: 'UNAUTHORIZED' };
  }
}

export function readSessionToken(token: string | undefined): SessionPayload | null {
  return validateSessionToken(token).session;
}

export function getSessionValidationFromRequest(req: NextRequest) {
  return validateSessionToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function getSessionFromRequest(req: NextRequest) {
  return getSessionValidationFromRequest(req).session;
}

export function getCurrentUserId(req: NextRequest) {
  const session = getSessionFromRequest(req);
  return session?.userId || '';
}

export function withAuth(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const validation = getSessionValidationFromRequest(req);
    if (!validation.session) {
      recordAuthAnomaly({ reason: validation.errorCode, correlationId: req.headers.get('x-correlation-id') || undefined });
      return NextResponse.json(
        {
          success: false,
          error: validation.errorCode === 'SESSION_EXPIRED' ? 'Session expired. Please sign in again.' : 'Unauthorized',
          error_code: validation.errorCode,
        },
        { status: 401 }
      );
    }

    return handler(req);
  };
}

export function applySessionCookie(response: NextResponse, token: string) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
