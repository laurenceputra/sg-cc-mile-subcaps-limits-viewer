# Agents Workflow

This repo uses a lightweight multi-agent workflow for building a Tampermonkey user script that reads a credit-card web portal, extracts needed values, and computes sub-tab earnings. The workflow is intentionally cautious about security and site terms, and keeps all data local to the browser.

## Workflow
1) **Safety + Scope Gate**
   - Confirm the script is read-only (no transactions), runs only on user-owned accounts, and respects site ToS.
   - Define privacy constraints (no logging to remote endpoints; optional local storage only if needed).
   - **Check:** halt and clarify scope if any policy or data-handling risk is identified.

2) **Requirements Discovery**
   - Clarify which banks and which pages/tabs are in scope.
   - Identify the exact fields needed for earnings and any edge cases (missing data, pending vs posted).
   - Include UX acceptance criteria (labels, spacing, ordering) and computation rules/rounding expectations.
   - **Iteration:** update requirements when DOM mapping or testing uncovers missing data or UI issues.

3) **DOM + Data Mapping**
   - Inspect page structure and identify stable selectors.
   - Define fallbacks (text anchors, ARIA labels) and update strategy for SPA/reactive pages.
   - Include refresh/state behavior notes (e.g., "view more" paging, re-render timing).
   - **Iteration:** loop back to requirements if selectors or fields prove unstable.

4) **Script Implementation**
   - Build the Tampermonkey scaffold, data extraction, calculation, and UI output.
   - Ensure robust error handling and clear in-page status messages.
   - **Iteration:** if data gaps or UX mismatches appear, return to requirements/DOM mapping.

5) **Testing + Validation**
   - Validate calculations against known statements.
   - Verify across browsers and page variants (desktop/mobile layout, dark/light).
   - **Check:** treat failures as a hard gate; loop back to requirements/DOM mapping as needed.

6) **Maintenance Plan**
   - Document how to update selectors, add banks, and verify changes.

7) **Commit Discipline**
   - Commit after each sizeable chunk of work.
   - Always commit before returning results to the user.

## Agents
- **code-reviewer**: Senior-level review for risks, regressions, and missing tests.
Use the agents below as needed. Assign tasks in the order shown above to reduce rework.

- **security-compliance**: Ensure privacy, read-only behavior, and ToS boundaries.
- **requirements-analyst**: Gather/clarify data needs, computation rules, and UX acceptance criteria.
- **dom-mapper**: Map the target DOM structure, selectors, and refresh/state behaviors with fallback strategies.
- **tampermonkey-engineer**: Implement the user script, UI, and integration glue.
- **qa-validation**: Build test cases, validate against real statement data, and guard against regressions.

## Handoff Format
Each agent should provide:
- Summary of findings
- Assumptions/unknowns
- Artifacts (selectors, formulas, code snippets, or tests)
- Risks and recommended mitigations
