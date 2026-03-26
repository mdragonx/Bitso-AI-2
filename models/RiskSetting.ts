import { model, models, Schema } from 'mongoose';
import connectToDatabase from '../lib/mongodb';

const RiskSettingSchema = new Schema(
  {
    max_trade_amount: { type: Number, default: 1000 },
    daily_limit: { type: Number, default: 5000 },
    stop_loss_pct: { type: Number, default: 5 },
    allowed_pairs: { type: String, default: 'BTC/MXN,ETH/MXN,XRP/MXN,LTC/MXN' },
    behavioral_position: { type: String, default: 'moderate' },
    fee_tier: { type: String, default: 'starter' },
    owner_user_id: { type: String, default: '' },
  },
  {
    timestamps: true,
    collection: 'risk_settings',
  }
);

export default async function getRiskSettingModel() {
  await connectToDatabase();
  return models.RiskSetting || model('RiskSetting', RiskSettingSchema);
}
