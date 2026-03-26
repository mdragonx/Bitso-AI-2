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
| Traceability completeness | Engineering Lead | `docs/traceability.md` shows no `partial`/`missing` rows and every row has an automated test reference | [ ] Pending |
| Critical tests | QA Lead | CI/test run artifacts for release commit SHA with pass status | [ ] Pending |
| Security readiness | Security Owner | Security scan/report + resolution or approved risk acceptance for each critical finding | [ ] Pending |
| End-to-end demo evidence | Product + Engineering | Current release build demo recordings mapped to in-scope journeys | [ ] Pending |
| Known limitations transparency | Product Owner | Published release notes with impact + workaround + explicit owner review | [ ] Pending |

## Release Block Conditions (non-negotiable)

Release is automatically **BLOCKED** if **any** condition below is true:

1. Any row in `docs/traceability.md` is `partial` or `missing`.
2. Any traceability row lacks a real automated test reference.
3. Any required owner sign-off above is unchecked or missing evidence links.
4. Critical tests are failing or were not run for the release commit.
5. Critical security findings are unresolved without formal approved acceptance.

## Objective "Done" Criteria

A release is objectively **Done** only when all conditions below are true:

1. **Traceability completion**
   - 100% of required traceability rows are present and marked `implemented`.
   - No placeholder/TBD/unresolved traceability entries remain.
   - Every row contains concrete evidence links and an automated test reference.

2. **Critical quality gate**
   - Full critical suite passes for the release commit SHA.
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
