import crypto from 'crypto';
import getBitsoCredentialModel from '@/models/BitsoCredential';
import getRiskSettingModel from '@/models/RiskSetting';
import getTradeModel from '@/models/Trade';
import { decryptSecret, migratePlaintextBitsoSecrets } from '@/lib/cryptoSecrets';
import { fetchBitsoBalances, fetchBitsoTickerLast, submitBitsoOrder } from '@/lib/adapters/bitsoApiAdapter';

export type ExecuteRecommendationInput = {
  recommendation: {
    signal_id?: string;
    pair: string;
    signal: 'BUY' | 'SELL' | 'HOLD';
    status: 'approved' | 'pending' | 'rejected';
    recommended_entry_price?: string;
    stop_loss_price?: string;
    recommended_exit_price?: string;
  };
  execution: {
    amount_major?: string;
    amount_minor?: string;
    type?: 'market' | 'limit';
    price?: string;
  };
  idempotency_key?: string;
};

function normalizeBook(book: string) {
  return String(book || '').trim().toLowerCase().replace('/', '_');
}

function toSafeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeAuditLog(event: string, data: Record<string, unknown>) {
  console.info('[execution-audit]', JSON.stringify({ event, ts: new Date().toISOString(), ...data }));
}

function splitCurrenciesFromBook(book: string) {
  const [base, quote] = normalizeBook(book).split('_');
  return { base: base || '', quote: quote || '' };
}

async function estimateNotionalMXN(params: {
  book: string;
  type: 'market' | 'limit';
  major?: string;
  minor?: string;
  price?: string;
}) {
  const major = toSafeNumber(params.major);
  const minor = toSafeNumber(params.minor);
  const price = toSafeNumber(params.price);

  if (minor > 0) return minor;
  if (major <= 0) return 0;
  if (price > 0) return major * price;

  if (params.type === 'market') {
    const last = toSafeNumber(await fetchBitsoTickerLast(normalizeBook(params.book)));
    if (last > 0) return major * last;
  }

  return 0;
}

async function validateRiskAndBalance(params: {
  ownerUserId: string;
  apiKey: string;
  apiSecret: string;
  book: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  major?: string;
  minor?: string;
  price?: string;
}) {
  const RiskSettingModel = await getRiskSettingModel();
  const riskSetting = await RiskSettingModel.findOne({ owner_user_id: params.ownerUserId });
  const normalizedBook = normalizeBook(params.book);
  const requestedNotional = await estimateNotionalMXN(params);

  if (riskSetting) {
    const allowedPairs = String(riskSetting.allowed_pairs || '')
      .split(',')
      .map((pair: string) => normalizeBook(pair))
      .filter(Boolean);

    if (allowedPairs.length > 0 && !allowedPairs.includes(normalizedBook)) {
      return {
        ok: false,
        code: 'PAIR_NOT_ALLOWED',
        message: 'Selected pair is not allowed by your risk settings.',
        details: { requested_book: normalizedBook, allowed_pairs: allowedPairs },
      };
    }

    const maxTradeAmount = toSafeNumber(riskSetting.max_trade_amount);
    if (maxTradeAmount > 0 && requestedNotional > maxTradeAmount) {
      return {
        ok: false,
        code: 'MAX_TRADE_AMOUNT_EXCEEDED',
        message: 'Requested trade exceeds max trade amount.',
        details: { requested_notional: requestedNotional, max_trade_amount: maxTradeAmount },
      };
    }

    const TradeModel = await getTradeModel();
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setUTCHours(23, 59, 59, 999);

    const todaysTrades = await TradeModel.find({
      owner_user_id: params.ownerUserId,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['submitted', 'filled'] },
    }).select('total_value');

    const todaysNotional = todaysTrades.reduce((sum: number, trade: any) => sum + toSafeNumber(trade.total_value), 0);
    const dailyLimit = toSafeNumber(riskSetting.daily_limit);

    if (dailyLimit > 0 && todaysNotional + requestedNotional > dailyLimit) {
      return {
        ok: false,
        code: 'DAILY_LIMIT_EXCEEDED',
        message: 'Requested trade exceeds your daily limit.',
        details: {
          todays_notional: todaysNotional,
          requested_notional: requestedNotional,
          projected_notional: todaysNotional + requestedNotional,
          daily_limit: dailyLimit,
        },
      };
    }
  }

  const balancesResult = await fetchBitsoBalances(params.apiKey, params.apiSecret);
  if (!balancesResult.success) {
    return {
      ok: false,
      code: 'BALANCE_FETCH_FAILED',
      message: balancesResult.error?.message || 'Failed to fetch balances from Bitso.',
      details: { adapter_status: balancesResult.status, adapter_error: balancesResult.error },
    };
  }

  const { base, quote } = splitCurrenciesFromBook(params.book);
  const major = toSafeNumber(params.major);
  const notional = requestedNotional;

  const findAvailable = (currency: string) => {
    const match = balancesResult.balances.find((entry) => entry.currency.toLowerCase() === currency.toLowerCase());
    return toSafeNumber(match?.available ?? 0);
  };

  if (params.side === 'buy') {
    const quoteAvailable = findAvailable(quote);
    if (notional > 0 && quoteAvailable < notional) {
      return {
        ok: false,
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient ${quote.toUpperCase()} balance for buy order.`,
        details: { currency: quote, available: quoteAvailable, required: notional },
      };
    }
  }

  if (params.side === 'sell') {
    const baseAvailable = findAvailable(base);
    if (major > 0 && baseAvailable < major) {
      return {
        ok: false,
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient ${base.toUpperCase()} balance for sell order.`,
        details: { currency: base, available: baseAvailable, required: major },
      };
    }
  }

  return { ok: true, details: { requested_notional: requestedNotional } };
}

