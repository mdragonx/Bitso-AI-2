import getTradeModel from '@/models/Trade';

type TradeFilters = {
  status?: string;
  pair?: string;
  from?: Date;
  to?: Date;
};

export async function listTradesByUser(userId: string, filters: TradeFilters = {}) {
  const Model = await getTradeModel();
  const query: Record<string, unknown> = { owner_user_id: userId };

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.pair) {
    query.pair = filters.pair;
  }

  if (filters.from || filters.to) {
    query.createdAt = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }

  return Model.find(query).sort({ createdAt: -1 });
}

export async function createTrade(userId: string, payload: Record<string, unknown>) {
  const Model = await getTradeModel();
  return Model.create({ ...payload, owner_user_id: userId });
}

export async function findTradeByIdempotencyKey(userId: string, idempotencyKey: string) {
  const Model = await getTradeModel();
  return Model.findOne({ owner_user_id: userId, idempotency_key: idempotencyKey });
}
