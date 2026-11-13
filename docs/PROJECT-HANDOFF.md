# Project recovery and AI handoff

Reviewed: 2026-11-13 UTC. Scope: repository documentation and public PR metadata only.
This is a continuity snapshot, not a release approval or a live-system assessment.

## Start here

This repository is a Next.js/React trading dashboard with authentication, agent analysis, Bitso API routes, risk settings, trade history and scheduling. It is distinct from other similarly named Bitso projects. Do not transplant another repository's state, configuration or release claims here.

Source baseline: `main` at [55a44b56dbc96f3c51aaf3899433d725f02ad609](https://github.com/mdragonx/Bitso-AI-2/commit/55a44b56dbc96f3c51aaf3899433d725f02ad609).
At this review, [PR #51](https://github.com/mdragonx/Bitso-AI-2/pull/51) was **open, unmerged**; its head was `e732bd0067df8629032af594e881b7d53cd3b500`. Do not assume that PR's workflow or fixes exist on main.

Read these existing sources before changing implementation:

1. [Local setup](local-setup-and-deployment-prerequisites.md)
2. [Traceability matrix](traceability.md)
3. [Release checklist](release-checklist.md)
4. [Scheduler production guide](scheduler-production.md) and [scheduler architecture](../lib/scheduler/README.md)
5. [Incident runbook](incident-observability-runbook.md)
6. [Collection naming migration](db-collection-naming-runbook.md) and [password migration](auth-password-migration-runbook.md)
7. [package.json](../package.json) for actual commands; [CLAUDE.md](../CLAUDE.md) for frontend conventions, interpreted in the scope of the requested task.

## Architecture and source map

| Concern | Entry point |
|---|---|
| Application shell, screen selection | `app/page.tsx` |
| Dashboard, history, risk, API settings and scheduler UI | `app/sections/` |
| Authentication and session contracts | `app/api/auth/`, `lib/auth.ts` |
| Analysis and execution routes | `app/api/agent/route.ts`, `app/api/execution/route.ts` |
| Bitso market/account/order endpoints | `app/api/bitso/` |
| Execution lifecycle and independent risk validation | `lib/services/executionService.ts`, `lib/services/riskValidationService.ts` |
| Persistence and models | `lib/mongodb.ts`, `models/` |
| Scheduler abstraction | `lib/scheduler/`, `app/api/scheduler/` |
| Agent topology and response contracts | `workflow_state.json`, `response_schemas/` |
| Contract, validation and integration evidence | `tests/` |

Package baseline declares Next.js 14.2.23, React 18.3.1-compatible dependencies and TypeScript 5.6.2-compatible tooling. These are manifest declarations, not versions verified in a running installation. Preserve the lockfile and record actual Node/npm versions when reproducing a build.

## What is established and what is not

The baseline merge #50 added traceability coverage. The matrix currently calls all requirements implemented and says READY. That statement is **not sufficient for release**: the separate release checklist records blocked sign-offs and requires passing evidence tied to the release SHA. The matrix also links `tests/traceability-requirements.test.ts`, whereas the inspected main tree contains `tests/traceability-requirements.test.js`. Reconcile references and executed coverage before treating the matrix as proof.

PR #51 records failed dependency installation (registry 403 resolving cron-parser) and a non-passing release-gate attempt with dependency/TypeScript issues. That is historical evidence, not proof today's registry is unavailable. Check the PR's latest results and exact head before retrying or duplicating fixes.

This review did not execute tests, install dependencies, access a deployed dashboard, inspect production data, run migrations, or place trades. No profitability, production acceptance, current service health or complete security qualification is established.

## Safe resume sequence

1. Record branch, commit and working-tree changes. Review PR #51 before choosing main or its candidate as the work base; preserve existing work.
2. Use an isolated development environment and synthetic data. Explicitly set `APP_ENV=dev` and `TRADING_MODE=paper`; do not rely on defaults, because the setup guide documents a live default for production.
3. Follow the setup guide for variable **names** and protected secret provisioning. Never copy real credentials into Git, issues, logs or an AI prompt. External AI calls and live trading require their own authorization; documentation recovery does not grant it.
4. Review the scripts and dependency changes, then reproduce `npm ci`. If it fails, record the exact error and versions without weakening checks.
5. Run the manifest's `npm run test:contracts`, `npm run test:validation`, `npm run test:integration` and mandatory `npm run test:release-gate` in the isolated test configuration. Also validate lint/build under the documented configuration. Retain outcome and SHA for each; a command existing in package.json does not mean it passed.
6. Reconcile traceability references, test coverage and checklist decisions using the same candidate. Keep the release blocked until every required gate has current evidence.
7. Before any separately authorized deployment, follow the migration/runbook order with a verified backup and restore rehearsal. Never run migrations against an assumed database or restore stale data over a current deployment.

## Next bounded deliverable

Produce one reproducible, SHA-bound release-gate report: dependency result, test commands/results, corrected traceability links, remaining blockers and a clear checklist decision. Reuse PR #51 rather than silently replacing its work. Follow with evidence-backed end-to-end paper-mode journeys, scheduler recovery and authorized release review. Do not add features merely to conceal a blocked gate.

## Handoff record for each future session

Append or link: date, base/head SHA, purpose, changed files, commands actually executed, exact results, artifact/PR links, known limitations, next action and required approval. Mark facts as repository-verified, test-verified, deployed-verified or unverified. Keep raw operational data and secrets outside this public repository.
