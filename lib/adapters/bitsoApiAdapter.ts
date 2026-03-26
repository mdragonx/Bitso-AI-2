import crypto from 'crypto';

export type BitsoBalance = {
  currency: string;
  total: string;
  locked?: string;
  available: string;
};

export type BitsoOrderRequest = {
  book: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  major?: string;
  minor?: string;
  price?: string;
};

export type BitsoAdapterResponse<T> = {
  success: boolean;
  payload?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

function createBitsoAuthHeader(apiKey: string, apiSecret: string, method: string, path: string, body = '') {
  const nonce = Date.now().toString();
  const message = nonce + method.toUpperCase() + path + body;
  const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
  return `Bitso ${apiKey}:${nonce}:${signature}`;
}

async function requestBitso<T>(params: {
  apiKey: string;
  apiSecret: string;
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
}): Promise<{ status: number; data: BitsoAdapterResponse<T> }> {
  const bodyString = params.body ? JSON.stringify(params.body) : '';
  const authHeader = createBitsoAuthHeader(params.apiKey, params.apiSecret, params.method, params.path, bodyString);

  const response = await fetch(`https://bitso.com${params.path}`, {
    method: params.method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: params.method === 'POST' ? bodyString : undefined,
  });

  const data = (await response.json()) as BitsoAdapterResponse<T>;
  return { status: response.status, data };
}

export async function fetchBitsoBalances(apiKey: string, apiSecret: string) {
  const result = await requestBitso<{ balances: BitsoBalance[] }>({
    apiKey,
    apiSecret,
    method: 'GET',
    path: '/api/v3/balance/',
  });

  return {
    status: result.status,
    success: Boolean(result.data?.success),
    balances: result.data?.payload?.balances ?? [],
    error: result.data?.error,
  };
}

export async function fetchBitsoTickerLast(book: string) {
  const response = await fetch(`https://bitso.com/api/v3/ticker/?book=${book}`);
  const data = await response.json();
  const last = data?.payload?.last;
  return typeof last === 'string' ? last : '';
}

export async function submitBitsoOrder(apiKey: string, apiSecret: string, order: BitsoOrderRequest) {
  const result = await requestBitso<{
    oid: string;
    created_at?: string;
    book?: string;
    side?: string;
    price?: string;
    original_amount?: string;
  }>({
    apiKey,
    apiSecret,
    method: 'POST',
    path: '/api/v3/orders/',
    body: order,
  });

  return {
    status: result.status,
    success: Boolean(result.data?.success),
    payload: result.data?.payload,
    error: result.data?.error,
  };
}
