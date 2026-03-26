# Local Setup & Deployment Prerequisites

This project now enforces startup-time configuration validation and environment-stage specific endpoints.

## 1) Required runtime secrets (all environments)

Set these before starting the app (`npm run dev`, `npm run build`, or `npm start`):

- `MONGODB_URI` (or `MONGO_URL`)
- `AUTH_SECRET` (or `NEXTAUTH_SECRET`) **required** for both startup validation and request-time session signing/verification (no development fallback is used; auth paths hard-fail if missing)
- `CREDENTIALS_ENCRYPTION_KEY` (32-byte UTF-8 string, 64-char hex, or base64-encoded 32-byte value)
- `OPENAI_API_KEY` when `AI_PROVIDER=openai` (default provider)

> Recommendation: store all values in your secret manager (Netlify env vars, Vercel project secrets, Doppler, AWS Secrets Manager, HashiCorp Vault, etc.) and never commit `.env*` files with real keys.

## 2) Stage-aware configuration

Use `APP_ENV` to select configuration behavior:

- `APP_ENV=dev`
- `APP_ENV=staging`
- `APP_ENV=prod`

If omitted, stage falls back to `NODE_ENV` mapping (`development -> dev`, `production -> prod`).

### Stage-specific Bitso endpoints

You can configure unique Bitso base URLs per stage:

- `BITSO_API_BASE_URL_DEV`
- `BITSO_API_BASE_URL_STAGING`
- `BITSO_API_BASE_URL_PROD`

If not set, each defaults to `https://bitso.com`.

## 3) Safe trading defaults

`TRADING_MODE` supports:

- `paper`
- `live`

Behavior:

- Non-production (`dev`/`staging`) defaults to `paper`
- Production defaults to `live`
- `TRADING_MODE` can explicitly override either default

In `paper` mode, order execution endpoints return simulated order IDs and skip live Bitso order placement.

## 4) Credential storage model

Bitso `api_key` and `api_secret` are encrypted at rest using `CREDENTIALS_ENCRYPTION_KEY`.

Migration utilities:

- `npm run migrate:bitso-credentials:dry-run`
- `npm run migrate:bitso-credentials`
- `npm run check:bitso-credentials-integrity`

## 5) Local startup checklist

1. Install dependencies: `npm ci`
2. Create local env file (example): `.env.local`
3. Add required secrets and optional stage overrides
4. (Optional) Run credential migration scripts if you have existing plaintext docs
5. Start app: `npm run dev`

If either auth secret variable is missing, startup validation throws and auth runtime code paths (`withAuth`, session token signing/validation) also throw; this is an intentional fail-closed behavior.

## 6) Deployment checklist

1. Configure required secrets in your hosting provider secret store
2. Set `APP_ENV` and optional `BITSO_API_BASE_URL_*` variables
3. Set `TRADING_MODE=paper` for staging unless you explicitly require live trading
4. Run migrations in the target environment before enabling user traffic
5. Verify with health checks and a paper-mode execution test
