import getTradeSignalModel from '@/models/TradeSignal';

export async function listTradeSignalsByUser(userId: string) {
  const Model = await getTradeSignalModel();
  return Model.find({ owner_user_id: userId }).sort({ createdAt: -1 });
}

export async function createTradeSignal(userId: string, payload: Record<string, unknown>) {
  const Model = await getTradeSignalModel();
  return Model.create({ ...payload, owner_user_id: userId });
}

export async function updateTradeSignal(userId: string, id: string, payload: Record<string, unknown>) {
  const Model = await getTradeSignalModel();
  return Model.findOneAndUpdate({ _id: id, owner_user_id: userId }, payload, { new: true });
}

export async function deleteTradeSignal(userId: string, id: string) {
  const Model = await getTradeSignalModel();
  return Model.findOneAndDelete({ _id: id, owner_user_id: userId });
}
