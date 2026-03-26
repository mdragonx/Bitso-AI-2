# Implementation Traceability Matrix

This document is the **single source of truth** for tracking implementation completion against the project plan sections:

- Overview / User Stories
- Agent Architecture (manager + sub-agents + execution agent)
- Database Configuration
- User Flow
- Integrations
- UI/UX screens and components

## Status Legend

- `implemented`: requirement is fully present in current codebase.
- `partial`: requirement exists but is incomplete, delegated externally, or lacks full validation/coverage.
- `missing`: requirement is not yet present in current codebase.

## Requirements Matrix

| Requirement ID | Plan Section | Plain-language requirement statement | Target module/file path(s) | Current status | Evidence (function/class name, route, component) | Test coverage reference (unit/integration/e2e) |
|---|---|---|---|---|---|---|
| OV-01 | Overview / User Stories | Users can authenticate (register/login/logout) before accessing trading features. | `app/page.tsx`, `app/api/auth/register/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `lib/auth.ts` | implemented | `LoginForm`, `RegisterForm`, `ProtectedRoute`; `/api/auth/*` routes; `withAuth` middleware | missing (no auth unit/integration/e2e tests found) |
| OV-02 | Overview / User Stories | Users can analyze a selected trading pair and get a recommendation. | `app/page.tsx`, `app/sections/DashboardSection.tsx`, `app/api/agent/route.ts` | implemented | `runAnalysis` flow in `page.tsx` via `callAIAgent`; dashboard analysis cards; `POST /api/agent` | missing (no analysis flow tests found) |
| OV-03 | Overview / User Stories | Users can execute trades with risk controls and persist results. | `app/page.tsx`, `app/api/bitso/order/route.ts`, `app/api/trades/route.ts`, `models/Trade.ts` | implemented | `executeTrade` flow in `page.tsx`; `POST /api/bitso/order`; `POST /api/trades` | missing (no trade execution integration/e2e tests found) |
| AA-01 | Agent Architecture | A manager agent orchestrates market analysis and returns structured output. | `workflow_state.json`, `response_schemas/market_analysis_coordinator_response.json`, `app/api/agent/route.ts` | partial | manager agent `69c440a030aebe1ba52aede0` in workflow; schema validation in `loadResponseSchema` + `validateAgainstSchema` | missing (no orchestration contract tests found) |
| AA-02 | Agent Architecture | Sub-agents (technical analysis + market research) are represented and wired into workflow topology. | `workflow_state.json`, `app/sections/Sidebar.tsx` | implemented | `technical_analysis_agent`, `market_research_agent` nodes/edges; sidebar `AGENTS` list roles | missing (no workflow topology tests found) |
| AA-03 | Agent Architecture | Execution agent is invoked after analysis approval to produce executable trade output. | `workflow_state.json`, `app/page.tsx`, `response_schemas/trade_execution_agent_response.json` | partial | `trade_execution_agent` declared; `executeTrade` uses agent id `69c440b01b19ba3adafaf1d7`; schema file present | missing (no end-to-end manager→execution tests found) |
| DB-01 | Database Configuration | MongoDB connection is centralized with startup checks for collection naming drift. | `lib/mongodb.ts` | implemented | `connectToDatabase`, `logCollectionNamingDrift`, canonical variant map | missing (no db bootstrap unit tests found) |
| DB-02 | Database Configuration | Core collections for signals, trades, risk settings, schedules, and credentials are modeled. | `models/TradeSignal.ts`, `models/Trade.ts`, `models/RiskSetting.ts`, `models/SchedulerSchedule.ts`, `models/BitsoCredential.ts`, `workflow_state.json` | implemented | model getter exports and schema-backed collections; `workflow_state` database block | missing (no model/schema tests found) |
| DB-03 | Database Configuration | Bitso API secrets are encrypted at rest and never returned in plaintext. | `app/api/bitso_credentials/route.ts`, `lib/cryptoSecrets.ts` | implemented | `encryptSecret`, `decryptSecret`, `maskSecret`, masked GET response shape | missing (no crypto/integration tests found) |
| UF-01 | User Flow | App gates protected content behind session verification and shows auth screen when unauthenticated. | `app/page.tsx`, `app/api/auth/me/route.ts`, `lib/auth.ts` | implemented | `ProtectedRoute` with `/api/auth/me`; session helpers `getSessionFromRequest`, cookie handling | missing (no protected-route tests found) |
| UF-02 | User Flow | Users can navigate between dashboard/history/risk/api-settings/scheduler views. | `app/page.tsx`, `app/sections/Sidebar.tsx` | implemented | `activeScreen` state with screen-specific rendering; sidebar `NAV_ITEMS` and `onNavigate` | missing (no navigation component tests found) |
| UF-03 | User Flow | Users can review and update risk settings that affect order validation. | `app/sections/RiskSettingsSection.tsx`, `app/api/risk_settings/route.ts`, `app/api/bitso/order/route.ts` | implemented | risk settings CRUD route; risk checks `PAIR_NOT_ALLOWED`, `MAX_TRADE_AMOUNT_EXCEEDED`, `DAILY_LIMIT_EXCEEDED` | missing (no risk-rule integration tests found) |
| INT-01 | Integrations | Bitso market data and account endpoints are integrated for ticker, balance, and order placement. | `app/api/bitso/ticker/route.ts`, `app/api/bitso/balance/route.ts`, `app/api/bitso/order/route.ts` | implemented | `GET /api/bitso/ticker`, `GET /api/bitso/balance`, `POST /api/bitso/order` | missing (no provider-mock integration tests found) |
| INT-02 | Integrations | Market context integration provides approved news + sentiment context for recommendations. | `app/api/market-context/route.ts`, `app/sections/DashboardSection.tsx` | implemented | `APPROVED_NEWS_FEEDS`, `fetchSentimentItems`; dashboard renders recommendation context sources | missing (no rss/sentiment parser tests found) |
| INT-03 | Integrations | Scheduler integration supports create/list/manage schedules with provider abstraction and policy guardrails. | `app/api/scheduler/route.ts`, `lib/scheduler/providerFactory.ts`, `lib/scheduler/providers/local.ts`, `lib/scheduler/providers/lyzr.ts` | implemented | `/api/scheduler` action handling + zod validation/rate limiting; provider resolution factory | missing (no scheduler API integration/e2e tests found) |
| UI-01 | UI/UX screens and components | Dashboard screen surfaces analysis, confidence, balances, ticker, and trade actions. | `app/sections/DashboardSection.tsx`, `app/page.tsx` | implemented | `DashboardSection` props + render blocks for recommendation and trade execution controls | missing (no UI component tests found) |
| UI-02 | UI/UX screens and components | Dedicated screens/components exist for trade history, risk settings, API settings, and scheduler. | `app/sections/TradeHistorySection.tsx`, `app/sections/RiskSettingsSection.tsx`, `app/sections/ApiSettingsSection.tsx`, `app/sections/SchedulerSection.tsx` | implemented | section components imported and conditionally rendered from `page.tsx` | missing (no screen-level integration tests found) |
| UI-03 | UI/UX screens and components | Error and loading UX exist for key async flows (analysis/trade/auth). | `app/page.tsx`, `app/error.tsx`, `app/loading.tsx`, `app/sections/DashboardSection.tsx` | partial | inline loading states (`analyzing`, `executing`, auth loading), global error boundary pages | missing (no UX state transition tests found) |

## Maintenance Rules (Single Source of Truth)

1. Any new requirement must be added here before implementation starts.
2. Any merged feature must update the corresponding `Current status`, evidence, and test reference.
3. A requirement cannot move to `implemented` without at least one explicit automated test reference.
4. If code and this matrix disagree, update this matrix in the same pull request that resolves the mismatch.
