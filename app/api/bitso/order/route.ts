import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getCurrentUserId, withAuth } from '../../../../lib/auth';
import { decryptBitsoCredentialPair, migratePlaintextBitsoSecrets } from '../../../../lib/cryptoSecrets';
import { persistRejectedTradeAttempt, validateExecutionRiskRules } from '../../../../lib/services/riskValidationService';
import getBitsoCredentialModel from '../../../../models/BitsoCredential';
import getTradeModel from '../../../../models/Trade';
import { getBitsoBaseUrl, runtimeConfig } from '../../../../lib/config/runtime';

const orderRouteDependencies = {
  migratePlaintextBitsoSecrets,
  getBitsoCredentialModel,
  getTradeModel,
  decryptBitsoCredentialPair,
  validateExecutionRiskRules,
  persistRejectedTradeAttempt,
};

export function __setBitsoOrderRouteTestDependencies(overrides: Partial<typeof orderRouteDependencies>) {
  Object.assign(orderRouteDependencies, overrides);
}

export function __resetBitsoOrderRouteTestDependencies() {
  orderRouteDependencies.migratePlaintextBitsoSecrets = migratePlaintextBitsoSecrets;
  orderRouteDependencies.getBitsoCredentialModel = getBitsoCredentialModel;
  orderRouteDependencies.getTradeModel = getTradeModel;
  orderRouteDependencies.decryptBitsoCredentialPair = decryptBitsoCredentialPair;
  orderRouteDependencies.validateExecutionRiskRules = validateExecutionRiskRules;
  orderRouteDependencies.persistRejectedTradeAttempt = persistRejectedTradeAttempt;
}

function createBitsoAuthHeader(apiKey: string, apiSecret: string, method: string, path: string, body: string = '') {
  const nonce = Date.now().toString();
  const message = nonce + method.toUpperCase() + path + body;
  const signature = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
  return `Bitso ${apiKey}:${nonce}:${signature}`;
}

function normalizeBook(book: string) {
  return String(book || '').trim().toLowerCase().replace('/', '_');
}

function riskViolation(risk_violation_code: string, error: string, details: Record<string, unknown>) {
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

async function handler(req: NextRequest) {
  try {
    const ownerUserId = getCurrentUserId(req);
    await orderRouteDependencies.migratePlaintextBitsoSecrets();
    const Model = await orderRouteDependencies.getBitsoCredentialModel();
    const creds = await Model.find({ owner_user_id: ownerUserId });

    if (!Array.isArray(creds) || creds.length === 0) {
      return NextResponse.json({ success: false, error: 'No Bitso API credentials configured.' }, { status: 400 });
    }

    const credential = creds[0];
    const { apiKey, apiSecret } = orderRouteDependencies.decryptBitsoCredentialPair(credential.toObject ? credential.toObject() : credential);

    const body = await req.json();
    const { book, side, type = 'market', major, minor, price, idempotency_key } = body;

    if (!book || !side) {
      return NextResponse.json({ success: false, error: 'book and side are required' }, { status: 400 });
    }

    if (idempotency_key) {
      const TradeModel = await orderRouteDependencies.getTradeModel();
      const existingTrade = await TradeModel.findOne({
        owner_user_id: ownerUserId,
        idempotency_key,
        bitso_order_id: { $ne: '' },
      });

      if (existingTrade) {
        return NextResponse.json({
          success: true,
          data: {
            oid: existingTrade.bitso_order_id,
            book: existingTrade.pair,
            side: existingTrade.side,
            major: existingTrade.amount,
            minor: existingTrade.total_value,
            idempotent_replay: true,
          },
        });
      }
    }

    const normalizedBook = normalizeBook(book);
    const riskCheck = await orderRouteDependencies.validateExecutionRiskRules({
      ownerUserId,
      book: normalizedBook,
      side,
      type,
      major,
      minor,
      price,
      entryPrice: price,
      stopLossPrice: body.stop_loss_price,
      takeProfitPrice: body.take_profit_price,
    });

    if (!riskCheck.ok) {
      await orderRouteDependencies.persistRejectedTradeAttempt({
        ownerUserId,
        idempotencyKey: idempotency_key,
        pair: normalizedBook,
        side,
        amount: major,
        price,
        totalValue: minor,
        stopLossPrice: body.stop_loss_price,
        takeProfitPrice: body.take_profit_price,
        violationCode: riskCheck.code,
        violationMessage: riskCheck.message,
      });

      return riskViolation(riskCheck.code, riskCheck.message, riskCheck.details);
    }

    const orderPayload: any = { book, side, type };
    if (major) orderPayload.major = major;
    if (minor) orderPayload.minor = minor;
    if (price && type === 'limit') orderPayload.price = price;

    const path = '/api/v3/orders/';
    const bodyStr = JSON.stringify(orderPayload);
    if (runtimeConfig.tradingMode === 'paper') {
      return NextResponse.json({
        success: true,
        data: {
          oid: `paper-${idempotency_key || Date.now()}`,
          ...orderPayload,
          execution_mode: 'paper',
        },
      });
    }

    const authHeader = createBitsoAuthHeader(apiKey, apiSecret, 'POST', path, bodyStr);

    const response = await fetch(`${getBitsoBaseUrl()}/api/v3/orders/`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
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
