import { model, models, Schema } from 'mongoose';
import connectToDatabase from '../lib/mongodb';

const SchemaMigrationSchema = new Schema(
  {
    migration_id: { type: String, required: true, unique: true },
    runner: { type: String, required: true },
    applied_at: { type: Date, required: true },
  },
  {
    timestamps: false,
    collection: 'schema_migrations',
  }
);

SchemaMigrationSchema.index({ migration_id: 1 }, { unique: true });
SchemaMigrationSchema.index({ applied_at: -1 });

export default async function getSchemaMigrationModel() {
  await connectToDatabase();
  return models.SchemaMigration || model('SchemaMigration', SchemaMigrationSchema);
}
