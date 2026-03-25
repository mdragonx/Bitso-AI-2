import { initDB, createModel } from 'lyzr-architect';

let _model: any = null;

export default async function getRiskSettingModel() {
  if (!_model) {
    await initDB();
    _model = createModel('RiskSetting', {
      max_trade_amount: { type: Number, default: 1000 },
      daily_limit: { type: Number, default: 5000 },
      stop_loss_pct: { type: Number, default: 5 },
      allowed_pairs: { type: String, default: 'BTC/MXN,ETH/MXN,XRP/MXN,LTC/MXN' },
    });
  }
  return _model;
}
