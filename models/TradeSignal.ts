import { model, models, Schema } from 'mongoose';
import connectToDatabase from '../lib/mongodb';

const TradeSignalSchema = new Schema(
  {
    pair: { type: String, required: true },
    signal: { type: String, enum: ['BUY', 'SELL', 'HOLD'], required: true },
    signal_type: { type: String, enum: ['BUY', 'SELL', 'HOLD'], required: true },
    confidence: { type: Number, required: true },
    indicators_snapshot: { type: Object, default: {} },
    indicators: { type: Object, default: {} },
    market_context: { type: Schema.Types.Mixed, default: {} },
    risk_assessment: { type: String, default: '' },
    reasoning: { type: String, default: '' },
    recommended_entry_price: { type: String, default: '' },
    recommended_exit_price: { type: String, default: '' },
    stop_loss_price: { type: String, default: '' },
    position_size_suggestion: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    owner_user_id: { type: String, default: '' },
  },
  {
    timestamps: true,
    collection: 'trade_signals',
  }
);

TradeSignalSchema.pre('validate', function syncSignalFields(next) {
  if (!this.signal && this.signal_type) {
    this.signal = this.signal_type;
  }
  if (!this.signal_type && this.signal) {
    this.signal_type = this.signal;
  }
  if (!this.indicators_snapshot && this.indicators) {
    this.indicators_snapshot = this.indicators;
  }
  if (!this.indicators && this.indicators_snapshot) {
    this.indicators = this.indicators_snapshot;
  }
  next();
});

TradeSignalSchema.index({ owner_user_id: 1, createdAt: -1 });
TradeSignalSchema.index({ owner_user_id: 1, status: 1, pair: 1, createdAt: -1 });

export default async function getTradeSignalModel() {
  await connectToDatabase();
  return models.TradeSignal || model('TradeSignal', TradeSignalSchema);
}
