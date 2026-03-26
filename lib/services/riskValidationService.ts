import getRiskSettingModel from '../../models/RiskSetting';
import getTradeModel from '../../models/Trade';

export type RiskValidationInput = {
  ownerUserId: string;
  book: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  major?: string;
  minor?: string;
  price?: string;
  entryPrice?: string;
  stopLossPrice?: string;
  takeProfitPrice?: string;
};

export type RiskValidationResult =
  | { ok: true; details: Record<string, unknown> }
  | { ok: false; code: string; message: string; details: Record<string, unknown> };

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

async function estimateOrderNotionalMXN(payload: {
  major?: string;
  minor?: string;
  price?: string;
}) {
  const major = toSafeNumber(payload.major);
  const minor = toSafeNumber(payload.minor);
  const price = toSafeNumber(payload.price);

  if (minor > 0) return minor;
  if (major > 0 && price > 0) return major * price;
  return 0;
}

function buildRiskFailure(code: string, message: string, details: Record<string, unknown>): RiskValidationResult {
  return { ok: false, code, message, details };
}

export async function validateExecutionRiskRules(input: RiskValidationInput): Promise<RiskValidationResult> {
  const RiskSettingModel = await getRiskSettingModel();
  const riskSetting = await RiskSettingModel.findOne({ owner_user_id: input.ownerUserId });

  if (!riskSetting) {
    return { ok: true, details: {} };
  }

  const TradeModel = await getTradeModel();
  const normalizedBook = normalizeBook(input.book);
  const requestedNotional = await estimateOrderNotionalMXN({
    major: input.major,
    minor: input.minor,
    price: input.price ?? input.entryPrice,
  });

  const allowedPairs = String(riskSetting.allowed_pairs || '')
    .split(',')
    .map((pair: string) => normalizeBook(pair))
    .filter(Boolean);

  if (allowedPairs.length > 0 && !allowedPairs.includes(normalizedBook)) {
    return buildRiskFailure('PAIR_NOT_ALLOWED', 'Pair is blocked by your allowed pairs list. Update allowed pairs or choose another pair.', {
      requested_book: normalizedBook,
      allowed_pairs: allowedPairs,
    });
  }

  const maxTradeAmount = toSafeNumber(riskSetting.max_trade_amount);
  if (maxTradeAmount > 0 && requestedNotional > maxTradeAmount) {
    return buildRiskFailure('MAX_TRADE_AMOUNT_EXCEEDED', 'Trade amount exceeds your max trade amount. Lower size or raise the configured limit.', {
      requested_notional: requestedNotional,
      max_trade_amount: maxTradeAmount,
    });
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 59, 999);

  const todaysTrades = await TradeModel.find({
    owner_user_id: input.ownerUserId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['submitted', 'filled'] },
  }).select('total_value');

  const todaysNotional = todaysTrades.reduce((sum: number, trade: any) => sum + toSafeNumber(trade.total_value), 0);
  const dailyLimit = toSafeNumber(riskSetting.daily_limit);

  if (dailyLimit > 0 && todaysNotional + requestedNotional > dailyLimit) {
    return buildRiskFailure('DAILY_LIMIT_EXCEEDED', 'Daily transaction cap would be exceeded. Reduce this order or wait until next UTC day.', {
      todays_notional: todaysNotional,
      requested_notional: requestedNotional,
      projected_notional: todaysNotional + requestedNotional,
      daily_limit: dailyLimit,
    });
  }

  const entryPrice = toSafeNumber(input.entryPrice ?? input.price);
  const stopLossPrice = toSafeNumber(input.stopLossPrice);
  const takeProfitPrice = toSafeNumber(input.takeProfitPrice);
  const stopLossPctLimit = toSafeNumber(riskSetting.stop_loss_pct);
  const takeProfitPctLimit = toSafeNumber(riskSetting.take_profit_pct);

  if (entryPrice > 0 && stopLossPrice > 0 && stopLossPctLimit > 0) {
    if (input.side === 'buy') {
      if (stopLossPrice >= entryPrice) {
        return buildRiskFailure('STOP_LOSS_INVALID', 'Stop-loss must be below entry price for BUY positions.', {
          side: input.side,
          entry_price: entryPrice,
          stop_loss_price: stopLossPrice,
        });
      }
      const stopLossPct = ((entryPrice - stopLossPrice) / entryPrice) * 100;
      if (stopLossPct > stopLossPctLimit) {
        return buildRiskFailure('STOP_LOSS_LIMIT_EXCEEDED', `Stop-loss distance exceeds configured max (${stopLossPctLimit}%).`, {
          side: input.side,
          entry_price: entryPrice,
          stop_loss_price: stopLossPrice,
          configured_stop_loss_pct: stopLossPctLimit,
          requested_stop_loss_pct: stopLossPct,
        });
      }
    } else {
      if (stopLossPrice <= entryPrice) {
        return buildRiskFailure('STOP_LOSS_INVALID', 'Stop-loss must be above entry price for SELL positions.', {
          side: input.side,
          entry_price: entryPrice,
          stop_loss_price: stopLossPrice,
        });
      }
      const stopLossPct = ((stopLossPrice - entryPrice) / entryPrice) * 100;
      if (stopLossPct > stopLossPctLimit) {
        return buildRiskFailure('STOP_LOSS_LIMIT_EXCEEDED', `Stop-loss distance exceeds configured max (${stopLossPctLimit}%).`, {
          side: input.side,
          entry_price: entryPrice,
          stop_loss_price: stopLossPrice,
          configured_stop_loss_pct: stopLossPctLimit,
          requested_stop_loss_pct: stopLossPct,
        });
      }
    }
  }

  if (entryPrice > 0 && takeProfitPrice > 0 && takeProfitPctLimit > 0) {
    if (input.side === 'buy') {
      if (takeProfitPrice <= entryPrice) {
        return buildRiskFailure('TAKE_PROFIT_INVALID', 'Take-profit must be above entry price for BUY positions.', {
          side: input.side,
          entry_price: entryPrice,
          take_profit_price: takeProfitPrice,
        });
      }
      const takeProfitPct = ((takeProfitPrice - entryPrice) / entryPrice) * 100;
      if (takeProfitPct > takeProfitPctLimit) {
        return buildRiskFailure('TAKE_PROFIT_LIMIT_EXCEEDED', `Take-profit distance exceeds configured max (${takeProfitPctLimit}%).`, {
          side: input.side,
          entry_price: entryPrice,
          take_profit_price: takeProfitPrice,
          configured_take_profit_pct: takeProfitPctLimit,
          requested_take_profit_pct: takeProfitPct,
        });
      }
    } else {
      if (takeProfitPrice >= entryPrice) {
        return buildRiskFailure('TAKE_PROFIT_INVALID', 'Take-profit must be below entry price for SELL positions.', {
          side: input.side,
          entry_price: entryPrice,
          take_profit_price: takeProfitPrice,
        });
      }
      const takeProfitPct = ((entryPrice - takeProfitPrice) / entryPrice) * 100;
      if (takeProfitPct > takeProfitPctLimit) {
        return buildRiskFailure('TAKE_PROFIT_LIMIT_EXCEEDED', `Take-profit distance exceeds configured max (${takeProfitPctLimit}%).`, {
          side: input.side,
          entry_price: entryPrice,
          take_profit_price: takeProfitPrice,
          configured_take_profit_pct: takeProfitPctLimit,
          requested_take_profit_pct: takeProfitPct,
        });
      }
    }
  }

  const cooldownMinutes = toSafeNumber((riskSetting as any).cooldown_minutes);
  if (cooldownMinutes > 0) {
    const lastTrade = await TradeModel.findOne({ owner_user_id: input.ownerUserId }).sort({ createdAt: -1 }).select('createdAt');
    if (lastTrade?.createdAt) {
      const cooldownMs = cooldownMinutes * 60 * 1000;
      const elapsedMs = Date.now() - new Date(lastTrade.createdAt).getTime();
      if (elapsedMs < cooldownMs) {
        const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        return buildRiskFailure('COOLDOWN_ACTIVE', 'Trading cooldown is active. Retry after cooldown period.', {
          cooldown_minutes: cooldownMinutes,
          retry_after_seconds: retryAfterSeconds,
        });
      }
    }
  }

  const throttleMaxAttempts = toSafeNumber((riskSetting as any).throttle_max_attempts);
  const throttleWindowMinutes = Math.max(1, toSafeNumber((riskSetting as any).throttle_window_minutes) || 1);
  if (throttleMaxAttempts > 0) {
    const windowStart = new Date(Date.now() - throttleWindowMinutes * 60 * 1000);
    const attemptsInWindow = await TradeModel.countDocuments({
      owner_user_id: input.ownerUserId,
      createdAt: { $gte: windowStart },
    });

    if (attemptsInWindow >= throttleMaxAttempts) {
      return buildRiskFailure('THROTTLE_EXCEEDED', 'Too many trade attempts in a short period. Wait before submitting again.', {
        throttle_max_attempts: throttleMaxAttempts,
        throttle_window_minutes: throttleWindowMinutes,
        attempts_in_window: attemptsInWindow,
      });
    }
  }

  return {
    ok: true,
    details: {
      requested_notional: requestedNotional,
      daily_total_before: todaysNotional,
      daily_total_after: todaysNotional + requestedNotional,
    },
  };
}

