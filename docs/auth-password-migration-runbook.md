# Auth password migration runbook (`password` -> `password_hash`)

## Why this migration exists
Legacy user records may still contain plaintext `password` fields and may be missing `password_hash`. This one-time migration hashes plaintext values with the same hashing helper used by auth login and removes plaintext passwords.

## Script
- Location: `scripts/migrate-user-passwords.mjs`
- Collections scanned: `_users`, `users` (whichever exists)
- Eligibility: documents where `password` exists and `password_hash` is missing/empty

## Pre-deploy checklist
1. Ensure `MONGODB_URI` (or `MONGO_URL`) points at the correct environment.
2. Take a database backup/snapshot before running apply mode.
3. Confirm application code including login fallback path is deployed.

## Dry run (recommended first)
```bash
node scripts/migrate-user-passwords.mjs --dry-run
```
Expected output includes per-collection counts:
- `total`
- `eligible`
- `updated` (always `0` in dry run)
- `skipped`
- `mode`

## Apply migration
```bash
node scripts/migrate-user-passwords.mjs
```
Run once per environment (staging, then production).

## Validation after apply
1. Re-run dry run and verify `eligible=0`.
2. Validate login for a sample of previously-legacy users.
3. Validate no records retain plaintext `password`.

## Rollback notes
- **Data rollback:** restore from pre-migration database snapshot if needed.
- **Auth compatibility rollback:** login route includes temporary fallback handling for legacy users (plaintext match + immediate rehash), so rollbacks to partial data state can still authenticate and self-heal on login.
- **Operational rollback:** if issues appear, stop running apply mode and keep only dry-run verification while investigating.
