# Enhanced Agent Workflow Proposal

## Executive Summary

Based on comprehensive security review and remediation, we propose enhancing the agent workflow with **security-first practices** to prevent similar vulnerabilities in future development.

---

## Problem Analysis: What Went Wrong?

### Original Workflow Gap
The current `AGENTS.md` workflow focused on **functional correctness** but lacked **proactive security review**:

**Current Agents:**
- ✅ security-compliance (privacy, ToS boundaries)
- ✅ requirements-analyst (data needs, UX criteria)
- ✅ dom-mapper (DOM structure, selectors)
- ✅ tampermonkey-engineer (implementation)
- ✅ qa-validation (testing, regression prevention)
- ✅ code-reviewer (risks, regressions, tests)

**Missing:**
- ❌ Dedicated security engineer during implementation
- ❌ Security design review before coding
- ❌ Threat modeling in requirements phase
- ❌ Security gate between phases
- ❌ Continuous vulnerability scanning

### Issues That Slipped Through

**Phase 1 (Packages):**
- Weak PBKDF2 iterations (100k vs 310k)
- No dependency vulnerability scanning

**Phase 2 (Backend):**
- Catastrophic password hashing (trivial JS hash)
- No rate limiting (brute force vulnerable)
- Timing attacks in JWT/password comparison
- No input validation
- CSRF vulnerabilities
- Default secrets (dev-secret, admin-dev-key)
- No audit logging

**Phase 3 (Userscript):**
- Client-side password "hashing" inadequate

**Root Cause:** Security was **reactive** (found after implementation) rather than **proactive** (built-in from design).

---

## Proposed Solution: Security-First Workflow

### 1. Add New Agent: Security Engineer

**Role:** Proactive security expert embedded in every phase

**Responsibilities:**
- **Phase 0 (Architecture):** Security design review
  - Threat modeling (STRIDE methodology)
  - Authentication/authorization strategy validation
  - Crypto library and algorithm selection
  - Attack surface analysis
  - Data classification (PII, sensitive, public)
  
- **Phase 1 (Packages):** Supply chain security
  - Dependency vulnerability scanning (npm audit, Snyk)
  - License compliance verification
  - No custom crypto allowed (use audited libraries)
  - Validate input validation framework choice
  
- **Phase 2 (Backend):** Implementation security
  - Rate limiting enforcement checklist
  - Input validation review (all endpoints)
  - SQL injection prevention verification
  - Authentication security (bcrypt/argon2, constant-time comparison)
  - CSRF/XSS protection validation
  - Security headers configuration
  - Secrets management review
  - Audit logging completeness
  
- **Phase 3 (Frontend/Userscript):** Client-side security
  - No sensitive data in logs
  - XSS prevention verification
  - Secure storage usage (not localStorage for tokens)
  - HTTPS-only enforcement
  - Content Security Policy
  
- **Phase 4 (Pre-Production):** Offensive security
  - Penetration testing (OWASP ZAP, manual)
  - Security documentation review
  - Incident response plan creation
  - Deployment security checklist
  - External audit coordination

**When to Engage:**
- **EVERY phase** - Security is not optional
- **Before phase transitions** - Security gate approval required
- **Pull request reviews** - Security sign-off on all code changes
- **Incident response** - Lead security investigations

**Deliverables per Phase:**
- **Phase 0:** Threat model document, security architecture decisions
- **Phase 1:** Dependency audit report, no critical CVEs
- **Phase 2:** Security implementation checklist (100% complete)
- **Phase 3:** Client-side security audit report
- **Phase 4:** Penetration testing report, security sign-off

---

### 2. Enhance Existing Agents

#### Code-Reviewer → Senior Security-Aware Reviewer

**Original:**
- Review for risks, regressions, missing tests

