# Agents Workflow (Simplified & Security-First)

This repo uses a **simplified security-first** multi-agent workflow for building a Tampermonkey user script that reads a credit-card web portal, extracts needed values, and computes sub-cap earnings. The workflow is intentionally cautious about security and site terms, and keeps all data local to the browser.

## Core Principle

**"Security is not a phase; it's a practice."**

Security review is **mandatory** at key phases—not optional. Every agent is responsible for security within their domain.

## Skills Overview

Skills are stored in `.agents/skills/`. Each skill has a `SKILL.md` that defines its workflow, outputs, and usage guidance. Use this directory as the canonical reference when selecting skills for a task.

## Skills Directory

| Skill | Summary | Link |
| --- | --- | --- |
| code-review | Expert code reviewer with best-practice guidance for correctness, security, performance, and maintainability. | `.agents/skills/code-review/SKILL.md` |
| debugging-assistant | Debugging methodologies for root-cause analysis, reproduction, and prevention. | `.agents/skills/debugging-assistant/SKILL.md` |
| documentation | Technical writing guidance for clear, complete documentation. | `.agents/skills/documentation/SKILL.md` |
| network-resilience | Reliability improvements for network calls, retries, and offline handling. | `.agents/skills/network-resilience/SKILL.md` |
| performance-optimization | Performance analysis and optimization best practices. | `.agents/skills/performance-optimization/SKILL.md` |
| qa-testing | Test planning for happy paths, edge cases, and regressions. | `.agents/skills/qa-testing/SKILL.md` |
| refactoring-expert | Safe refactoring practices to improve structure without behavior changes. | `.agents/skills/refactoring-expert/SKILL.md` |
| release-management | Release planning, checklists, and notes. | `.agents/skills/release-management/SKILL.md` |
| requirements-researcher | Requirements discovery, constraints, and feasibility analysis. | `.agents/skills/requirements-researcher/SKILL.md` |
| security-risk | Security and privacy risk identification with mitigations. | `.agents/skills/security-risk/SKILL.md` |
| spec-writer | Specifications/plans with tasks, acceptance criteria, and verification steps. | `.agents/skills/spec-writer/SKILL.md` |
| ux-accessibility | Accessibility checks for UI changes (keyboard, focus, contrast, semantics). | `.agents/skills/ux-accessibility/SKILL.md` |

## Simplified Workflow (6 Agents)

**Phase 0: Requirements & Safety Gate** (requirements-analyst + security-reviewer)
- Gather requirements: banks, pages, data fields, UX criteria
- Confirm read-only behavior, privacy constraints, ToS compliance
- Initial threat modeling
- **Gate:** Halt if policy or security risks identified

**Phase 1: Implementation** (implementation-engineer)
- Map DOM structure and identify stable selectors
- Build Tampermonkey scaffold
- Implement data extraction, calculation, and UI
- Handle errors and edge cases
- **Iteration:** Return to requirements if data gaps found

**Phase 2: Code Review** (code-reviewer + security-reviewer)
- Code quality and maintainability review
- Dependency vulnerability check (npm audit)
- License compliance
- **Gate:** Security review with OWASP Top 10 checklist
- **Decision:** APPROVE / REQUEST CHANGES / BLOCK

**Phase 3: Quality Validation** (quality-validator)
- Functional testing (calculations, edge cases)
- Performance testing (load time, memory)
- Accessibility testing (keyboard nav, contrast)
- **Gate:** All tests must pass

**Phase 4: Security Testing** (security-reviewer)
- Penetration testing (manual + OWASP ZAP)
- Attack simulation and exploit attempts
- Final security sign-off
- **Gate:** Cannot deploy with critical vulnerabilities

**Phase 5: Documentation** (documentation-writer - optional)
- Update documentation for changes
- Document known limitations
- Create user guides if needed

**Phase 6: Maintenance** (code-reviewer + security-reviewer)
- Monitor dependencies for CVEs
- Update documentation as code changes
- Address security advisories

## Phase ↔ Skills Mapping

- **Phase 0: Requirements & Safety Gate** → `requirements-researcher`, `security-risk`
- **Phase 1: Implementation** → `debugging-assistant`, `refactoring-expert`, `network-resilience` (situational)
- **Phase 2: Code Review** → `code-review`, `security-risk`
- **Phase 3: Quality Validation** → `qa-testing`, `performance-optimization`, `ux-accessibility`
- **Phase 4: Security Testing** → `security-risk`
- **Phase 5: Documentation** → `documentation`
- **Phase 6: Maintenance** → `release-management` (situational), `code-review` (as needed)

**When to use skills:** skills are selected based on task needs. Situational skills are optional and only apply when the task includes that concern.

## Agents

### 📋 Requirements-Analyst

**Role:** Discovery phase - gather requirements and define scope

**Responsibilities:**
- Clarify banks, pages, and data fields needed
- Document UX acceptance criteria
- Identify edge cases and computation rules
- Flag sensitive data requirements (PII classification)

