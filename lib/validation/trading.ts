import { z } from 'zod';

const pairPattern = /^[A-Za-z]{2,10}[\/_][A-Za-z]{2,10}$/;

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const normalizedPairSchema = z
  .string()
  .trim()
  .min(3)
  .regex(pairPattern, 'Pair must use BASE/QUOTE or BASE_QUOTE format')
  .transform((value) => value.replace('/', '_').toLowerCase());

export const createTradeSignalSchema = z
  .object({
    pair: normalizedPairSchema,
    signal: z.enum(['BUY', 'SELL', 'HOLD']).optional(),
    signal_type: z.enum(['BUY', 'SELL', 'HOLD']).optional(),
    confidence: z.number().min(0).max(100),
    indicators_snapshot: z.record(z.unknown()).optional(),
    indicators: z.record(z.unknown()).optional(),
    market_context: z.unknown().optional(),
    risk_assessment: z.string().optional(),
    reasoning: z.string().optional(),
    recommended_entry_price: z.preprocess(emptyToUndefined, z.string()).optional(),
    recommended_exit_price: z.preprocess(emptyToUndefined, z.string()).optional(),
    stop_loss_price: z.preprocess(emptyToUndefined, z.string()).optional(),
    take_profit_price: z.preprocess(emptyToUndefined, z.string()).optional(),
    position_size_suggestion: z.preprocess(emptyToUndefined, z.string()).optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
  })
  .transform((value) => ({
    ...value,
    signal: value.signal ?? value.signal_type,
    signal_type: value.signal_type ?? value.signal,
    indicators_snapshot: value.indicators_snapshot ?? value.indicators ?? {},
    indicators: value.indicators ?? value.indicators_snapshot ?? {},
  }));

export const updateTradeSignalSchema = createTradeSignalSchema.partial();

export const createTradeSchema = z
  .object({
    signal_id: z.string().optional(),
    pair: normalizedPairSchema,
    side: z.enum(['buy', 'sell']),
    amount: z.preprocess(emptyToUndefined, z.string()).optional(),
    price: z.preprocess(emptyToUndefined, z.string()).optional(),
    total_value: z.preprocess(emptyToUndefined, z.string()).optional(),
    bitso_order_id: z.preprocess(emptyToUndefined, z.string()).optional(),
    order_ids: z
      .object({
        bitso_order_id: z.preprocess(emptyToUndefined, z.string()).optional(),
        client_order_id: z.preprocess(emptyToUndefined, z.string()).optional(),
        exchange_order_id: z.preprocess(emptyToUndefined, z.string()).optional(),
      })
      .partial()
      .optional(),
    status: z.enum(['pending', 'submitted', 'filled', 'failed', 'cancelled']).optional(),
    result_status: z.string().optional(),
    risk_check_details: z.string().optional(),
    stop_loss_price: z.preprocess(emptyToUndefined, z.string()).optional(),
    take_profit_price: z.preprocess(emptyToUndefined, z.string()).optional(),
    idempotency_key: z.preprocess(emptyToUndefined, z.string()).optional(),
  })
  .transform((value) => {
    const mergedOrderIds = {
      bitso_order_id: value.order_ids?.bitso_order_id ?? value.bitso_order_id,
      client_order_id: value.order_ids?.client_order_id,
      exchange_order_id: value.order_ids?.exchange_order_id,
    };

    return {
      ...value,
      order_ids: mergedOrderIds,
      bitso_order_id: mergedOrderIds.bitso_order_id,
      status: value.status ?? (value.result_status as any) ?? 'pending',
      result_status: value.result_status ?? value.status ?? 'pending',
    };
  });

export const listTradesQuerySchema = z.object({
  status: z.string().optional(),
  pair: normalizedPairSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const createRiskSettingsSchema = z
  .object({
    max_trade_amount: z.number().nonnegative().optional(),
    daily_limit: z.number().nonnegative().optional(),
    stop_loss_pct: z.number().min(0).max(100).optional(),
    take_profit_pct: z.number().min(0).max(100).optional(),
    allowed_pairs: z.union([z.string(), z.array(z.string())]).optional(),
    allowed_pairs_list: z.array(z.string()).optional(),
    behavioral_position: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
    fee_tier: z.enum(['starter', 'tier1', 'tier2', 'tier3', 'tier4', 'tier5']).optional(),
    cooldown_minutes: z.number().nonnegative().optional(),
    throttle_max_attempts: z.number().int().nonnegative().optional(),
    throttle_window_minutes: z.number().int().positive().optional(),
  })
  .transform((value) => {
    const allowedPairsList = Array.isArray(value.allowed_pairs)
      ? value.allowed_pairs
      : value.allowed_pairs_list ?? String(value.allowed_pairs ?? '').split(',');

    const normalizedList = allowedPairsList
      .map((pair) => String(pair).trim())
      .filter(Boolean)
      .map((pair) => pair.replace('_', '/').toUpperCase());

    return {
      ...value,
      allowed_pairs: normalizedList.join(','),
      allowed_pairs_list: normalizedList,
    };
  });

export const updateRiskSettingsSchema = createRiskSettingsSchema.partial();

export const registerUserSchema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8),
  name: z.string().trim().max(120).optional().default(''),
});

export function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`);
    throw new Error(`Validation failed - ${issues.join('; ')}`);
  }
  return parsed.data;
}