**Enhanced:**
- **OWASP Top 10 Checklist** per PR
  - A01:2021 - Broken Access Control
  - A02:2021 - Cryptographic Failures
  - A03:2021 - Injection
  - A04:2021 - Insecure Design
  - A05:2021 - Security Misconfiguration
  - A06:2021 - Vulnerable Components
  - A07:2021 - Auth Failures
  - A08:2021 - Data Integrity Failures
  - A09:2021 - Logging Failures
  - A10:2021 - SSRF

- **Security Anti-Pattern Detection:**
  - Hardcoded secrets (API keys, passwords)
  - Non-constant-time comparisons
  - SQL string concatenation (SQL injection)
  - `eval()` or `innerHTML` usage (XSS)
  - Unvalidated user input
  - Missing rate limiting
  - Default credentials
  - Information leaks in error messages

- **Dependency Vulnerability Review:**
  - Check `npm audit` output
  - Verify no high/critical CVEs
  - Review license compliance

#### Security-Compliance → Privacy & Regulatory Compliance

**Original:**
- Privacy, read-only behavior, ToS boundaries

**Enhanced:**
- **GDPR Compliance:**
  - Right to access (data export)
  - Right to erasure (account deletion)
  - Data minimization (collect only necessary data)
  - Consent management (opt-in for sharing)
  - Data retention policies (auto-delete after 90 days)
  
- **Privacy by Design:**
  - E2E encryption validation
  - Local-first architecture verification
  - PII handling review
  - Cookie compliance (SameSite, Secure flags)
  
- **Terms of Service:**
  - No automation violations
  - Read-only compliance
  - User-owned accounts only

---

### 3. Security Gates Between Phases

**Phase 0 → 1:**
- ✅ Threat model completed
- ✅ Security architecture approved
- ✅ Crypto choices justified (no custom crypto)
- ✅ Authentication strategy validated
- ✅ Data classification documented

**Phase 1 → 2:**
- ✅ Dependencies scanned (npm audit, Snyk)
- ✅ Zero critical or high severity CVEs
- ✅ License compliance verified
- ✅ Input validation framework chosen
- ✅ Crypto package uses standard algorithms

**Phase 2 → 3:**
- ✅ Rate limiting implemented (all endpoints)
- ✅ Input validation enforced (all user inputs)
- ✅ SQL injection prevention verified
- ✅ Strong password hashing (bcrypt/argon2, 12+ rounds or PBKDF2 310k+)
- ✅ Constant-time comparisons (passwords, JWTs, keys)
- ✅ CSRF protection implemented
- ✅ Security headers configured (7 minimum)
- ✅ Audit logging operational
- ✅ No default secrets (fail startup if missing)
- ✅ Error messages don't leak info

**Phase 3 → 4:**
- ✅ No sensitive data in console logs
- ✅ XSS prevention verified
- ✅ Secure storage used (not localStorage for tokens)
- ✅ HTTPS-only communication
- ✅ Content Security Policy configured

**Phase 4 → Production:**
- ✅ Penetration testing passed (no critical findings)
- ✅ OWASP ZAP scan clean
- ✅ Security documentation complete
- ✅ Incident response plan ready
- ✅ External audit approved (optional for beta)
- ✅ Deployment security checklist verified

---

### 4. Security Checklists Per Phase

#### Phase 0: Security Architecture Checklist

**Authentication & Authorization:**
- [ ] Authentication strategy defined (JWT, OAuth, etc.)
- [ ] Password hashing algorithm chosen (bcrypt 12+, Argon2id, or PBKDF2 310k+)
- [ ] Token expiry policy defined (≤7 days recommended)
- [ ] Authorization model documented (RBAC, ABAC, etc.)
- [ ] Session management strategy (stateless JWT, server-side sessions)

**Cryptography:**
- [ ] Crypto library selected (use standard, audited libraries only)
- [ ] Encryption algorithm justified (AES-256-GCM recommended)
- [ ] Key derivation function chosen (PBKDF2, bcrypt, Argon2)
- [ ] Random number generation verified (crypto.getRandomValues)
- [ ] No custom crypto implementations (forbidden)

