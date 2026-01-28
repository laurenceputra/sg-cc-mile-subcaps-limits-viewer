# Agents Workflow (Security-First)

This repo uses a **security-first** multi-agent workflow for building a Tampermonkey user script that reads a credit-card web portal, extracts needed values, and computes sub-cap earnings. The workflow is intentionally cautious about security and site terms, and keeps all data local to the browser.

## Core Principle

**"Security is not a phase; it's a practice."**

Security review is **mandatory** at every phase—not optional. Every agent is responsible for security within their domain.

## Workflow

**0. Safety + Scope Gate** (security-compliance)
- Confirm the script is read-only (no transactions), runs only on user-owned accounts, and respects site ToS.
- Define privacy constraints (no logging to remote endpoints; optional local storage only if needed).
- **Check:** halt and clarify scope if any policy or data-handling risk is identified.

**1. Requirements Discovery** (requirements-analyst)
- Clarify which banks and which pages/tabs are in scope.
- Identify the exact fields needed for earnings and any edge cases (missing data, pending vs posted).
- Include UX acceptance criteria (labels, spacing, ordering) and computation rules/rounding expectations.
- **NEW:** Flag sensitive data requirements, document data classification (PII, public, internal)
- **Iteration:** update requirements when DOM mapping or testing uncovers missing data or UI issues.

**2. Security Design Review** (🔒 NEW - security-engineer)
- **GATE PHASE:** Cannot proceed without security approval
- Threat modeling using STRIDE methodology
- Authentication/authorization strategy validation
- Cryptography library and algorithm selection (no custom crypto)
- Attack surface analysis and trust boundaries
- Data classification (PII, sensitive, public)
- **Deliverable:** Threat model document, security architecture sign-off
- **Check:** Block phase transition if critical security concerns exist

**3. DOM + Data Mapping** (dom-mapper)
- Inspect page structure and identify stable selectors.
- Define fallbacks (text anchors, ARIA labels) and update strategy for SPA/reactive pages.
- Include refresh/state behavior notes (e.g., "view more" paging, re-render timing).
- **NEW:** Document XSS risks in DOM manipulation, validate selector stability
- **Iteration:** loop back to requirements if selectors or fields prove unstable.

**4. Script Implementation** (tampermonkey-engineer + backend team)
- Build the Tampermonkey scaffold, data extraction, calculation, and UI output.
- Implement backend API with security hardening (rate limiting, input validation, etc.)
- Ensure robust error handling and clear in-page status messages.
- **Follow security checklists:** See SECURITY_CHECKLISTS.md for phase-specific requirements
- **Iteration:** if data gaps or UX mismatches appear, return to requirements/DOM mapping.

**5. Security Code Review** (🔒 security-engineer + code-reviewer)
- **GATE PHASE:** Cannot proceed without security approval
- OWASP Top 10 checklist per pull request
- Security anti-pattern detection (hardcoded secrets, timing attacks, SQL injection, XSS)
- Cryptography review (no custom implementations, proper key derivation)
- Authentication/authorization flaw identification
- Dependency vulnerability review (npm audit, Snyk)
- **Deliverable:** Code review report with security sign-off
- **Check:** Block phase transition if security issues found

**6. Testing + Validation** (qa-validation + 🔒 security-engineer)
- Validate calculations against known statements.
- Verify across browsers and page variants (desktop/mobile layout, dark/light).
- **NEW:** Security testing (timing attacks, rate limiting, race conditions, input validation)
- **NEW:** Penetration testing (OWASP ZAP, manual exploitation)
- **Check:** treat failures as a hard gate; loop back to requirements/DOM mapping as needed.
- **Deliverable:** Test report with security coverage metrics

**7. Penetration Testing** (🔒 NEW - security-engineer)
- **GATE PHASE:** Cannot proceed to production without approval
- OWASP ZAP automated scanning
- Manual exploitation attempts
- Security documentation review
- Incident response plan creation
- Deployment security checklist verification
- **Deliverable:** Penetration testing report, production readiness sign-off

**8. Maintenance Plan**
- Document how to update selectors, add banks, and verify changes.
- **NEW:** Security monitoring plan (failed logins, API errors, dependency vulnerabilities)

**9. Commit Discipline**
- Commit after each sizeable chunk of work.
- Always commit before returning results to the user.

