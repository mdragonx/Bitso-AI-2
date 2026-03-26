import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
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

export function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [encodedPayload, sig] = token.split('.');
  if (!encodedPayload || !sig) return null;
  if (sign(encodedPayload) !== sig) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.userId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: NextRequest) {
  return readSessionToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function getCurrentUserId(req: NextRequest) {
  const session = getSessionFromRequest(req);
  return session?.userId || '';
}

export function withAuth(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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
