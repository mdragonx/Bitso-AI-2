import crypto from 'crypto';
import getBitsoCredentialModel from '@/models/BitsoCredential';

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

type MigratePlaintextBitsoSecretsOptions = {
  ownerUserIdForBackfill?: string;
  dryRun?: boolean;
};

type MigratePlaintextBitsoSecretsReport = {
  totalScanned: number;
  migrated: number;
  skippedOrFailed: number;
  ownerUserIdBackfilled: number;
  mode: 'dry-run' | 'apply';
};

let migrationPromise: Promise<MigratePlaintextBitsoSecretsReport> | null = null;

function isDeployedEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' || process.env.NETLIFY === 'true';
}

export function assertCredentialsEncryptionKeyConfigured(): void {
  if (!process.env.CREDENTIALS_ENCRYPTION_KEY && isDeployedEnvironment()) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY is required in deployed environments');
  }
}

function getEncryptionKey(): Buffer {
  const rawKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY is required');
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

  throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 32-byte utf8, base64(32-byte), or 64-char hex');
}

export function encryptSecret(secret: string): EncryptedSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptSecret(encrypted: EncryptedSecret): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(encrypted.iv, 'base64')
  );

  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function maskSecret(secret: string): string {
  return `****${secret.slice(-4)}`;
}

export async function migratePlaintextBitsoSecrets(
  options: MigratePlaintextBitsoSecretsOptions = {}
): Promise<MigratePlaintextBitsoSecretsReport> {
  const runMigration = async (): Promise<MigratePlaintextBitsoSecretsReport> => {
    const Model = await getBitsoCredentialModel();
    const dryRun = Boolean(options.dryRun);

    let ownerUserIdBackfilled = 0;
    if (options.ownerUserIdForBackfill) {
      if (dryRun) {
        ownerUserIdBackfilled = await Model.countDocuments({ owner_user_id: { $in: [null, ''] } });
      } else {
        const backfillResult = await Model.updateMany(
          { owner_user_id: { $in: [null, ''] } },
          { $set: { owner_user_id: options.ownerUserIdForBackfill } }
        );
        ownerUserIdBackfilled = backfillResult.modifiedCount || 0;
      }
    }

    const docs = await Model.find({
      api_secret: { $exists: true, $ne: '' },
      encrypted_api_secret_ciphertext: { $in: [null, ''] },
    }).select('_id api_secret owner_user_id');

    let migrated = 0;
    let skippedOrFailed = 0;

    for (const doc of docs as any[]) {
      const plaintext = String(doc.api_secret || '');
      if (!plaintext) {
        skippedOrFailed += 1;
        continue;
      }

      if (dryRun) {
        migrated += 1;
        continue;
      }

      try {
        const encrypted = encryptSecret(plaintext);
        const result = await Model.updateOne(
          { _id: doc._id },
          {
            $set: {
              encrypted_api_secret_ciphertext: encrypted.ciphertext,
              encrypted_api_secret_iv: encrypted.iv,
              encrypted_api_secret_tag: encrypted.tag,
            },
            $unset: {
              api_secret: 1,
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

    return {
      totalScanned: docs.length,
      migrated,
      skippedOrFailed,
      ownerUserIdBackfilled,
      mode: dryRun ? 'dry-run' : 'apply',
    };
  };

  if (options.dryRun || options.ownerUserIdForBackfill) {
    return runMigration();
  }

  if (!migrationPromise) {
    migrationPromise = runMigration();
  }

  return migrationPromise;
}