## Agents

### 🔒 Security-Engineer (NEW - Primary Security Agent)

**Role:** Proactive security expert embedded in every phase

**Responsibilities:**
- Threat modeling (STRIDE methodology)
- Security design review before implementation
- Cryptography review and guidance (no custom crypto, use audited libraries)
- Input validation and output encoding review
- Authentication/authorization security (bcrypt/argon2, constant-time comparison)
- Rate limiting and DoS prevention
- Penetration testing and vulnerability assessment
- Security gate approval (blocks phase transitions if needed)
- Incident response leadership

**Deliverables:**
- Threat model document
- Security architecture decisions log
- Security test suite
- Penetration testing report
- Deployment security checklist
- Incident response plan

**Gate Authority:** MUST approve before proceeding to next phase

**When to Engage:**
- Phase 0: Confirm security constraints and privacy requirements
- Phase 2: Security design review (MANDATORY GATE)
- Phase 4: Real-time security guidance during implementation
- Phase 5: Security code review (MANDATORY GATE)
- Phase 6: Security testing and validation
- Phase 7: Penetration testing (MANDATORY GATE before production)

---

### 👨‍💻 Code-Reviewer (Enhanced)

**Original Role:** Senior-level review for risks, regressions, and missing tests

**Enhanced Responsibilities:**
- **OWASP Top 10 checklist** per PR (mandatory):
  - A01:2021 - Broken Access Control
  - A02:2021 - Cryptographic Failures
  - A03:2021 - Injection
  - A04:2021 - Insecure Design
  - A05:2021 - Security Misconfiguration
  - A06:2021 - Vulnerable Components
  - A07:2021 - Authentication Failures
  - A08:2021 - Software and Data Integrity Failures
  - A09:2021 - Security Logging and Monitoring Failures
  - A10:2021 - Server-Side Request Forgery (SSRF)

- **Security anti-pattern detection:**
  - Hardcoded secrets (API keys, passwords, tokens)
  - Non-constant-time comparisons (timing attacks)
  - SQL string concatenation (SQL injection risk)
  - `eval()` or `innerHTML` usage (XSS risk)
  - Unvalidated user input
  - Missing rate limiting
  - Default credentials
  - Information leaks in error messages
  - Race conditions (TOCTOU)

- **Dependency vulnerability review:**
  - Check `npm audit` output
  - Verify no high/critical CVEs
  - Review license compliance
  - Flag outdated or unmaintained packages

**Deliverable:** Code review report with security sign-off (APPROVE / REQUEST CHANGES / BLOCK)

---

### 🛡️ Security-Compliance (Enhanced)

**Original Role:** Ensure privacy, read-only behavior, and ToS boundaries

**Enhanced Responsibilities:**

**Privacy by Design:**
- E2E encryption validation (client-side encrypt before send)
- Local-first architecture verification
- PII handling review (no sensitive data in logs)
- Cookie compliance (SameSite, Secure flags)

**GDPR Compliance** (if applicable):
- Right to access (data export functionality)
- Right to erasure (account deletion functionality)
- Data minimization (collect only necessary data)
- Consent management (opt-in for data sharing)
- Data retention policies (auto-delete after retention period)

**Terms of Service:**
- No automation violations (read-only, no form submissions)
- User-owned accounts only (no credential sharing)
- Respect rate limits and API terms

**Deliverable:** Privacy compliance report, GDPR checklist

---

### 📋 Requirements-Analyst

**Responsibilities:**
- Gather/clarify data needs, computation rules, and UX acceptance criteria.

**Security Integration (NEW):**
- Flag sensitive data requirements (PII, credentials, financial data)
- Document data classification (public, internal, confidential)
- Identify compliance requirements (GDPR, CCPA, PCI-DSS if applicable)
- Define data retention policies

---

### 🗺️ DOM-Mapper

**Responsibilities:**
- Map the target DOM structure, selectors, and refresh/state behaviors with fallback strategies.

**Security Integration (NEW):**
- Document XSS risks in DOM manipulation
- Validate selector stability (prevent injection attacks)
- Identify CSRF tokens or anti-automation measures

---

### 🔧 Tampermonkey-Engineer

**Responsibilities:**
- Implement the user script, UI, and integration glue.

