const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(filePath) {
  return fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(read(filePath));
}

test('AA-02: workflow topology wires coordinator to technical-analysis and market-research sub-agents', () => {
  const workflowState = readJson('workflow_state.json');
  const sidebarSource = read('app/sections/Sidebar.tsx');

  const nodes = workflowState.workflow?.nodes ?? [];
  const edges = workflowState.workflow?.edges ?? [];

  assert.ok(nodes.some((node) => node.id === 'tech_analysis_agent'));
  assert.ok(nodes.some((node) => node.id === 'market_research_agent'));
  assert.ok(edges.some((edge) => edge.source === 'manager_agent' && edge.target === 'tech_analysis_agent'));
  assert.ok(edges.some((edge) => edge.source === 'manager_agent' && edge.target === 'market_research_agent'));

  assert.match(sidebarSource, /Technical Analysis Agent/);
  assert.match(sidebarSource, /Market Research Agent/);
});

test('AA-03: execution agent is represented and manager routes execution handoff in topology + page flow', () => {
  const workflowState = readJson('workflow_state.json');
  const pageSource = read('app/page.tsx');
  const executionRouteSource = read('app/api/execution/route.ts');
  const executionServiceSource = read('lib/services/executionService.ts');

  const edges = workflowState.workflow?.edges ?? [];
  assert.ok(edges.some((edge) => edge.source === 'manager_agent' && edge.target === 'trade_exec_agent'));

  assert.match(pageSource, /handleExecuteTrade/);
  assert.match(executionRouteSource, /executeApprovedRecommendation/);
  assert.match(executionServiceSource, /recommendation\.status !== 'approved'/);
});

