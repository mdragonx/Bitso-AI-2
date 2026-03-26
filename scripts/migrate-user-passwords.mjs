#!/usr/bin/env node
import mongoose from 'mongoose';
import { hashPassword } from '../lib/passwordHash.mjs';

function parseArgs(argv) {
  const flags = new Set(argv);
  return {
    dryRun: flags.has('--dry-run') || flags.has('-n'),
  };
}

function getMongoUri() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!uri) {
    throw new Error('Missing MONGODB_URI or MONGO_URL environment variable.');
  }
  return uri;
}

async function migrateCollection(collection, dryRun) {
  const filter = {
    password: { $type: 'string', $ne: '' },
    $or: [{ password_hash: { $exists: false } }, { password_hash: null }, { password_hash: '' }],
  };

  const total = await collection.countDocuments({});
  const eligible = await collection.countDocuments(filter);

  let updated = 0;
  let skipped = 0;

  if (!dryRun && eligible > 0) {
    const cursor = collection.find(filter, {
      projection: { _id: 1, password: 1, password_hash: 1, email: 1 },
    });

    for await (const doc of cursor) {
      const plaintext = typeof doc.password === 'string' ? doc.password : '';
      if (!plaintext) {
        skipped += 1;
        continue;
      }

      const nextHash = hashPassword(plaintext);
      const result = await collection.updateOne(
        { _id: doc._id },
        {
          $set: { password_hash: nextHash },
          $unset: { password: '' },
        }
      );

      if (result.modifiedCount > 0) {
        updated += 1;
      }
    }
  }

  return {
    name: collection.collectionName,
    total,
    eligible,
    updated,
    skipped,
    mode: dryRun ? 'dry-run' : 'apply',
  };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const uri = getMongoUri();

  console.log(`[password-migration] starting (${dryRun ? 'dry-run' : 'apply'})`);

  await mongoose.connect(uri, { bufferCommands: false });
  const db = mongoose.connection.db;

  const existingCollections = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const candidateNames = ['_users', 'users'];

  const summaries = [];
  for (const name of candidateNames) {
    if (!existingCollections.has(name)) {
      console.log(`[password-migration] collection ${name} not found, skipping`);
      continue;
    }

    const summary = await migrateCollection(db.collection(name), dryRun);
    summaries.push(summary);
    console.log(
      `[password-migration] ${summary.name}: total=${summary.total} eligible=${summary.eligible} updated=${summary.updated} skipped=${summary.skipped} mode=${summary.mode}`
    );
  }

  const totals = summaries.reduce(
    (acc, current) => {
      acc.total += current.total;
      acc.eligible += current.eligible;
      acc.updated += current.updated;
      acc.skipped += current.skipped;
      return acc;
    },
    { total: 0, eligible: 0, updated: 0, skipped: 0 }
  );

  console.log(
    `[password-migration] complete: collections=${summaries.length} total=${totals.total} eligible=${totals.eligible} updated=${totals.updated} skipped=${totals.skipped} mode=${dryRun ? 'dry-run' : 'apply'}`
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[password-migration] failed:', error);
  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }
  process.exit(1);
});
