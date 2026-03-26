import { model, models, Schema } from 'mongoose';
import connectToDatabase from '../lib/mongodb';

const RiskSettingSchema = new Schema(
  {
    max_trade_amount: { type: Number, default: 1000 },
    daily_limit: { type: Number, default: 5000 },
    stop_loss_pct: { type: Number, default: 5 },
    take_profit_pct: { type: Number, default: 12 },
    allowed_pairs: { type: String, default: 'BTC/MXN,ETH/MXN,XRP/MXN,LTC/MXN' },
    allowed_pairs_list: { type: [String], default: ['BTC/MXN', 'ETH/MXN', 'XRP/MXN', 'LTC/MXN'] },
    behavioral_position: { type: String, default: 'moderate' },
    fee_tier: { type: String, default: 'starter' },
    owner_user_id: { type: String, default: '' },
  },
  {
    timestamps: true,
    collection: 'risk_settings',
  }
);

RiskSettingSchema.pre('validate', function syncAllowedPairs(next) {
  if ((!this.allowed_pairs || this.allowed_pairs.length === 0) && Array.isArray(this.allowed_pairs_list)) {
    this.allowed_pairs = this.allowed_pairs_list.join(',');
  }
  if ((!this.allowed_pairs_list || this.allowed_pairs_list.length === 0) && typeof this.allowed_pairs === 'string') {
    this.allowed_pairs_list = this.allowed_pairs
      .split(',')
      .map((pair: string) => pair.trim())
      .filter(Boolean);
  }
  next();
});

RiskSettingSchema.index({ owner_user_id: 1 }, { unique: true, partialFilterExpression: { owner_user_id: { $type: 'string', $ne: '' } } });
RiskSettingSchema.index({ owner_user_id: 1, updatedAt: -1 });

export default async function getRiskSettingModel() {
  await connectToDatabase();
  return models.RiskSetting || model('RiskSetting', RiskSettingSchema);
}