**Architecture:**
- [ ] Threat model created (STRIDE or PASTA methodology)
- [ ] Attack surface documented
- [ ] Trust boundaries identified
- [ ] Data flow diagrams created
- [ ] Sensitive data classified (PII, credentials, etc.)

---

#### Phase 1: Package Security Checklist

**Dependencies:**
- [ ] `npm audit` run, no critical/high CVEs
- [ ] Snyk scan completed (optional but recommended)
- [ ] Dependency tree reviewed (no suspicious packages)
- [ ] License compliance verified (MIT, Apache 2.0, etc.)
- [ ] Transitive dependencies checked (no vulnerable sub-dependencies)

**Package Selection:**
- [ ] Input validation library chosen (Zod, Joi, Yup)
- [ ] Crypto package uses Web Crypto API or bcrypt (no custom)
- [ ] HTTP client has timeout support (prevents DoS)
- [ ] Rate limiting library selected (if needed)
- [ ] Logging library doesn't leak sensitive data

---

#### Phase 2: Backend Security Checklist

**Authentication & Authorization:**
- [ ] Strong password hashing (bcrypt 12+, Argon2id, or PBKDF2 310k+)
- [ ] Constant-time comparison for passwords/tokens/keys
- [ ] JWT signed with strong secret (≥32 chars, not default)
- [ ] Token expiry enforced (≤7 days)
- [ ] Rate limiting on auth endpoints (5 attempts / 15 min)
- [ ] Account lockout after failures (10+ attempts)
- [ ] Progressive delays on failed logins
- [ ] No default secrets (fail startup if missing)

**Input Validation:**
- [ ] All user inputs validated (email, strings, numbers, etc.)
- [ ] Length limits enforced (email 254, strings 200, etc.)
- [ ] Control characters rejected (\u0000-\u001F)
- [ ] Payload size limit (1-10MB max)
- [ ] JSON depth limiting (max 10 levels)
- [ ] SQL injection prevention (prepared statements only)
- [ ] XSS prevention (escape output if rendered)

**API Security:**
- [ ] Rate limiting on all endpoints (documented limits)
- [ ] CSRF protection (Origin header validation)
- [ ] Content-Type validation (require application/json)
- [ ] Security headers configured (X-Content-Type-Options, X-Frame-Options, HSTS, CSP, X-XSS-Protection, Referrer-Policy, Permissions-Policy)
- [ ] CORS policy documented (whitelist origins)
- [ ] Error messages don't leak sensitive info

**Data Protection:**
- [ ] Sensitive data encrypted at rest (if stored)
- [ ] Passwords never logged
- [ ] Tokens truncated in logs (first 10 chars only)
- [ ] PII handling compliant (GDPR if applicable)
- [ ] Audit logging implemented (failed logins, data access, admin actions)

**Infrastructure:**
- [ ] Secrets management (environment variables, not hardcoded)
- [ ] Database connection encrypted (TLS/SSL)
- [ ] HTTPS enforced (HSTS header)
- [ ] Startup validation (secrets exist, not defaults)

---

#### Phase 3: Frontend/Userscript Security Checklist

**Data Handling:**
- [ ] No sensitive data in console.log()
- [ ] No credentials in localStorage (use GM_storage or secure cookies)
- [ ] No hardcoded API keys or secrets
- [ ] E2E encryption verified (client-side encrypt before send)
- [ ] Passphrases never sent to server (only hash or derived key)

**Communication:**
- [ ] HTTPS-only (no mixed content)
- [ ] Certificate validation enforced
- [ ] CORS headers validated
- [ ] API endpoints use authentication (Bearer token)

**XSS Prevention:**
- [ ] No `innerHTML` with user data (use `textContent`)
- [ ] No `eval()` or `Function()` constructor
- [ ] User input escaped before rendering
- [ ] Content Security Policy configured (if applicable)

