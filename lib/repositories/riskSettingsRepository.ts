import getRiskSettingModel from '@/models/RiskSetting';

export async function listRiskSettingsByUser(userId: string) {
  const Model = await getRiskSettingModel();
  return Model.find({ owner_user_id: userId }).sort({ createdAt: -1 });
}

export async function createRiskSettings(userId: string, payload: Record<string, unknown>) {
  const Model = await getRiskSettingModel();
  return Model.create({ ...payload, owner_user_id: userId });
}

export async function updateRiskSettings(userId: string, id: string, payload: Record<string, unknown>) {
  const Model = await getRiskSettingModel();
  return Model.findOneAndUpdate({ _id: id, owner_user_id: userId }, payload, { new: true });
}

export async function findActiveRiskSettings(userId: string) {
  const Model = await getRiskSettingModel();
  return Model.findOne({ owner_user_id: userId }).sort({ createdAt: -1 });
}
