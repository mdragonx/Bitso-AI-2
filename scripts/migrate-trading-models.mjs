#!/usr/bin/env node
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('[migrate-trading-models] Missing MONGODB_URI');
  process.exit(1);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;

const riskSettings = db.collection('risk_settings');
const duplicates = await riskSettings
  .aggregate([
    { $match: { owner_user_id: { $type: 'string', $ne: '' } } },
    { $sort: { updatedAt: -1, createdAt: -1 } },
    { $group: { _id: '$owner_user_id', ids: { $push: '$_id' }, keep: { $first: '$_id' } } },
    { $project: { remove: { $slice: ['$ids', 1, { $size: '$ids' }] } } },
  ])
  .toArray();

for (const dup of duplicates) {
  if (!dup.remove?.length) continue;
  await riskSettings.deleteMany({ _id: { $in: dup.remove } });
}

await riskSettings.updateMany(
  {},
  [
    {
      $set: {
        allowed_pairs_list: {
          $filter: {
            input: {
              $map: {
                input: { $split: [{ $ifNull: ['$allowed_pairs', ''] }, ','] },
                as: 'pair',
                in: { $toUpper: { $trim: { input: '$$pair' } } },
              },
            },
            as: 'pair',
            cond: { $ne: ['$$pair', ''] },
          },
        },
        take_profit_pct: { $ifNull: ['$take_profit_pct', 12] },
      },
    },
  ]
);

await db.collection('trade_signals').updateMany(
  {},
  [
    {
      $set: {
        signal: { $ifNull: ['$signal', '$signal_type'] },
        signal_type: { $ifNull: ['$signal_type', '$signal'] },
        indicators_snapshot: { $ifNull: ['$indicators_snapshot', '$indicators'] },
      },
    },
  ]
);

await db.collection('trades').updateMany(
  {},
  [
    {
      $set: {
        status: { $ifNull: ['$status', '$result_status'] },
        result_status: { $ifNull: ['$result_status', '$status'] },
        order_ids: {
          bitso_order_id: { $ifNull: ['$order_ids.bitso_order_id', '$bitso_order_id'] },
          client_order_id: { $ifNull: ['$order_ids.client_order_id', ''] },
          exchange_order_id: { $ifNull: ['$order_ids.exchange_order_id', ''] },
        },
      },
    },
  ]
);

console.log('[migrate-trading-models] migration completed');
await mongoose.disconnect();