export async function persistRejectedTradeAttempt(input: {
  ownerUserId: string;
  idempotencyKey?: string;
  signalId?: string;
  pair: string;
  side: 'buy' | 'sell';
  amount?: string;
  price?: string;
  totalValue?: string;
  stopLossPrice?: string;
  takeProfitPrice?: string;
  violationCode: string;
  violationMessage: string;
}) {
  const TradeModel = await getTradeModel();

  const payload = {
    owner_user_id: input.ownerUserId,
    signal_id: input.signalId || '',
    pair: normalizeBook(input.pair),
    side: input.side,
    amount: input.amount || '',
    price: input.price || '',
    total_value: input.totalValue || '',
    stop_loss_price: input.stopLossPrice || '',
    take_profit_price: input.takeProfitPrice || '',
    status: 'failed',
    result_status: 'failed',
    risk_check_details: `${input.violationCode}: ${input.violationMessage}`,
    idempotency_key: input.idempotencyKey || '',
  };

  if (input.idempotencyKey) {
    try {
      return await TradeModel.findOneAndUpdate(
        { owner_user_id: input.ownerUserId, idempotency_key: input.idempotencyKey },
        payload,
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } catch {
      return TradeModel.findOne({ owner_user_id: input.ownerUserId, idempotency_key: input.idempotencyKey });
    }
  }

  return TradeModel.create(payload);
}