**Tampermonkey-Specific:**
- [ ] `@grant` permissions minimal (least privilege)
- [ ] `@connect` only to required domains
- [ ] No execution of external scripts
- [ ] DOM selectors stable (fallbacks documented)

---

#### Phase 4: Pre-Production Security Checklist

**Testing:**
- [ ] Penetration testing completed (OWASP ZAP or manual)
- [ ] Security test suite passing (auth, rate limiting, injection)
- [ ] Timing attack resistance verified
- [ ] Race condition testing (concurrent requests)
- [ ] Error handling comprehensive (no stack traces leaked)

**Documentation:**
- [ ] Security architecture documented
- [ ] API rate limits documented
- [ ] Incident response plan created
- [ ] Deployment security checklist verified
- [ ] Security contact/disclosure policy published

**Deployment:**
- [ ] Secrets rotated (JWT_SECRET, ADMIN_KEY)
- [ ] Database backups configured
- [ ] Monitoring/alerting set up (failed logins, API errors)
- [ ] HTTPS certificate valid (not self-signed)
- [ ] Security headers verified in production

**External Review:**
- [ ] Code review by security expert (if available)
- [ ] Third-party audit (optional for public beta)
- [ ] Bug bounty program considered (for mature products)

---

### 5. Continuous Security Practices

**Daily:**
- [ ] Automated dependency scanning (GitHub Dependabot, Snyk)
- [ ] Static code analysis (ESLint security plugin, SonarQube)
- [ ] Secrets scanning (git-secrets, truffleHog)

**Per Pull Request:**
- [ ] Security-focused code review (OWASP Top 10 checklist)
- [ ] Automated security tests run
- [ ] SAST (Static Application Security Testing)
- [ ] No hardcoded secrets detected

**Weekly:**
- [ ] Failed authentication log review
- [ ] Dependency vulnerability review
- [ ] Security log analysis (audit_logs table)

**Monthly:**
- [ ] Penetration testing (automated or manual)
- [ ] Security posture review
- [ ] Threat model update (new features = new risks)

**Quarterly:**
- [ ] External security audit (if budget allows)
- [ ] Red team exercise (simulate attacks)
- [ ] Security training refresh for team

---

## Updated AGENTS.md (Proposed)