async function submitOrderWithRetry(params: {
  apiKey: string;
  apiSecret: string;
  orderPayload: { book: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; major?: string; minor?: string; price?: string };
  idempotencyKey: string;
  maxAttempts?: number;
}) {
  const maxAttempts = params.maxAttempts ?? 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();

    try {
      const result = await submitBitsoOrder(params.apiKey, params.apiSecret, params.orderPayload);
      const latencyMs = Date.now() - startedAt;

      makeAuditLog('bitso_order_submit', {
        idempotency_key: params.idempotencyKey,
        attempt,
        request: {
          book: params.orderPayload.book,
          side: params.orderPayload.side,
          type: params.orderPayload.type,
          has_major: Boolean(params.orderPayload.major),
          has_minor: Boolean(params.orderPayload.minor),
          has_price: Boolean(params.orderPayload.price),
        },
        response_status: result.status,
        response_success: result.success,
        response_error_code: result.error?.code,
        latency_ms: latencyMs,
      });

      if (result.success) return result;

      const transient = result.status >= 500;
      if (!transient || attempt === maxAttempts) return result;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      makeAuditLog('bitso_order_submit_exception', {
        idempotency_key: params.idempotencyKey,
        attempt,
        latency_ms: latencyMs,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });

      if (attempt === maxAttempts) {
        throw error;
      }
    }

    const backoffMs = 300 * 2 ** (attempt - 1);
    await sleep(backoffMs);
  }

  return {
    status: 500,
    success: false,
    error: {
      code: 'ORDER_RETRY_EXHAUSTED',
      message: 'Order submission retries exhausted.',
    },
  };
}

