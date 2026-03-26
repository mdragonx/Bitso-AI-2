import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

if (!MONGODB_URI) {
  throw new Error('Please define MONGODB_URI or MONGO_URL in environment variables.');
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: MongooseCache | undefined;
  // eslint-disable-next-line no-var
  var _collectionNamingDriftLogged: boolean | undefined;
}

const cache: MongooseCache = global._mongooseCache || { conn: null, promise: null };

if (!global._mongooseCache) {
  global._mongooseCache = cache;
}

const COLLECTION_NAME_VARIANTS = [
  {
    logicalModel: 'RiskSetting',
    canonical: 'risk_settings',
    variants: ['risksettings', 'RiskSetting', 'riskSettings'],
  },
  {
    logicalModel: 'TradeSignal',
    canonical: 'trade_signals',
    variants: ['tradesignals', 'TradeSignal', 'tradeSignals'],
  },
];

async function logCollectionNamingDrift(connection: typeof mongoose) {
  if (global._collectionNamingDriftLogged) {
    return;
  }

  global._collectionNamingDriftLogged = true;

  try {
    const existingCollections = await connection.connection.db
      .listCollections({}, { nameOnly: true })
      .toArray();
    const existingNames = new Set(existingCollections.map((collection) => collection.name));

    for (const config of COLLECTION_NAME_VARIANTS) {
      const hasCanonical = existingNames.has(config.canonical);
      const presentVariants = config.variants.filter((name) => existingNames.has(name));

      if (hasCanonical && presentVariants.length > 0) {
        console.warn(
          `[db-health] collection naming drift detected for ${config.logicalModel}: canonical=${config.canonical}, variants=${presentVariants.join(', ')}. Run scripts/migrate-canonical-collections.mjs to merge and deduplicate data.`
        );
      }
    }
  } catch (error) {
    console.warn('[db-health] unable to check collection naming drift at startup:', error);
  }
}

export default async function connectToDatabase() {
  if (cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI as string, {
      bufferCommands: false,
    });
  }

  cache.conn = await cache.promise;
  await logCollectionNamingDrift(cache.conn);
  return cache.conn;
}