```markdown
# Agents Workflow (Security-First)

This repo uses a **security-first** multi-agent workflow. Security review is **mandatory** at every phase—not optional.

## Core Principle

**"Security is not a phase; it's a practice."**

Every agent is responsible for security within their domain. The **security-engineer** agent provides oversight and specialization.

---

## Agents

### 🔒 Security-Engineer (NEW - Primary Security Agent)

**Role:** Proactive security expert embedded in every phase

**Responsibilities:**
- Threat modeling (STRIDE methodology)
- Security design review before implementation
- Cryptography review and guidance
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

---

### 👨‍💻 Code-Reviewer (Enhanced)

**Original:** Senior-level review for risks, regressions, missing tests

**Enhanced:**
- **OWASP Top 10 checklist** per PR (mandatory)
- Security anti-pattern detection (hardcoded secrets, timing attacks, SQL injection, XSS)
- Dependency vulnerability review (npm audit, Snyk)
- Cryptography misuse detection
- Authentication/authorization flaw identification

**Deliverable:** Code review report with security sign-off

---

### 🛡️ Security-Compliance (Enhanced)

**Original:** Privacy, read-only behavior, ToS boundaries

**Enhanced:**
- **GDPR compliance** (right to access, erasure, data minimization)
- Privacy by design validation (E2E encryption, local-first)
- PII handling review
- Cookie compliance (SameSite, Secure)
- Data retention policies

**Deliverable:** Privacy compliance report

---

### 📋 Requirements-Analyst

**Responsibilities:** Data needs, computation rules, UX acceptance criteria

**Security Integration (NEW):**
- Flag sensitive data requirements
- Document data classification (PII, public, internal)
- Identify compliance requirements (GDPR, CCPA)

---

### 🗺️ DOM-Mapper

**Responsibilities:** DOM structure, selectors, fallback strategies

**Security Integration (NEW):**
- Document XSS risks in DOM manipulation
- Validate selector stability (prevent injection)

---

### 🔧 Tampermonkey-Engineer

**Responsibilities:** Userscript implementation

**Security Integration (NEW):**
- Follow frontend security checklist
- No sensitive data in logs
- Secure storage usage (GM_storage, not localStorage)

---

### ✅ QA-Validation (Enhanced)

**Original:** Test cases, regression prevention

**Enhanced:**
- Security test suite execution
- Timing attack resistance testing
- Rate limiting validation
- Input validation edge cases
- Concurrent request testing (race conditions)

**Deliverable:** Test report with security coverage metrics

---

## Workflow (Updated)

**0. Safety + Scope Gate** (security-compliance)
   - Confirm read-only, user-owned accounts, ToS compliance
   - Define privacy constraints

**1. Requirements Discovery** (requirements-analyst)
   - Clarify data needs, UX criteria
   - **NEW:** Flag sensitive data, compliance requirements

**2. Security Design Review** (🔒 NEW - security-engineer)
   - Threat modeling (STRIDE)
   - Authentication/authorization strategy
   - Cryptography selection
   - Attack surface analysis
   - **GATE:** Approve before Phase 3

**3. DOM + Data Mapping** (dom-mapper)
   - Identify selectors, fallbacks
   - **NEW:** Document XSS risks

**4. Script Implementation** (tampermonkey-engineer, backend team)
   - Build userscript, backend, packages
   - Follow security checklists (per phase)

**5. Security Code Review** (🔒 security-engineer + code-reviewer)
   - OWASP Top 10 checklist
   - Security anti-pattern detection
   - Cryptography review
   - **GATE:** Approve before Phase 6

**6. Testing + Validation** (qa-validation + 🔒 security-engineer)
   - Functional tests
   - Security tests (penetration, timing, race conditions)
   - **GATE:** Approve before Phase 7

**7. Penetration Testing** (🔒 NEW - security-engineer)
   - OWASP ZAP scan
   - Manual exploitation attempts
   - Security documentation review
   - **GATE:** Approve before Production

**8. Maintenance Plan**
   - Document selector updates, security monitoring

---

## Security Gates (MANDATORY)

Phases cannot proceed without security approval:

**Phase 0 → 1:**
- ✅ Threat model completed
- ✅ Security architecture approved

**Phase 1 → 2:**
- ✅ Dependencies scanned, no critical CVEs
- ✅ License compliance verified

**Phase 2 → 3:**
- ✅ Backend hardened (auth, rate limiting, validation)
- ✅ Security checklist 100% complete

**Phase 3 → 4:**
- ✅ Client-side security verified (no XSS, secure storage)
- ✅ E2E encryption validated

**Phase 4 → Production:**
- ✅ Penetration testing passed
- ✅ External audit approved (optional for beta)
- ✅ Incident response plan ready

---

## Security Checklists

Detailed checklists for each phase are maintained in `SECURITY_CHECKLISTS.md`.

**Per-Phase Requirements:**
- **Phase 0:** Authentication strategy, cryptography choices, threat model
- **Phase 1:** Dependency scanning, no critical CVEs, license compliance
- **Phase 2:** Rate limiting, input validation, SQL injection prevention, strong auth, CSRF protection, security headers, audit logging, no default secrets
- **Phase 3:** No sensitive data in logs, secure storage, HTTPS-only, XSS prevention
- **Phase 4:** Penetration testing, security documentation, incident response plan

---

## Continuous Security

**Daily:**
- Automated dependency scanning (Dependabot)
- Static code analysis (ESLint security)

**Per PR:**
- Security code review (OWASP Top 10)
- Automated security tests

**Weekly:**
- Security log review (failed logins, API errors)

**Monthly:**
- Penetration testing

**Quarterly:**
- External audit, red team exercise

---

## Handoff Format (Updated)

Each agent provides:
- Summary of findings
- Assumptions/unknowns
- Artifacts (selectors, formulas, code, **threat models**)
- Risks and recommended mitigations
- **NEW:** Security sign-off (approve/request changes/block)

---

## Security-First Culture

**Principles:**
1. **Security is everyone's responsibility** - Not just the security-engineer
2. **Fail fast** - Block phases if security concerns exist
3. **No custom crypto** - Use audited, standard libraries only
4. **Defense in depth** - Multiple layers of protection
5. **Least privilege** - Minimal permissions for everything
6. **Transparency** - Document security decisions openly
7. **Continuous improvement** - Learn from incidents and reviews

---

**Questions?** Consult the security-engineer agent or refer to SECURITY_CHECKLISTS.md.
```

