#!/usr/bin/env node
import crypto from 'crypto';
import mongoose from 'mongoose';

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run') || argv.includes('-n');
  const ownerArg = argv.find((arg) => arg.startsWith('--owner-user-id='));
  const ownerUserId = ownerArg ? ownerArg.split('=')[1] : '';

  return { dryRun, ownerUserId };
}

function getMongoUri() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!uri) {
    throw new Error('Missing MONGODB_URI or MONGO_URL environment variable.');
  }
  return uri;
}

function getEncryptionKey() {
  const rawKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error('Missing CREDENTIALS_ENCRYPTION_KEY environment variable.');
  }

  const hexCandidate = /^[0-9a-fA-F]{64}$/.test(rawKey.trim()) ? rawKey.trim() : null;
  if (hexCandidate) {
    return Buffer.from(hexCandidate, 'hex');
  }

  const base64Candidate = Buffer.from(rawKey, 'base64');
  if (base64Candidate.length === 32 && base64Candidate.toString('base64') === rawKey) {
    return base64Candidate;
  }

  const utf8Candidate = Buffer.from(rawKey, 'utf8');
  if (utf8Candidate.length === 32) {
    return utf8Candidate;
  }

  throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 32-byte utf8, base64(32-byte), or 64-char hex.');
}

function encryptSecret(secret, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}


async function main() {
  const { dryRun, ownerUserId } = parseArgs(process.argv.slice(2));
  const uri = getMongoUri();
  const encryptionKey = getEncryptionKey();

  console.log(`[bitso-credentials-migration] starting (${dryRun ? 'dry-run' : 'apply'})`);

  await mongoose.connect(uri, { bufferCommands: false });
  const collection = mongoose.connection.db.collection('bitsocredentials');

  let ownerUserIdBackfilled = 0;
  if (ownerUserId) {
    const filter = { owner_user_id: { $in: [null, ''] } };
    if (dryRun) {
      ownerUserIdBackfilled = await collection.countDocuments(filter);
    } else {
      const result = await collection.updateMany(filter, { $set: { owner_user_id: ownerUserId } });
      ownerUserIdBackfilled = result.modifiedCount || 0;
    }
  }

  const filter = {
    $or: [
      {
        api_secret: { $exists: true, $ne: '' },
        encrypted_api_secret_ciphertext: { $in: [null, ''] },
      },
      {
        api_key: { $exists: true, $ne: '' },
        encrypted_api_key_ciphertext: { $in: [null, ''] },
      },
    ],
  };

  let totalScanned = 0;
  let migrated = 0;
  let skippedOrFailed = 0;

  const cursor = collection.find(filter, {
    projection: { _id: 1, api_key: 1, api_secret: 1 },
  });

  for await (const doc of cursor) {
    totalScanned += 1;
    const plaintextSecret = typeof doc.api_secret === 'string' ? doc.api_secret : '';
    const plaintextKey = typeof doc.api_key === 'string' ? doc.api_key : '';

    if (!plaintextSecret && !plaintextKey) {
      skippedOrFailed += 1;
      continue;
    }

    if (dryRun) {
      migrated += 1;
      continue;
    }

    try {
      const encryptedSecret = plaintextSecret ? encryptSecret(plaintextSecret, encryptionKey) : null;
      const encryptedKey = plaintextKey ? encryptSecret(plaintextKey, encryptionKey) : null;
      const result = await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            ...(encryptedSecret
              ? {
                  encrypted_api_secret_ciphertext: encryptedSecret.ciphertext,
                  encrypted_api_secret_iv: encryptedSecret.iv,
                  encrypted_api_secret_tag: encryptedSecret.tag,
                }
              : {}),
            ...(encryptedKey
              ? {
                  encrypted_api_key_ciphertext: encryptedKey.ciphertext,
                  encrypted_api_key_iv: encryptedKey.iv,
                  encrypted_api_key_tag: encryptedKey.tag,
                }
              : {}),
          },
          $unset: {
            ...(plaintextSecret ? { api_secret: '' } : {}),
            ...(plaintextKey ? { api_key: '' } : {}),
          },
        }
      );

      if (result.modifiedCount > 0) {
        migrated += 1;
      } else {
        skippedOrFailed += 1;
      }
    } catch {
      skippedOrFailed += 1;
    }
  }

  console.log(
    `[bitso-credentials-migration] complete: total_scanned=${totalScanned} docs_migrated=${migrated} docs_skipped_or_failed=${skippedOrFailed} owner_user_id_backfilled=${ownerUserIdBackfilled} mode=${dryRun ? 'dry-run' : 'apply'}`
  );

  await mongoose.disconnect();

  if (skippedOrFailed > 0 && !dryRun) {
    process.exitCode = 2;
  }
}

main().catch(async (error) => {
  console.error('[bitso-credentials-migration] failed:', error);
  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }
  process.exit(1);
});
