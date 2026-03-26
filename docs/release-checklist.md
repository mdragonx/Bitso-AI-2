# Release Checklist

## Required Sign-offs

All of the following must be explicitly signed off by the responsible owners before release:

- [ ] Every traceability row is marked **Implemented**.
- [ ] All critical tests are passing.
- [ ] Security checks are completed.
- [ ] End-to-end demo scenarios are recorded.
- [ ] Known limitations are explicitly documented.

## Objective “Done” Criteria

A release is objectively **Done** only when all conditions below are true:

1. **Traceability completion**
   - 100% of required traceability rows are present and marked **Implemented**.
   - No placeholder, TBD, or unresolved traceability entries remain.

2. **Critical quality gate**
   - The full critical test suite completes with passing status.
   - There are no open critical-severity defects associated with release scope.

3. **Security readiness**
   - Required security checks (including agreed scanners/reviews) have been executed for this release candidate.
   - All critical security findings are resolved or have formal, approved risk acceptance.

4. **Demo evidence readiness**
   - End-to-end demo scenarios covering in-scope user journeys are recorded and accessible to stakeholders.
   - Demo evidence maps to release scope and current build.

5. **Transparency of constraints**
   - Known limitations are documented in release notes (or equivalent) with clear impact and any workaround.
   - Limitations list is reviewed and approved by product/engineering owners.

## Scope Freeze Policy

Once all **Done** criteria above are met:

- Release scope is **frozen**.
- Only changes required to address release-blocking issues may be considered.
- Any post-freeze change must include explicit approval from designated release owners and an updated risk assessment.
- If a post-freeze change is accepted, all impacted criteria must be revalidated before release.