---

## Implementation Plan

### Immediate (Week 1):
1. ✅ Update `AGENTS.md` with new security-engineer role
2. ✅ Create `SECURITY_CHECKLISTS.md` with detailed checklists
3. ✅ Document security gates in workflow

### Short-term (Weeks 2-4):
4. ⏳ Integrate automated security scanning (npm audit, ESLint security)
5. ⏳ Create security test templates
6. ⏳ Train existing agents on security practices
7. ⏳ Set up GitHub Actions for automated security checks

### Long-term (Months 2-3):
8. ⏳ Establish external security audit process
9. ⏳ Create incident response playbook
10. ⏳ Set up continuous security monitoring (Snyk, Datadog, etc.)
11. ⏳ Launch bug bounty program (after production launch)

---

## Success Metrics

**Immediate (After Implementation):**
- Zero critical security issues escape to production
- 100% security checklist completion before phase transitions
- Security gate approvals documented

**Short-term (3 months):**
- Automated security tests run on every PR
- Dependency vulnerabilities detected within 24 hours
- Security incidents responded to within 1 hour

**Long-term (6 months):**
- External audit with zero critical findings
- Bug bounty program launched (no critical bugs found)
- Security training completed by all contributors

---

## Cost-Benefit Analysis

**Cost:**
- **Time:** ~10-20% increase in development time (security reviews, testing)
- **Resources:** Security tools (Snyk: $0-$99/mo, pen testing: $500-$5000/audit)
- **Training:** Security workshops ($500-$2000 per person)

**Benefit:**
- **Risk Reduction:** Prevent breaches ($4.45M average cost per IBM 2023 report)
- **Trust:** Users feel confident sharing financial data
- **Compliance:** GDPR/CCPA fines avoided ($20M+ potential)
- **Reputation:** No security incidents damaging brand
- **Insurance:** Lower cyber insurance premiums

**ROI:** Preventing a single data breach pays for years of security investment.

---

## Lessons Learned

**What Worked:**
- ✅ Comprehensive security review caught all issues before production
- ✅ Agent-based delegation allowed specialized security focus
- ✅ Security checklists provided clear guidance

**What Needs Improvement:**
- ❌ Security should be **proactive, not reactive**
- ❌ Need **automated scanning** in CI/CD pipeline
- ❌ Security training for all developers

**Key Takeaway:**
**"Build security in from day one, not bolt it on at the end."**

---

## Conclusion

The proposed security-first workflow **prevents vulnerabilities by design** rather than finding them by accident. The security-engineer agent provides:

1. **Proactive threat modeling** before coding
2. **Continuous security review** during development
3. **Comprehensive testing** before deployment
4. **Security gates** that block unsafe code from shipping

**Recommendation:** Adopt this workflow immediately for all future development.

**Next Steps:**
1. Review and approve this proposal
2. Update `AGENTS.md` with new workflow
3. Create `SECURITY_CHECKLISTS.md` reference
4. Train team on security-first practices
5. Integrate automated security tools (Dependabot, Snyk, ESLint security)

---

**Prepared by:** Security Engineering Team  
**Date:** 2026-01-28  
**Status:** Pending Approval

