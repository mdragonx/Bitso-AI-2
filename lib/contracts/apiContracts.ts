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

export const apiEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    error_code: z.string().optional(),
  });

export const analysisTriggerRequestSchema = z.object({
  message: z.string().trim().min(1),
  agent_id: z.string().trim().min(1),
  assets: z.array(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const analysisTriggerResponseSchema = z.object({
  success: z.boolean(),
  response: z.object({
    status: z.enum(['success', 'error']),
    result: z.record(z.unknown()),
    message: z.string().optional(),
  }),
  module_outputs: z.record(z.unknown()).optional(),
  timestamp: z.string().optional(),
  error: z.string().optional(),
  details: z.unknown().optional(),
});

export const recommendationRecordSchema = z
  .object({
    _id: z.string().optional(),
    pair: z.string(),
    signal: z.enum(['BUY', 'SELL', 'HOLD']).optional(),
    signal_type: z.enum(['BUY', 'SELL', 'HOLD']).optional(),
    confidence: z.number().min(0).max(100).optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
  })
  .passthrough();

export const recommendationListResponseSchema = apiEnvelopeSchema(z.array(recommendationRecordSchema));

export const tradeExecutionRequestSchema = z.object({
  recommendation: z.object({
    signal_id: z.string().optional(),
    pair: z.string().min(3),
    signal: z.enum(['BUY', 'SELL', 'HOLD']),
    status: z.enum(['approved', 'pending', 'rejected']),
    recommended_entry_price: z.preprocess(emptyToUndefined, z.string()).optional(),
    stop_loss_price: z.preprocess(emptyToUndefined, z.string()).optional(),
    recommended_exit_price: z.preprocess(emptyToUndefined, z.string()).optional(),
  }),
  execution: z.object({
    amount_major: z.preprocess(emptyToUndefined, z.string()).optional(),
    amount_minor: z.preprocess(emptyToUndefined, z.string()).optional(),
    type: z.enum(['market', 'limit']).optional(),
    price: z.preprocess(emptyToUndefined, z.string()).optional(),
  }),
  idempotency_key: z.preprocess(emptyToUndefined, z.string()).optional(),
});

export const tradeExecutionResponseSchema = apiEnvelopeSchema(
  z
    .object({
      execution_id: z.string().optional(),
      order_id: z.string().optional(),
    })
    .passthrough()
).passthrough();

export const tradeHistoryQuerySchema = z.object({
  status: z.string().optional(),
  pair: normalizedPairSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const tradeRecordSchema = z
  .object({
    _id: z.string().optional(),
    pair: z.string(),
    side: z.enum(['buy', 'sell']),
    status: z.string().optional(),
    idempotency_key: z.string().optional(),
  })
  .passthrough();

export const tradeHistoryResponseSchema = apiEnvelopeSchema(z.array(tradeRecordSchema));

export const riskSettingsPayloadSchema = z
  .object({
    id: z.string().optional(),
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
  .passthrough();

export const riskSettingsResponseSchema = apiEnvelopeSchema(z.unknown());

export const loginRequestSchema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});

export const registerRequestSchema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8),
  name: z.string().trim().max(120).optional().default(''),
});

export const authResponseSchema = apiEnvelopeSchema(
  z.object({
    user: z.object({
      _id: z.string(),
      email: z.string().email(),
      name: z.string().optional(),
    }),
  })
);

export const logoutResponseSchema = apiEnvelopeSchema(z.unknown());
