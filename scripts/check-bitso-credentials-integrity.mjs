#!/usr/bin/env node
import mongoose from 'mongoose';

function getMongoUri() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!uri) {
    throw new Error('Missing MONGODB_URI or MONGO_URL environment variable.');
  }
  return uri;
}

async function main() {
  const uri = getMongoUri();
  await mongoose.connect(uri, { bufferCommands: false });

  const collection = mongoose.connection.db.collection('bitsocredentials');
  const plaintextFilter = {
    $or: [{ api_secret: { $exists: true, $ne: '' } }, { api_key: { $exists: true, $ne: '' } }],
  };

  const remainingPlaintextCount = await collection.countDocuments(plaintextFilter);

  console.log(`[bitso-credentials-integrity] plaintext_bitso_credential_docs=${remainingPlaintextCount}`);

  await mongoose.disconnect();

  if (remainingPlaintextCount > 0) {
    console.error('[bitso-credentials-integrity] failed: documents still contain plaintext api credentials');
    process.exit(1);
  }

  console.log('[bitso-credentials-integrity] pass: no plaintext api credentials found');
}

main().catch(async (error) => {
  console.error('[bitso-credentials-integrity] failed:', error);
  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }
  process.exit(1);
});
