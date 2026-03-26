import crypto from 'crypto';
import getBitsoCredentialModel from '@/models/BitsoCredential';

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

let migrationPromise: Promise<void> | null = null;

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

export async function migratePlaintextBitsoSecrets(): Promise<void> {
  if (migrationPromise) {
    return migrationPromise;
  }

  migrationPromise = (async () => {
    const Model = await getBitsoCredentialModel();
    const docs = await Model.find({
      api_secret: { $exists: true, $ne: '' },
      encrypted_api_secret_ciphertext: { $in: [null, ''] },
    }).select('_id api_secret');

    if (!docs.length) return;

    await Promise.all(
      docs.map(async (doc: any) => {
        const encrypted = encryptSecret(String(doc.api_secret || ''));
        await Model.updateOne(
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
      })
    );
  })();

  return migrationPromise;
}
