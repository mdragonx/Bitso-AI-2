import { model, models, Schema } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';

const TradeSchema = new Schema(
  {
    signal_id: { type: String, default: '' },
    pair: { type: String, required: true },
    side: { type: String, enum: ['buy', 'sell'], required: true },
    amount: { type: String, default: '' },
    price: { type: String, default: '' },
    total_value: { type: String, default: '' },
    bitso_order_id: { type: String, default: '' },
    result_status: { type: String, default: '' },
    risk_check_details: { type: String, default: '' },
    owner_user_id: { type: String, default: '' },
  },
  { timestamps: true }
);

export default async function getTradeModel() {
  await connectToDatabase();
  return models.Trade || model('Trade', TradeSchema);
}
