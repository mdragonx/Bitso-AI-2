import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId, withAuth } from '@/lib/auth';
import getBitsoCredentialModel from '@/models/BitsoCredential';
import getRiskSettingModel from '@/models/RiskSetting';
import getTradeModel from '@/models/Trade';
import crypto from 'crypto';

function createBitsoAuthHeader(apiKey: string, apiSecret: string, method: string, path: string, body: string = '') {
  const nonce = Date.now().toString();
  const message = nonce + method.toUpperCase() + path + body;
  const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
  return `Bitso ${apiKey}:${nonce}:${signature}`;
}

function normalizeBook(book: string) {
  return (book || '').trim().toLowerCase().replace('/', '_');
}

function toSafeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function riskViolation(
  risk_violation_code: string,
  error: string,
  details: Record<string, unknown>
) {
  return NextResponse.json(
    {
      success: false,
      error,
      risk_violation_code,
      details,
    },
    { status: 400 }
  );
}

async function estimateOrderNotionalMXN(payload: {
  book: string;
  type?: string;
  major?: string | number;
  minor?: string | number;
  price?: string | number;
}) {
  const major = toSafeNumber(payload.major);
  const minor = toSafeNumber(payload.minor);
  const price = toSafeNumber(payload.price);

  if (minor > 0) return minor;

  if (major <= 0) return 0;

  if (price > 0) return major * price;

  if ((payload.type || 'market') === 'market') {
    const tickerRes = await fetch(`https://bitso.com/api/v3/ticker/?book=${normalizeBook(payload.book)}`);
    const tickerJson = await tickerRes.json();
    const last = toSafeNumber(tickerJson?.payload?.last);
    if (last > 0) return major * last;
  }

  return 0;
}

async function handler(req: NextRequest) {
  try {
    const ownerUserId = getCurrentUserId(req);
    const Model = await getBitsoCredentialModel();
    const creds = await Model.find({ owner_user_id: ownerUserId });

    if (!Array.isArray(creds) || creds.length === 0) {
      return NextResponse.json({ success: false, error: 'No Bitso API credentials configured.' }, { status: 400 });
    }

    const credential = creds[0];
    const apiKey = credential.api_key;
    const apiSecret = credential.api_secret;

    const body = await req.json();
    const { book, side, type = 'market', major, minor, price } = body;

    if (!book || !side) {
      return NextResponse.json({ success: false, error: 'book and side are required' }, { status: 400 });
    }

    const RiskSettingModel = await getRiskSettingModel();
    const riskSetting = await RiskSettingModel.findOne({ owner_user_id: ownerUserId });

    if (riskSetting) {
      const requestedBook = normalizeBook(book);
      const allowedPairs = String(riskSetting.allowed_pairs || '')
        .split(',')
        .map((pair: string) => normalizeBook(pair))
        .filter(Boolean);

      if (allowedPairs.length > 0 && !allowedPairs.includes(requestedBook)) {
        return riskViolation(
          'PAIR_NOT_ALLOWED',
          'Selected pair is not allowed by your risk settings.',
          {
            requested_book: requestedBook,
            allowed_pairs: allowedPairs,
          }
        );
      }

      const requestedNotional = await estimateOrderNotionalMXN({ book, type, major, minor, price });
      const maxTradeAmount = toSafeNumber(riskSetting.max_trade_amount);

      if (maxTradeAmount > 0 && requestedNotional > maxTradeAmount) {
        return riskViolation(
          'MAX_TRADE_AMOUNT_EXCEEDED',
          'Requested trade exceeds max trade amount.',
          {
            requested_notional: requestedNotional,
            max_trade_amount: maxTradeAmount,
            type,
            major,
            minor,
            price,
          }
        );
      }

      const TradeModel = await getTradeModel();
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setUTCHours(23, 59, 59, 999);

      const todaysTrades = await TradeModel.find({
        owner_user_id: ownerUserId,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
        result_status: { $in: ['success', 'filled', 'completed'] },
      }).select('total_value');

      const todaysNotional = todaysTrades.reduce((sum: number, trade: any) => sum + toSafeNumber(trade.total_value), 0);
      const dailyLimit = toSafeNumber(riskSetting.daily_limit);

      if (dailyLimit > 0 && todaysNotional + requestedNotional > dailyLimit) {
        return riskViolation(
          'DAILY_LIMIT_EXCEEDED',
          'Requested trade exceeds your daily limit.',
          {
            todays_notional: todaysNotional,
            requested_notional: requestedNotional,
            projected_notional: todaysNotional + requestedNotional,
            daily_limit: dailyLimit,
          }
        );
      }
    }

    const orderPayload: any = { book, side, type };
    if (major) orderPayload.major = major;
    if (minor) orderPayload.minor = minor;
    if (price && type === 'limit') orderPayload.price = price;

    const path = '/api/v3/orders/';
    const bodyStr = JSON.stringify(orderPayload);
    const authHeader = createBitsoAuthHeader(apiKey, apiSecret, 'POST', path, bodyStr);

    const response = await fetch('https://bitso.com/api/v3/orders/', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: bodyStr,
    });

    const data = await response.json();

    if (!data.success) {
      return NextResponse.json({ success: false, error: data.error?.message || 'Bitso order failed', bitso_error: data.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: data.payload });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to place order' }, { status: 500 });
  }
}

const protectedHandler = withAuth(handler);
export const POST = protectedHandler;
