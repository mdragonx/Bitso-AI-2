import getBitsoCredentialModel from '@/models/BitsoCredential';
import getTradeModel from '@/models/Trade';
import getTradeSignalModel from '@/models/TradeSignal';
import getRiskSettingModel from '@/models/RiskSetting';

export async function migrateAndSeedCollections(userId: string) {
  const [BitsoCredential, Trade, TradeSignal, RiskSetting] = await Promise.all([
    getBitsoCredentialModel(),
    getTradeModel(),
    getTradeSignalModel(),
    getRiskSettingModel(),
  ]);

  await Promise.all([
    BitsoCredential.updateMany({ owner_user_id: { $in: [null, ''] } }, { $set: { owner_user_id: userId } }),
    Trade.updateMany({ owner_user_id: { $in: [null, ''] } }, { $set: { owner_user_id: userId } }),
    TradeSignal.updateMany({ owner_user_id: { $in: [null, ''] } }, { $set: { owner_user_id: userId } }),
    RiskSetting.updateMany({ owner_user_id: { $in: [null, ''] } }, { $set: { owner_user_id: userId } }),
  ]);

  const hasRiskSettings = await RiskSetting.exists({ owner_user_id: userId });
  if (!hasRiskSettings) {
    await RiskSetting.create({ owner_user_id: userId });
  }
}
