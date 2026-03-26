import connectToDatabase from '../../lib/mongodb';
import getBitsoCredentialModel from '../../models/BitsoCredential';
import getRiskSettingModel from '../../models/RiskSetting';
import getScheduleExecutionModel from '../../models/ScheduleExecution';
import getScheduleModel from '../../models/Schedule';
import getSchedulerAuditEventModel from '../../models/SchedulerAuditEvent';
import getSchemaMigrationModel from '../../models/SchemaMigration';
import getTradeModel from '../../models/Trade';
import getTradeSignalModel from '../../models/TradeSignal';
import getUploadedAssetModel from '../../models/UploadedAsset';
import getUserModel from '../../models/User';

const MIGRATION_IDS = [
  '2026-03-26.bootstrap.touch-core-model-collections.v1',
  '2026-03-26.bootstrap.sync-core-model-indexes.v1',
  '2026-03-26.bootstrap.feature-aware-collections-and-readiness.v1',
  '2026-03-26.bootstrap.trading-models-crud-and-indexes.v2',
] as const;

type ActiveModelLoader = {
  name: string;
  load: () => Promise<any>;
};

function parseFeatureFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return true;
  }
  return value.toLowerCase() !== 'false';
}

const schedulerEnabled = parseFeatureFlag(process.env.ENABLE_SCHEDULER);
const uploadEnabled = parseFeatureFlag(process.env.ENABLE_UPLOAD);
const ragEnabled = parseFeatureFlag(process.env.ENABLE_RAG);
const uploadCollectionsEnabled = uploadEnabled || ragEnabled;

const CORE_MODELS: ActiveModelLoader[] = [
  { name: 'User', load: getUserModel },
  { name: 'BitsoCredential', load: getBitsoCredentialModel },
  { name: 'RiskSetting', load: getRiskSettingModel },
  { name: 'TradeSignal', load: getTradeSignalModel },
  { name: 'Trade', load: getTradeModel },
];

const SCHEDULER_MODELS: ActiveModelLoader[] = [
  { name: 'Schedule', load: getScheduleModel },
  { name: 'ScheduleExecution', load: getScheduleExecutionModel },
  { name: 'SchedulerAuditEvent', load: getSchedulerAuditEventModel },
];

const UPLOAD_MODELS: ActiveModelLoader[] = [{ name: 'UploadedAsset', load: getUploadedAssetModel }];

function getActiveModels(): ActiveModelLoader[] {
  const models = [...CORE_MODELS];

  if (schedulerEnabled) {
    models.push(...SCHEDULER_MODELS);
  }

  if (uploadCollectionsEnabled) {
    models.push(...UPLOAD_MODELS);
  }

  return models;
}

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

  const activeModels = getActiveModels();
  console.log(
    `[db-bootstrap] feature gates => scheduler=${schedulerEnabled}, upload=${uploadEnabled}, rag=${ragEnabled}, uploadCollections=${uploadCollectionsEnabled}`
  );

  const touchedCollections: string[] = [];
  for (const model of activeModels) {
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
