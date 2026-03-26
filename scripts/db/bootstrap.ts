import connectToDatabase from '../../lib/mongodb';
import getBitsoCredentialModel from '../../models/BitsoCredential';
import getRiskSettingModel from '../../models/RiskSetting';
import getSchemaMigrationModel from '../../models/SchemaMigration';
import getTradeModel from '../../models/Trade';
import getTradeSignalModel from '../../models/TradeSignal';
import getUserModel from '../../models/User';

const MIGRATION_IDS = [
  '2026-03-26.bootstrap.touch-core-model-collections.v1',
  '2026-03-26.bootstrap.sync-core-model-indexes.v1',
] as const;

type ActiveModelLoader = {
  name: string;
  load: () => Promise<any>;
};

const ACTIVE_MODELS: ActiveModelLoader[] = [
  { name: 'User', load: getUserModel },
  { name: 'BitsoCredential', load: getBitsoCredentialModel },
  { name: 'RiskSetting', load: getRiskSettingModel },
  { name: 'TradeSignal', load: getTradeSignalModel },
  { name: 'Trade', load: getTradeModel },
];

async function ensureCollectionAndIndexes({ name, load }: ActiveModelLoader) {
  const model = await load();

  try {
    await model.createCollection();
    console.log(`[db-bootstrap] created collection for ${name}: ${model.collection.collectionName}`);
  } catch (error: any) {
    if (error?.codeName !== 'NamespaceExists') {
      throw error;
    }
    console.log(`[db-bootstrap] collection already exists for ${name}: ${model.collection.collectionName}`);
  }

  const syncedIndexes = await model.syncIndexes();
  console.log(`[db-bootstrap] synced indexes for ${name}: ${JSON.stringify(syncedIndexes)}`);

  return model.collection.collectionName;
}

async function recordMigrations() {
  const SchemaMigration = await getSchemaMigrationModel();

  try {
    await SchemaMigration.createCollection();
  } catch (error: any) {
    if (error?.codeName !== 'NamespaceExists') {
      throw error;
    }
  }

  await SchemaMigration.syncIndexes();

  for (const migrationId of MIGRATION_IDS) {
    await SchemaMigration.updateOne(
      { migration_id: migrationId },
      {
        $setOnInsert: {
          migration_id: migrationId,
          runner: 'scripts/db/bootstrap.ts',
          applied_at: new Date(),
        },
      },
      { upsert: true }
    );
  }

  console.log(`[db-bootstrap] recorded migration ids: ${MIGRATION_IDS.join(', ')}`);
}

async function run() {
  await connectToDatabase();

  const touchedCollections: string[] = [];
  for (const model of ACTIVE_MODELS) {
    const collectionName = await ensureCollectionAndIndexes(model);
    touchedCollections.push(collectionName);
  }

  await recordMigrations();

  console.log(`[db-bootstrap] completed successfully. Collections touched: ${touchedCollections.join(', ')}`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[db-bootstrap] failed:', error);
    process.exit(1);
  });