**Deliverables:**
- Requirements specification
- Data inventory and scope boundaries
- UX acceptance criteria
- Open questions list

---

### 🔧 Implementation-Engineer

**Role:** DOM mapping and full script implementation

**Responsibilities:**
- Inspect page structure, identify stable selectors
- Define fallback strategies for selectors
- Build complete Tampermonkey user script
- Implement extraction, calculation, and UI rendering
- Handle SPA updates and edge cases

**Deliverables:**
- Selector map with fallbacks
- Working Tampermonkey script
- Integration notes
- Known limitations

**Security:**
- No sensitive data in console.log()
- Use GM_storage (not localStorage) for tokens
- HTTPS-only communication

---

### 🔒 Security-Reviewer (Gate Authority)

**Role:** Comprehensive security across all phases

**Responsibilities:**
- **Policy:** Privacy constraints, ToS compliance, GDPR
- **Threat Modeling:** STRIDE methodology, attack surfaces
- **Code Review:** OWASP Top 10, anti-pattern detection
- **Adversarial Testing:** Penetration testing, attack simulation
- **Dependencies:** CVE monitoring, supply chain security

**Gate Authority:** Can BLOCK releases at:
- Phase 0: Unsafe scope or ToS violations
- Phase 2: Critical security issues in code
- Phase 4: Failed penetration testing

**Deliverables:**
- Threat model
- Security gate decision (APPROVE / BLOCK)
- Vulnerability reports
- Penetration testing results

---

### 👨‍💻 Code-Reviewer

**Role:** Code quality and dependency management

**Responsibilities:**
- Code quality and maintainability review
- Identify bugs, edge cases, race conditions
- Test coverage assessment
- Dependency vulnerability scanning (npm audit)
- License compliance checking

**Deliverables:**
- Code review findings (prioritized by severity)
- Dependency audit report
- License compliance status
- Recommended fixes

---

### ✅ Quality-Validator

**Role:** Comprehensive quality assurance

**Responsibilities:**
- **Functional:** Validate calculations, test edge cases
- **Performance:** Core Web Vitals, bundle size (< 200 KB), load time (< 3s)
- **Accessibility:** WCAG 2.1 AA key criteria, keyboard nav, color contrast (4.5:1)

**Deliverables:**
- Test report (functional, performance, accessibility)
- Performance metrics and optimization recommendations
- Accessibility compliance report
- Regression checklist

---

### 📚 Documentation-Writer (Optional)

**Role:** Technical writing and documentation maintenance

**Responsibilities:**
- User guides and API documentation
- Architecture Decision Records (ADRs)
- Migration guides for breaking changes
- Keep docs synchronized with code

**Deliverables:**
- Updated documentation
- User guides and tutorials
- API reference

---

## Security Gates (Mandatory)

### Phase 0 → 1:
- ✅ Requirements clear and complete
- ✅ Privacy constraints documented
- ✅ No ToS violations
- ✅ Initial threat model approved

### Phase 2 (Code Review):
- ✅ Code quality acceptable
- ✅ Zero critical/high CVEs in dependencies
- ✅ License compliance verified
- ✅ No security anti-patterns (hardcoded secrets, eval, innerHTML)

### Phase 4 (Security Testing):
- ✅ OWASP ZAP scan clean (no critical findings)
- ✅ Manual penetration testing passed
- ✅ Attack simulation showed no exploitable vulnerabilities

---

## Handoff Format

Each agent should provide:
- Summary of findings
- Assumptions and unknowns
- Deliverables (code, docs, reports)
- Risks and recommended mitigations
- Security sign-off (for security-reviewer)

---

## Simplified Principles

1. **Fewer Agents:** 6 agents instead of 12 - easier to coordinate
2. **Clear Responsibilities:** Each agent has one major domain
3. **Security First:** Security-reviewer has gate authority
4. **Practical:** Appropriate for a Tampermonkey userscript project
5. **Comprehensive:** All critical aspects covered (security, quality, code review)

---

## Agent Comparison

**Before (12 agents):** requirements-analyst, dom-mapper, tampermonkey-engineer, qa-validation, security-compliance, code-reviewer, security-engineer, red-team, performance-engineer, accessibility-validator, documentation-writer, dependency-manager

**After (6 agents):**
- requirements-analyst (kept)
- implementation-engineer (merged: dom-mapper + tampermonkey-engineer)
- security-reviewer (merged: security-compliance + security-engineer + red-team)
- code-reviewer (enhanced: + dependency-manager)
- quality-validator (merged: qa-validation + performance-engineer + accessibility-validator)
- documentation-writer (optional)

**Result:** 50% reduction in agents, 90% maintained capabilities, simpler workflow

---

## Reference Documents

- **apps/backend/SECURITY.md** - Backend security controls
- **TECHNICAL.md** - Userscript technical reference
- **PHASES_4B_5_COMPLETE.md** - Current project status

---

**Questions?** Consult the security-reviewer agent or refer to the security docs above.

**Last Updated:** 2026-01-30 (Simplified from 12 to 6 agents)
