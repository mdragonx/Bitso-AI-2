import { initDB, createModel } from 'lyzr-architect';

let _model: any = null;

export default async function getTradeModel() {
  if (!_model) {
    await initDB();
    _model = createModel('Trade', {
      signal_id: { type: String, default: '' },
      pair: { type: String, required: true },
      side: { type: String, enum: ['buy', 'sell'], required: true },
      amount: { type: String, default: '' },
      price: { type: String, default: '' },
      total_value: { type: String, default: '' },
      bitso_order_id: { type: String, default: '' },
      result_status: { type: String, default: '' },
      risk_check_details: { type: String, default: '' },
    });
  }
  return _model;
}