export async function executeApprovedRecommendation(ownerUserId: string, input: ExecuteRecommendationInput) {
  const recommendation = input.recommendation;
  if (recommendation.status !== 'approved') {
    throw new Error('Only approved recommendations can be executed.');
  }

  if (recommendation.signal === 'HOLD') {
    throw new Error('Cannot execute HOLD recommendation.');
  }

  const side = recommendation.signal === 'BUY' ? 'buy' : 'sell';
  const orderType = input.execution.type ?? 'market';
  const normalizedBook = normalizeBook(recommendation.pair);
  const idempotencyKey = input.idempotency_key || `exec-${Date.now()}-${crypto.randomUUID()}`;

  await migratePlaintextBitsoSecrets({ ownerUserIdForBackfill: ownerUserId });
  const CredentialModel = await getBitsoCredentialModel();
  const credential = await CredentialModel.findOne({ owner_user_id: ownerUserId });
  if (!credential) {
    throw new Error('No Bitso API credentials configured.');
  }

  const apiSecret = decryptSecret({
    ciphertext: credential.encrypted_api_secret_ciphertext,
    iv: credential.encrypted_api_secret_iv,
    tag: credential.encrypted_api_secret_tag,
  });

  const TradeModel = await getTradeModel();
  const existing = await TradeModel.findOne({ owner_user_id: ownerUserId, idempotency_key: idempotencyKey });
  if (existing) {
    return {
      success: true,
      idempotent_replay: true,
      idempotency_key: idempotencyKey,
      trade: existing,
    };
  }

  let tradeDoc: any;
  try {
    tradeDoc = await TradeModel.create({
      owner_user_id: ownerUserId,
      signal_id: recommendation.signal_id || '',
      pair: normalizedBook,
      side,
      amount: input.execution.amount_major || '',
      price: input.execution.price || recommendation.recommended_entry_price || '',
      total_value: input.execution.amount_minor || '',
      stop_loss_price: recommendation.stop_loss_price || '',
      take_profit_price: recommendation.recommended_exit_price || '',
      status: 'pending',
      result_status: 'pending',
      risk_check_details: 'Execution started and pending risk/balance validation.',
      idempotency_key: idempotencyKey,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const duplicate = await TradeModel.findOne({ owner_user_id: ownerUserId, idempotency_key: idempotencyKey });
      if (duplicate) {
        return {
          success: true,
          idempotent_replay: true,
          idempotency_key: idempotencyKey,
          trade: duplicate,
        };
      }
    }
    throw error;
  }

  const riskCheck = await validateRiskAndBalance({
    ownerUserId,
    apiKey: credential.api_key,
    apiSecret,
    book: normalizedBook,
    side,
    type: orderType,
    major: input.execution.amount_major,
    minor: input.execution.amount_minor,
    price: input.execution.price,
  });

  if (!riskCheck.ok) {
    tradeDoc.status = 'failed';
    tradeDoc.result_status = 'failed';
    tradeDoc.risk_check_details = `${riskCheck.code}: ${riskCheck.message}`;
    await tradeDoc.save();

    return {
      success: false,
      idempotency_key: idempotencyKey,
      risk_violation_code: riskCheck.code,
      error: riskCheck.message,
      details: riskCheck.details,
      trade: tradeDoc,
    };
  }

  const orderPayload = {
    book: normalizedBook,
    side,
    type: orderType,
    ...(input.execution.amount_major ? { major: input.execution.amount_major } : {}),
    ...(input.execution.amount_minor ? { minor: input.execution.amount_minor } : {}),
    ...(input.execution.price && orderType === 'limit' ? { price: input.execution.price } : {}),
  };

  tradeDoc.status = 'submitted';
  tradeDoc.result_status = 'submitted';
  tradeDoc.risk_check_details = 'Risk and balance checks passed. Order submitted to Bitso.';
  await tradeDoc.save();

  const orderResult = await submitOrderWithRetry({
    apiKey: credential.api_key,
    apiSecret,
    orderPayload,
    idempotencyKey,
  });

  if (!orderResult.success) {
    tradeDoc.status = 'failed';
    tradeDoc.result_status = 'failed';
    tradeDoc.risk_check_details = `Bitso order failed: ${orderResult.error?.message || 'Unknown error'}`;
    await tradeDoc.save();

    return {
      success: false,
      idempotency_key: idempotencyKey,
      error: orderResult.error?.message || 'Bitso order failed',
      bitso_error: orderResult.error,
      trade: tradeDoc,
    };
  }

  const payload = orderResult.payload || {};
  const bitsoOrderId = String(payload.oid || '');

  tradeDoc.status = 'filled';
  tradeDoc.result_status = 'filled';
  tradeDoc.bitso_order_id = bitsoOrderId;
  tradeDoc.order_ids = {
    ...(tradeDoc.order_ids || {}),
    bitso_order_id: bitsoOrderId,
  };
  tradeDoc.total_value = tradeDoc.total_value || input.execution.amount_minor || '';
  tradeDoc.price = tradeDoc.price || payload.price || recommendation.recommended_entry_price || '';
  tradeDoc.risk_check_details = 'Order accepted by Bitso and marked filled by execution service.';
  await tradeDoc.save();

  return {
    success: true,
    idempotency_key: idempotencyKey,
    data: {
      oid: bitsoOrderId,
      book: payload.book || normalizedBook,
      side: payload.side || side,
      price: payload.price || tradeDoc.price,
      major: tradeDoc.amount,
      minor: tradeDoc.total_value,
    },
    trade: tradeDoc,
  };
}
