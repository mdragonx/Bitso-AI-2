const STAGE_BY_NODE_ENV = {
  development: 'dev',
  production: 'prod',
  test: 'dev',
} as const;

const BITSO_ENDPOINTS = {
  dev: process.env.BITSO_API_BASE_URL_DEV || 'https://bitso.com',
  staging: process.env.BITSO_API_BASE_URL_STAGING || 'https://bitso.com',
  prod: process.env.BITSO_API_BASE_URL_PROD || 'https://bitso.com',
} as const;

export type AppStage = 'dev' | 'staging' | 'prod';
export type TradingMode = 'paper' | 'live';

function resolveAppStage(): AppStage {
  const explicit = (process.env.APP_ENV || '').trim().toLowerCase();
  if (explicit === 'dev' || explicit === 'staging' || explicit === 'prod') {
    return explicit;
  }

  const mapped = STAGE_BY_NODE_ENV[process.env.NODE_ENV as keyof typeof STAGE_BY_NODE_ENV];
  return mapped || 'dev';
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function resolveTradingMode(stage: AppStage): TradingMode {
  const explicit = (process.env.TRADING_MODE || '').trim().toLowerCase();
  if (explicit === 'paper' || explicit === 'live') {
    return explicit;
  }

  return stage === 'prod' ? 'live' : 'paper';
}

export function resolveAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('Runtime configuration is invalid. Missing/invalid: AUTH_SECRET (or NEXTAUTH_SECRET)');
  }

  return secret;
}

const stage = resolveAppStage();

export const runtimeConfig = {
  stage,
  tradingMode: resolveTradingMode(stage),
};

export function getBitsoBaseUrl(): string {
  const byStage = BITSO_ENDPOINTS[runtimeConfig.stage];
  return normalizeUrl(byStage);
}

export function validateRuntimeConfigAtStartup() {
  const problems: string[] = [];

  if (!process.env.MONGODB_URI && !process.env.MONGO_URL) {
    problems.push('MONGODB_URI (or MONGO_URL)');
  }

  try {
    resolveAuthSecret();
  } catch {
    problems.push('AUTH_SECRET (or NEXTAUTH_SECRET)');
  }

  if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
    problems.push('CREDENTIALS_ENCRYPTION_KEY');
  }

  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    problems.push('OPENAI_API_KEY (required when AI_PROVIDER=openai)');
  }

  if (problems.length > 0) {
    throw new Error(`Runtime configuration is invalid. Missing/invalid: ${problems.join(', ')}`);
  }
}
