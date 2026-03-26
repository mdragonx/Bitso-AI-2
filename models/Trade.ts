import { model, models, Schema } from 'mongoose';
import connectToDatabase from '../lib/mongodb';

const TradeSchema = new Schema(
  {
    signal_id: { type: String, default: '' },
    pair: { type: String, required: true },
    side: { type: String, enum: ['buy', 'sell'], required: true },
    amount: { type: String, default: '' },
    price: { type: String, default: '' },
    total_value: { type: String, default: '' },
    bitso_order_id: { type: String, default: '' },
    order_ids: {
      bitso_order_id: { type: String, default: '' },
      client_order_id: { type: String, default: '' },
      exchange_order_id: { type: String, default: '' },
    },
    status: { type: String, enum: ['pending', 'submitted', 'filled', 'failed', 'cancelled'], default: 'pending' },
    result_status: { type: String, default: '' },
    risk_check_details: { type: String, default: '' },
    stop_loss_price: { type: String, default: '' },
    take_profit_price: { type: String, default: '' },
    owner_user_id: { type: String, default: '' },
    idempotency_key: { type: String, default: '', index: true },
  },
  { timestamps: true, collection: 'trades' }
);

TradeSchema.pre('validate', function syncOrderFields(next) {
  this.order_ids = this.order_ids || {};
  if (!this.order_ids.bitso_order_id && this.bitso_order_id) {
    this.order_ids.bitso_order_id = this.bitso_order_id;
  }
  if (!this.bitso_order_id && this.order_ids.bitso_order_id) {
    this.bitso_order_id = this.order_ids.bitso_order_id;
  }
  if (!this.status && this.result_status) {
    this.status = this.result_status;
  }
  if (!this.result_status && this.status) {
    this.result_status = this.status;
  }
  next();
});

TradeSchema.index({ owner_user_id: 1, idempotency_key: 1 }, { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string', $ne: '' } } });
TradeSchema.index({ owner_user_id: 1, createdAt: -1 });
TradeSchema.index({ owner_user_id: 1, status: 1, pair: 1, createdAt: -1 });

export default async function getTradeModel() {
  await connectToDatabase();
  return models.Trade || model('Trade', TradeSchema);
}
