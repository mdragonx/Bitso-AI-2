# Release Checklist

## Hard Gate: Evidence Before Sign-off

Sign-offs are valid **only after objective evidence is collected and linked**.

- Do **not** sign from memory, verbal confirmation, or "expected behavior".
- Every sign-off entry must include:
  1. Owner name/role
  2. UTC timestamp
  3. Evidence links (PR, test output, traceability row, recording, report)
  4. Explicit statement: `Approved for release` or `Rejected / Blocked`

If any required sign-off is missing, stale, or lacks evidence links, the release is **BLOCKED**.

## Required Owner Sign-offs (evidence-backed)

| Area | Responsible owner | Required evidence | Sign-off |
|---|---|---|---|
| Traceability completeness | Engineering Lead | `docs/traceability.md` shows no `partial`/`missing` rows and every row has an automated test reference | **Owner:** Engineering Lead (acting) <br> **UTC:** 2026-03-26T05:53:21Z <br> **Evidence:** [`docs/traceability.md` current matrix + release decision](./traceability.md) <br> **Decision:** `Rejected / Blocked` (matrix still contains `partial` rows and explicit blockers). |
| Critical tests | QA Lead | CI/test run artifacts for release commit SHA with pass status, including `npm run test:release-gate` (integration/e2e auth + coordinator + execution transitions + risk rejections + idempotency replay) | **Owner:** QA Lead (acting) <br> **UTC:** 2026-03-26T06:29:47Z <br> **Evidence:** Release SHA under evaluation: `55a44b56dbc96f3c51aaf3899433d725f02ad609`. Local evidence bundle: [`artifacts/release-gate/<sha>/README.md`](../artifacts/release-gate/55a44b56dbc96f3c51aaf3899433d725f02ad609/README.md), [`npm ci` log](../artifacts/release-gate/55a44b56dbc96f3c51aaf3899433d725f02ad609/npm-ci.log), [`npm run test:release-gate` log](../artifacts/release-gate/55a44b56dbc96f3c51aaf3899433d725f02ad609/test-release-gate.log), CI workflow definition for reproducible verification: [`/.github/workflows/release-gate.yml`](../.github/workflows/release-gate.yml). <br> **Decision:** `Rejected / Blocked` (required command executed but did not pass locally due dependency install 403; CI run is required to produce a passing gate artifact for this SHA). |
| Security readiness | Security Owner | Security scan/report + resolution or approved risk acceptance for each critical finding | **Owner:** Security Owner (acting) <br> **UTC:** 2026-03-26T05:53:21Z <br> **Evidence:** No current security scan/report artifact was provided in-repo or linked in this checklist update. <br> **Decision:** `Rejected / Blocked`. |
| End-to-end demo evidence | Product + Engineering | Current release build demo recordings mapped to in-scope journeys | **Owner:** Product + Engineering (acting) <br> **UTC:** 2026-03-26T05:53:21Z <br> **Evidence:** No release-candidate demo recording links provided in-repo for this update. <br> **Decision:** `Rejected / Blocked`. |
| Known limitations transparency | Product Owner | Published release notes with impact + workaround + explicit owner review | **Owner:** Product Owner (acting) <br> **UTC:** 2026-03-26T05:53:21Z <br> **Evidence:** No release notes artifact linked in this repository update to satisfy the checklist requirement. <br> **Decision:** `Rejected / Blocked`. |

## Release Block Conditions (non-negotiable)

Release is automatically **BLOCKED** if **any** condition below is true:

1. Any row in `docs/traceability.md` is `partial` or `missing`.
2. Any traceability row lacks a real automated test reference.
3. Any required owner sign-off above is unchecked or missing evidence links.
4. Critical tests are failing or were not run for the release commit. Required command: `npm run test:release-gate`.
5. Critical security findings are unresolved without formal approved acceptance.

## Objective "Done" Criteria

A release is objectively **Done** only when all conditions below are true:

1. **Traceability completion**
   - 100% of required traceability rows are present and marked `implemented`.
   - No placeholder/TBD/unresolved traceability entries remain.
   - Every row contains concrete evidence links and an automated test reference.

2. **Critical quality gate**
   - Full critical suite passes for the release commit SHA.
   - Release gate suite command `npm run test:release-gate` must pass.
   - No open critical-severity defects in release scope.

3. **Security readiness**
   - Required security checks have run on the release candidate.
   - Critical findings are resolved or formally risk-accepted.

4. **Demo evidence readiness**
   - End-to-end demo scenarios are recorded and accessible.
   - Evidence maps to current scope and build.

5. **Transparency of constraints**
   - Known limitations are documented with impact/workaround.
   - Product + engineering owners have approved the documented list.

## Scope Freeze Policy

Once all **Done** criteria are met:

- Release scope is **frozen**.
- Only release-blocking fixes may be considered.
- Any post-freeze change requires explicit owner approval + updated risk assessment.
- If a post-freeze change is accepted, all impacted criteria must be revalidated.


## Reproducible Setup + CI Verification (required for gate evidence)

Use this exact sequence for release-candidate SHA verification:

1. `git checkout <release_sha>`
2. `npm ci`
3. `npm run test:release-gate`

Evidence requirements:

- Persist console logs under `artifacts/release-gate/<release_sha>/` (include setup + gate command output).
- Attach a CI run link for the same SHA from `Release Gate` workflow: `https://github.com/<org>/<repo>/actions/workflows/release-gate.yml`.
- Store/upload CI artifact bundle (logs and `.tmp/` outputs) to the workflow run before sign-off.

Sign-off is blocked until the CI run for the target SHA shows `npm run test:release-gate` passing.