**Security Integration (NEW):**
- Follow frontend security checklist (SECURITY_CHECKLISTS.md)
- No sensitive data in console.log()
- Secure storage usage (GM_storage, not localStorage for tokens)
- HTTPS-only communication
- Content Security Policy compliance

---

### ✅ QA-Validation (Enhanced)

**Original Role:** Build test cases, validate against real statement data, and guard against regressions.

**Enhanced Responsibilities:**
- Functional testing (calculations, UI, edge cases)
- **Security test suite execution:**
  - Timing attack resistance testing
  - Rate limiting validation (verify 429 responses)
  - Input validation edge cases (control characters, oversized inputs)
  - Concurrent request testing (race conditions)
  - Authentication bypass attempts
  - CSRF protection verification

**Deliverable:** Test report with security coverage metrics (target: 80%+ coverage)

---

## Security Gates (MANDATORY)

Phases cannot proceed without security approval:

### **Phase 0 → 1:**
- ✅ Threat model completed (STRIDE methodology)
- ✅ Security architecture approved
- ✅ Privacy constraints documented

### **Phase 1 → 2:**
- ✅ Dependencies scanned (npm audit, Snyk)
- ✅ Zero critical or high severity CVEs
- ✅ License compliance verified
- ✅ Input validation framework chosen

### **Phase 2 → 3:**
- ✅ Backend hardened (auth, rate limiting, validation)
- ✅ Security checklist 100% complete:
  - Rate limiting implemented (all endpoints)
  - Input validation enforced (all user inputs)
  - SQL injection prevention verified
  - Strong password hashing (bcrypt 12+, Argon2id, or PBKDF2 310k+)
  - Constant-time comparisons (passwords, JWTs, keys)
  - CSRF protection implemented
  - Security headers configured (7 minimum)
  - Audit logging operational
  - No default secrets (fail startup if missing)
  - Error messages don't leak info

### **Phase 3 → 4:**
- ✅ Client-side security verified (no XSS, secure storage)
- ✅ E2E encryption validated
- ✅ No sensitive data in logs

### **Phase 4 → Production:**
- ✅ Penetration testing passed (no critical findings)
- ✅ OWASP ZAP scan clean
- ✅ Security documentation complete
- ✅ Incident response plan ready
- ✅ External audit approved (optional for beta, required for production)

---

## Handoff Format

Each agent should provide:
- Summary of findings
- Assumptions/unknowns
- Artifacts (selectors, formulas, code snippets, tests, **threat models**)
- Risks and recommended mitigations
- **NEW:** Security sign-off (APPROVE / REQUEST CHANGES / BLOCK)

---

## Security-First Culture

**Principles:**
1. **Security is everyone's responsibility** - Not just the security-engineer
2. **Fail fast** - Block phases if security concerns exist
3. **No custom crypto** - Use audited, standard libraries only (Web Crypto API, bcrypt, Argon2)
4. **Defense in depth** - Multiple layers of protection
5. **Least privilege** - Minimal permissions for everything
6. **Transparency** - Document security decisions openly
7. **Continuous improvement** - Learn from incidents and reviews

---

## Continuous Security Practices

**Daily:**
- Automated dependency scanning (GitHub Dependabot, Snyk)
- Static code analysis (ESLint security plugin, SonarQube)
- Secrets scanning (git-secrets, truffleHog)

**Per Pull Request:**
- Security-focused code review (OWASP Top 10 checklist)
- Automated security tests run
- SAST (Static Application Security Testing)
- No hardcoded secrets detected

**Weekly:**
- Failed authentication log review
- Dependency vulnerability review
- Security log analysis (audit_logs table)

**Monthly:**
- Penetration testing (automated or manual)
- Security posture review
- Threat model update (new features = new risks)

**Quarterly:**
- External security audit (if budget allows)
- Red team exercise (simulate attacks)
- Security training refresh for team

---

## Reference Documents

- **SECURITY_CHECKLISTS.md** - Detailed security checklists for each phase
- **SECURITY_REVIEW.md** - Comprehensive security review findings
- **AGENT_WORKFLOW_ENHANCEMENT_PROPOSAL.md** - Full proposal for this workflow

---

**Questions?** Consult the security-engineer agent or refer to SECURITY_CHECKLISTS.md.
