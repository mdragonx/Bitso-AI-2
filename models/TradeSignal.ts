import { initDB, createModel } from 'lyzr-architect';

let _model: any = null;

export default async function getTradeSignalModel() {
  if (!_model) {
    await initDB();
    _model = createModel('TradeSignal', {
      pair: { type: String, required: true },
      signal_type: { type: String, enum: ['BUY', 'SELL', 'HOLD'], required: true },
      confidence: { type: Number, required: true },
      indicators: { type: Object, default: {} },
      market_context: { type: String, default: '' },
      risk_assessment: { type: String, default: '' },
      reasoning: { type: String, default: '' },
      recommended_entry_price: { type: String, default: '' },
      recommended_exit_price: { type: String, default: '' },
      stop_loss_price: { type: String, default: '' },
      position_size_suggestion: { type: String, default: '' },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    });
  }
  return _model;
}
