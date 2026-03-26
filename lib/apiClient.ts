'use client';

export const AUTH_EVENT = 'bitso:auth-required';

export type AuthFailureCode = 'UNAUTHORIZED' | 'SESSION_EXPIRED';

export interface ApiResponseShape {
  success?: boolean;
  error?: string;
  error_code?: AuthFailureCode | string;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function emitAuthRequired(code: AuthFailureCode) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { code } }));
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401) {
    let code: AuthFailureCode = 'UNAUTHORIZED';
    try {
      const body = (await res.clone().json()) as ApiResponseShape;
      if (body?.error_code === 'SESSION_EXPIRED') {
        code = 'SESSION_EXPIRED';
      }
    } catch {
      // ignore body parsing errors
    }

    emitAuthRequired(code);
    throw new ApiError(code === 'SESSION_EXPIRED' ? 'Session expired' : 'Unauthorized', 401, code);
  }

  return res;
}

export async function apiFetchJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  return res.json() as Promise<T>;
}
