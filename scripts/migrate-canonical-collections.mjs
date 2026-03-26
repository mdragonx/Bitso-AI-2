#!/usr/bin/env node
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

if (!MONGODB_URI) {
  console.error('[collection-migration] missing MONGODB_URI or MONGO_URL');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

const COLLECTIONS = [
  {
    logicalName: 'RiskSetting',
    canonical: 'risk_settings',
    variants: ['risksettings', 'RiskSetting', 'riskSettings'],
    getDedupKey: (doc) => {
      const owner = doc.owner_user_id || 'anonymous';
      const created = doc.createdAt || doc.created_at || doc.updatedAt || doc.updated_at || doc._id;
      return `${owner}::${String(created)}`;
    },
  },
  {
    logicalName: 'TradeSignal',
    canonical: 'trade_signals',
    variants: ['tradesignals', 'TradeSignal', 'tradeSignals'],
    getDedupKey: (doc) => {
      const owner = doc.owner_user_id || 'anonymous';
      const pair = doc.pair || 'unknown_pair';
      const signalType = doc.signal_type || 'unknown_signal';
      const created = doc.createdAt || doc.created_at || doc.updatedAt || doc.updated_at || doc._id;
      return `${owner}::${pair}::${signalType}::${String(created)}`;
    },
  },
];

function getSortTimestamp(doc) {
  const candidates = [doc.updatedAt, doc.updated_at, doc.createdAt, doc.created_at];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ts = new Date(candidate).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

function deduplicateDocs(docs, getDedupKey) {
  const deduped = new Map();
  let duplicateCount = 0;

  for (const doc of docs) {
    const key = getDedupKey(doc);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, doc);
      continue;
    }

    duplicateCount += 1;
    const existingTimestamp = getSortTimestamp(existing);
    const incomingTimestamp = getSortTimestamp(doc);

    if (incomingTimestamp >= existingTimestamp) {
      deduped.set(key, doc);
    }
  }

  return {
    docs: [...deduped.values()],
    duplicateCount,
  };
}

async function migrateCollection(db, config) {
  const existingCollections = await db.listCollections({}, { nameOnly: true }).toArray();
  const existingNames = new Set(existingCollections.map((collection) => collection.name));

  const sources = [config.canonical, ...config.variants].filter((name) => existingNames.has(name));

  if (sources.length === 0) {
    console.log(`[collection-migration] ${config.logicalName}: no source collections found, skipping`);
    return {
      logicalName: config.logicalName,
      sources: [],
      loaded: 0,
      deduplicated: 0,
      duplicatesRemoved: 0,
      written: 0,
    };
  }

  const docs = [];
  for (const sourceName of sources) {
    const sourceDocs = await db.collection(sourceName).find({}).toArray();
    docs.push(...sourceDocs);
  }

  const { docs: deduplicatedDocs, duplicateCount } = deduplicateDocs(docs, config.getDedupKey);

  if (!dryRun) {
    await db.collection(config.canonical).deleteMany({});
    if (deduplicatedDocs.length > 0) {
      await db.collection(config.canonical).insertMany(deduplicatedDocs, { ordered: false });
    }

    for (const sourceName of config.variants) {
      if (existingNames.has(sourceName)) {
        await db.collection(sourceName).drop();
      }
    }
  }

  console.log(
    `[collection-migration] ${config.logicalName}: sources=${sources.join(',')} loaded=${docs.length} deduplicated=${deduplicatedDocs.length} duplicates_removed=${duplicateCount} mode=${dryRun ? 'dry-run' : 'apply'}`
  );

  return {
    logicalName: config.logicalName,
    sources,
    loaded: docs.length,
    deduplicated: deduplicatedDocs.length,
    duplicatesRemoved: duplicateCount,
    written: deduplicatedDocs.length,
  };
}

async function main() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;

  const summaries = [];
  for (const config of COLLECTIONS) {
    // eslint-disable-next-line no-await-in-loop
    const summary = await migrateCollection(db, config);
    summaries.push(summary);
  }

  const totals = summaries.reduce(
    (acc, item) => {
      acc.loaded += item.loaded;
      acc.deduplicated += item.deduplicated;
      acc.duplicatesRemoved += item.duplicatesRemoved;
      return acc;
    },
    { loaded: 0, deduplicated: 0, duplicatesRemoved: 0 }
  );

  console.log(
    `[collection-migration] complete: collections=${summaries.length} loaded=${totals.loaded} deduplicated=${totals.deduplicated} duplicates_removed=${totals.duplicatesRemoved} mode=${dryRun ? 'dry-run' : 'apply'}`
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[collection-migration] failed', error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
