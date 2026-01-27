# Agents Workflow

This repo uses a lightweight multi-agent workflow for building a Tampermonkey user script that reads a credit-card web portal, extracts needed values, and computes sub-tab earnings. The workflow is intentionally cautious about security and site terms, and keeps all data local to the browser.

## Workflow
1) **Safety + Scope Gate**
   - Confirm the script is read-only (no transactions), runs only on user-owned accounts, and respects site ToS.
   - Define privacy constraints (no logging to remote endpoints; optional local storage only if needed).

2) **Requirements Discovery**
   - Clarify which banks and which pages/tabs are in scope.
   - Identify the exact fields needed for earnings and any edge cases (missing data, pending vs posted).

3) **DOM + Data Mapping**
   - Inspect page structure and identify stable selectors.
   - Define fallbacks (text anchors, ARIA labels) and update strategy for SPA/reactive pages.

4) **Computation Design**
   - Formalize earnings rules, rounding, and reconciliation.
   - Define a minimal data model for extracted values and computed outputs.

5) **Script Implementation**
   - Build the Tampermonkey scaffold, data extraction, calculation, and UI output.
   - Ensure robust error handling and clear in-page status messages.

6) **Testing + Validation**
   - Validate calculations against known statements.
   - Verify across browsers and page variants (desktop/mobile layout, dark/light).

7) **Maintenance Plan**
   - Document how to update selectors, add banks, and verify changes.

8) **Commit Discipline**
   - Commit after each sizeable chunk of work.
   - Always commit before returning results to the user.

## Agents
- **code-reviewer**: Senior-level review for risks, regressions, and missing tests.
Use the agents below as needed. Assign tasks in the order shown above to reduce rework.

- **security-compliance**: Ensure privacy, read-only behavior, and ToS boundaries.
- **requirements-analyst**: Gather and clarify what data is needed and from which pages.
- **dom-mapper**: Map the target DOM structure and selectors with fallback strategies.
- **calculations-engineer**: Translate earnings rules into deterministic logic.
- **tampermonkey-engineer**: Implement the user script, UI, and integration glue.
- **qa-validation**: Build test cases and validate against real statement data.

## Handoff Format
Each agent should provide:
- Summary of findings
- Assumptions/unknowns
- Artifacts (selectors, formulas, code snippets, or tests)
- Risks and recommended mitigations