test('DB-01: MongoDB connection startup includes centralized connect + collection naming drift check', () => {
  const source = read('lib/mongodb.ts');

  assert.match(source, /const MONGODB_URI/);
  assert.match(source, /async function logCollectionNamingDrift/);
  assert.match(source, /listCollections\(/);
  assert.match(source, /export default async function connectToDatabase/);
  assert.match(source, /await logCollectionNamingDrift\(cache\.conn\)/);
});

test('DB-02: workflow and model files include all core collections (signals, trades, risk settings, schedules, credentials)', () => {
  const workflowState = readJson('workflow_state.json');

  const collections = new Set(workflowState.database?.collections ?? []);
  assert.ok(collections.has('trade_signals'));
  assert.ok(collections.has('trades'));
  assert.ok(collections.has('risk_settings'));
  assert.ok(collections.has('scheduler_schedules'));
  assert.ok(collections.has('bitso_credentials'));

  assert.match(read('models/TradeSignal.ts'), /TradeSignalSchema/);
  assert.match(read('models/Trade.ts'), /TradeSchema/);
  assert.match(read('models/RiskSetting.ts'), /RiskSettingSchema/);
  assert.match(read('models/SchedulerSchedule.ts'), /SchedulerScheduleSchema/);
  assert.match(read('models/BitsoCredential.ts'), /BitsoCredentialSchema/);
});

test('DB-03: credential storage encrypts API secrets and masks responses without plaintext leakage', () => {
  const routeSource = read('app/api/bitso_credentials/route.ts');
  const cryptoSource = read('lib/cryptoSecrets.ts');

  assert.match(routeSource, /encryptSecret\(body\.api_secret\)/);
  assert.match(routeSource, /encryptSecret\(body\.api_key\)/);
  assert.match(routeSource, /delete obj\.api_secret/);
  assert.match(routeSource, /delete obj\.api_key/);
  assert.match(routeSource, /maskSecret\(/);

  assert.match(cryptoSource, /aes-256-gcm/);
  assert.match(cryptoSource, /export function encryptSecret/);
  assert.match(cryptoSource, /export function decryptSecret/);
});

test('UF-02 + UI-02: nav includes dashboard/history/risk/api-settings/scheduler and renders dedicated sections', () => {
  const sidebarSource = read('app/sections/Sidebar.tsx');
  const pageSource = read('app/page.tsx');

  for (const navId of ['dashboard', 'history', 'risk', 'api-settings', 'scheduler']) {
    assert.match(sidebarSource, new RegExp(`id: '${navId}'`));
  }

  assert.match(pageSource, /<DashboardSection/);
  assert.match(pageSource, /<TradeHistorySection/);
  assert.match(pageSource, /<RiskSettingsSection/);
  assert.match(pageSource, /<ApiSettingsSection/);
  assert.match(pageSource, /<SchedulerSection/);
});

test('UF-01 + UI-03: protected route and auth/loading/error UX are implemented in page shell', () => {
  const pageSource = read('app/page.tsx');

  assert.match(pageSource, /function ProtectedRoute/);
  assert.match(pageSource, /Checking authentication\.\.\./);
  assert.match(pageSource, /function AuthScreen/);
  assert.match(pageSource, /Sign in/);
  assert.match(pageSource, /Create account/);
  assert.match(pageSource, /Something went wrong/);
  assert.match(read('app/loading.tsx'), /Loading/);
  assert.match(read('app/error.tsx'), /Something went wrong|Error/i);
});

test('UF-03: risk settings flow has UI + API + order risk validation integration points', () => {
  const riskSectionSource = read('app/sections/RiskSettingsSection.tsx');
  const riskApiSource = read('app/api/risk_settings/route.ts');
  const orderRouteSource = read('app/api/bitso/order/route.ts');

  assert.match(riskSectionSource, /\/api\/risk_settings/);
  assert.match(riskApiSource, /createRiskSettingsForUser/);
  assert.match(riskApiSource, /updateRiskSettingsForUser/);
  assert.match(orderRouteSource, /validateExecutionRiskRules/);
});

test('INT-01: ticker, balance, and order integrations hit Bitso v3 endpoints', () => {
  const tickerSource = read('app/api/bitso/ticker/route.ts');
  const balanceSource = read('app/api/bitso/balance/route.ts');
  const orderSource = read('app/api/bitso/order/route.ts');

  assert.match(tickerSource, /\/api\/v3\/ticker\//);
  assert.match(balanceSource, /\/api\/v3\/balance\//);
  assert.match(orderSource, /\/api\/v3\/orders\//);
});

test('INT-02: market context route aggregates approved news feeds with sentiment source', () => {
  const source = read('app/api/market-context/route.ts');

  assert.match(source, /APPROVED_NEWS_FEEDS/);
  assert.match(source, /CoinDesk/);
  assert.match(source, /Cointelegraph/);
  assert.match(source, /Alternative\.me Fear & Greed Index/);
  assert.match(source, /parseRss/);
});

test('INT-03: scheduler route uses provider abstraction with policy and rate-limit guardrails', () => {
  const schedulerRouteSource = read('app/api/scheduler/route.ts');
  const providerFactorySource = read('lib/scheduler/providerFactory.ts');
  const localProviderSource = read('lib/scheduler/providers/local.ts');
  const lyzrProviderSource = read('lib/scheduler/providers/lyzr.ts');

  assert.match(schedulerRouteSource, /getSchedulerProvider/);
  assert.match(schedulerRouteSource, /enforceRateLimit/);
  assert.match(schedulerRouteSource, /validateClientIdentityInput/);

  assert.match(providerFactorySource, /resolveSchedulerProviderName/);
  assert.match(localProviderSource, /class LocalSchedulerProvider|export/);
  assert.match(lyzrProviderSource, /Lyzr|lyzr/i);
});

test('UI-01: dashboard section renders analysis, confidence, balances, ticker, and trade actions', () => {
  const dashboardSource = read('app/sections/DashboardSection.tsx');

  assert.match(dashboardSource, /Analysis|Recommendation/i);
  assert.match(dashboardSource, /confidence/i);
  assert.match(dashboardSource, /balance/i);
  assert.match(dashboardSource, /ticker/i);
  assert.match(dashboardSource, /Execute Trade|Run Analysis|Approve/i);
});
