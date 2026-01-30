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
- **Follow security checklists:** See `apps/backend/SECURITY.md` for backend security controls and `TECHNICAL.md` for userscript technical guidance.
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

**Start-of-task checklist**
- Confirm AGENTS.md reviewed before beginning any new work.

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
- Follow frontend security guidance in `TECHNICAL.md`
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

### 🔴 Red-Team (NEW - Adversarial Testing Agent)

**Role:** Think like an attacker. Break the system. Find weaknesses before real adversaries do.

**Mindset:** Adversarial - actively seeks to bypass security controls and exploit vulnerabilities

**Responsibilities:**
- Attack simulation (injection, XSS, CSRF, auth bypass)
- Edge case exploitation (race conditions, overflow, type confusion)
- Business logic attacks (workflow bypass, price manipulation)
- Cryptography attacks (timing attacks, weak RNG)
- API fuzzing and boundary testing
- Proof-of-concept exploit development

**Attack Categories:**
- Authentication & Authorization Attacks
- Injection Attacks (SQL, NoSQL, XSS, Command, Path Traversal)
- Input Validation Attacks (oversized inputs, control chars, unicode)
- Business Logic Attacks (race conditions, state confusion)
- Cryptography Attacks (timing, padding oracle)
- API & Web Attacks (CSRF, clickjacking, SSRF, XXE)
- Denial of Service (algorithmic complexity, resource exhaustion)

**Deliverables:**
- Penetration testing report with all findings
- Proof-of-concept exploits
- Risk assessment with business impact
- Prioritized remediation roadmap
- Retest results after fixes

**When to Engage:**
- Phase 6: Security testing (comprehensive attack simulation)
- Phase 7: Pre-production penetration testing
- Monthly: Continuous red team exercises
- After Major Features: Test new attack surfaces

---

### ⚡ Performance-Engineer (NEW - Optimization Specialist)

**Role:** Ensure the application is fast, efficient, and scalable

**Responsibilities:**
- Performance profiling (CPU, memory, network)
- Frontend optimization (bundle size, Core Web Vitals)
- Backend optimization (database queries, API latency)
- Algorithm optimization (identify O(n²) patterns)
- Resource management (memory leaks, CPU usage)
- Load testing and scalability analysis

**Performance Budgets:**
- Total Bundle Size: < 200 KB (gzipped)
- Time to Interactive: < 3 seconds
- API Response Time: < 200 ms (p95)
- Database Query Time: < 50 ms (p95)

**Deliverables:**
- Performance audit report
- Bottleneck analysis with recommendations
- Optimized code with before/after benchmarks
- Load testing results
- Monitoring dashboard recommendations

**When to Engage:**
- Phase 4: Implementation review for performance
- Phase 6: Load testing and optimization
- Pre-release: Performance regression testing
- Continuous: Monitor production metrics

---

### ♿ Accessibility-Validator (NEW - Inclusive Design Expert)

**Role:** Ensure the application is accessible to all users, including those with disabilities

**Responsibilities:**
- WCAG 2.1 Level AA compliance testing
- Screen reader testing (NVDA, JAWS, VoiceOver)
- Keyboard navigation validation
- Color contrast checking
- ARIA implementation review
- Focus management verification

**Testing Coverage:**
- All 50 WCAG 2.1 AA success criteria
- Keyboard-only navigation
- Screen reader compatibility
- Color contrast ratios (4.5:1 minimum)
- Touch target sizes (44x44 pixels)

**Deliverables:**
- WCAG 2.1 AA compliance report
- Accessibility audit with violations
- Screen reader testing results
- Remediation recommendations with code examples
- Accessible component library guidance

**When to Engage:**
- Phase 2: Design review for accessibility
- Phase 4: Implementation accessibility review
- Phase 6: Comprehensive accessibility testing
- Continuous: Accessibility regression testing

---

### 📚 Documentation-Writer (NEW - Technical Writing Specialist)

**Role:** Create clear, accurate, and comprehensive documentation

**Responsibilities:**
- User documentation (guides, tutorials, FAQ)
- Developer documentation (API docs, architecture, ADRs)
- Process documentation (contribution guidelines, runbooks)
- Code comments and inline documentation
- Changelog and migration guide maintenance
- Documentation synchronization with code changes

**Documentation Types:**
- Getting Started Guides
- API Reference Documentation
- Architecture Decision Records (ADRs)
- Troubleshooting Guides
- Security Documentation
- Runbooks and Operational Procedures

**Deliverables:**
- Updated documentation for all changes
- API reference documentation
- Architecture Decision Records
- User guides and tutorials
- Migration guides for breaking changes
- Link checker results

**When to Engage:**
- All Phases: Document decisions and changes
- Phase 4: API documentation updates
- Pre-release: Changelog and migration guides
- Continuous: Keep docs synchronized

---

### 📦 Dependency-Manager (NEW - Supply Chain Security)

**Role:** Manage dependencies, monitor vulnerabilities, ensure license compliance

**Responsibilities:**
- Vulnerability monitoring (npm audit, Snyk)
- Dependency updates (automated and manual)
- License compliance tracking
- Supply chain security (verify packages, detect typosquatting)
- SBOM (Software Bill of Materials) generation
- Emergency response for compromised packages

**Monitoring:**
- Daily automated security audits
- Weekly dependency update reviews
- Monthly license compliance audits
- Continuous CVE monitoring

**Deliverables:**
- Security audit reports
- Dependency update PRs
- License compliance report
- SBOM (Software Bill of Materials)
- CVE tracking with remediation plans
- Emergency response procedures

**When to Engage:**
- Phase 1: Initial dependency audit
- Phase 4: Pre-implementation dependency review
- Weekly: Dependency update reviews
- Daily: Automated vulnerability scans
- Emergency: Compromised package response

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

- **apps/backend/SECURITY.md** - Backend security controls and operational guidance
- **TECHNICAL.md** - Userscript technical reference
- **PHASES_4B_5_COMPLETE.md** - Current project status

---

**Questions?** Consult the security-engineer agent or refer to the security docs above.

---

## Red Team Analysis & Agent Group Improvements (2026-01-30)

### Executive Summary

A comprehensive red team analysis of the agent group structure identified **7 critical gaps** in the workflow. Six new agents have been implemented to address these gaps, strengthening the security posture, improving code quality, and enhancing operational excellence.

### Gaps Identified

#### 1. ❌ Missing Security-Engineer Agent File
**Status:** ✅ FIXED
- **Issue:** AGENTS.md extensively referenced a security-engineer agent, but no agent file existed
- **Impact:** Security gates couldn't be enforced, no centralized security expertise
- **Solution:** Created `.github/agents/security-engineer.agent.md` with comprehensive security responsibilities

#### 2. ❌ No Adversarial Testing Agent
**Status:** ✅ FIXED
- **Issue:** No dedicated agent for red team activities and adversarial testing
- **Impact:** Vulnerabilities discovered by defenders, not attackers; reactive security
- **Solution:** Created `.github/agents/red-team.agent.md` for proactive attack simulation

#### 3. ❌ Missing Performance Perspective
**Status:** ✅ FIXED
- **Issue:** No agent focused on optimization, scalability, and resource efficiency
- **Impact:** Performance issues discovered in production; no performance budgets
- **Solution:** Created `.github/agents/performance-engineer.agent.md` with profiling and optimization

#### 4. ❌ No Accessibility Coverage
**Status:** ✅ FIXED
- **Issue:** No agent ensuring WCAG compliance and inclusive design
- **Impact:** Potential accessibility violations; excluding users with disabilities
- **Solution:** Created `.github/agents/accessibility-validator.agent.md` for WCAG 2.1 AA compliance

#### 5. ❌ Documentation Maintenance Gap
**Status:** ✅ FIXED
- **Issue:** No agent responsible for keeping documentation synchronized with code
- **Impact:** Outdated docs; poor developer experience; support burden
- **Solution:** Created `.github/agents/documentation-writer.agent.md` for comprehensive docs

#### 6. ❌ Dependency Management Blind Spot
**Status:** ✅ FIXED
- **Issue:** No agent monitoring dependencies for vulnerabilities and license compliance
- **Impact:** Supply chain vulnerabilities; license violations; outdated packages
- **Solution:** Created `.github/agents/dependency-manager.agent.md` for vulnerability monitoring

#### 7. ⚠️ Incident Response Coordination Gap
**Status:** 🟡 PARTIALLY ADDRESSED
- **Issue:** No clear incident response coordination across agents
- **Impact:** Delayed response to security incidents; unclear escalation paths
- **Mitigation:** Security-engineer agent now has incident response leadership responsibility
- **Recommendation:** Consider dedicated incident-response agent for large-scale incidents

### New Agent Summary

| Agent | Phase | Gate Authority | Key Responsibility |
|-------|-------|----------------|-------------------|
| **security-engineer** | Security | ✅ Yes | Threat modeling, security gates, pen testing |
| **red-team** | Adversarial Testing | ❌ No | Attack simulation, exploit development |
| **performance-engineer** | Optimization | ❌ No | Performance profiling, load testing |
| **accessibility-validator** | Validation | ❌ No | WCAG compliance, screen reader testing |
| **documentation-writer** | Documentation | ❌ No | Technical writing, doc maintenance |
| **dependency-manager** | Maintenance | ❌ No | Vulnerability monitoring, license compliance |

### Workflow Improvements

#### Enhanced Security Depth
- **Before:** Security handled by security-compliance agent (policy focus)
- **After:** Multi-layered security with security-engineer (technical) + security-compliance (policy) + red-team (adversarial)
- **Benefit:** Defense in depth with proactive vulnerability discovery

#### Quality Assurance Expansion
- **Before:** QA-validation focused on functional testing
- **After:** QA + performance-engineer + accessibility-validator
- **Benefit:** Comprehensive quality coverage (functionality + performance + accessibility)

#### Operational Excellence
- **Before:** No systematic dependency or documentation management
- **After:** Dedicated agents for dependencies and documentation
- **Benefit:** Reduced technical debt, better developer experience

### Red Team Methodology

The new red-team agent employs a structured attack methodology:

1. **Reconnaissance:** Map attack surfaces
2. **Vulnerability Scanning:** Automated tool runs (OWASP ZAP, SQLMap)
3. **Manual Exploitation:** Custom payload crafting
4. **Privilege Escalation:** Attempt to gain admin access
5. **Impact Assessment:** Demonstrate business impact

**Attack Coverage:**
- 7 attack categories (Auth, Injection, Input Validation, Business Logic, Crypto, API, DoS)
- 100+ attack variations
- OWASP Top 10 comprehensive testing
- Proof-of-concept exploit development

### Continuous Improvement Recommendations

#### Short Term (1-3 months)
1. **Implement Automated Agent Coordination**
   - Create agent orchestration workflow
   - Define clear handoff protocols
   - Automate agent triggering based on phase

2. **Establish Performance Budgets**
   - Set and enforce bundle size limits in CI
   - Implement performance regression testing
   - Create real user monitoring dashboard

3. **Accessibility CI Integration**
   - Add automated accessibility tests to CI/CD
   - Implement axe-core in test suite
   - Fail builds on critical a11y violations

#### Medium Term (3-6 months)
4. **Dependency Automation**
   - Configure Dependabot/Renovate
   - Auto-merge patch updates
   - Weekly dependency review meetings

5. **Documentation as Code**
   - Generate API docs from code comments
   - Implement doc linting in CI
   - Track documentation coverage metrics

6. **Red Team Exercises**
   - Monthly mini penetration tests
   - Quarterly comprehensive security audits
   - Bug bounty program (if resources allow)

#### Long Term (6-12 months)
7. **Agent Metrics Dashboard**
   - Track agent effectiveness metrics
   - Measure time-to-remediation
   - Identify workflow bottlenecks

8. **External Validation**
   - Third-party security audit
   - External accessibility audit
   - Performance benchmark comparison

9. **AI-Assisted Agent Enhancement**
   - Train agents on project-specific patterns
   - Implement automated vulnerability detection
   - Create smart agent recommendations

### Success Metrics

Track these metrics to measure agent effectiveness:

**Security Metrics:**
- Time to detect vulnerabilities (MTTD)
- Time to remediate vulnerabilities (MTTR)
- Number of vulnerabilities found in production (goal: 0)
- Security gate blocking rate

**Performance Metrics:**
- Core Web Vitals scores (LCP, FID, CLS)
- API p95 latency
- Time to Interactive (TTI)
- Performance regression count

**Accessibility Metrics:**
- WCAG compliance percentage
- Accessibility violations by severity
- Screen reader test pass rate
- Keyboard navigation coverage

**Operational Metrics:**
- Dependency update frequency
- Critical CVE response time
- Documentation coverage percentage
- Support ticket reduction (better docs)

### Conclusion

The agent group has been significantly strengthened with six new specialized agents. The workflow now provides comprehensive coverage across security (defense + offense), quality (functionality + performance + accessibility), and operations (dependencies + documentation).

**Key Improvements:**
- ✅ Defense in depth security (3 security-focused agents)
- ✅ Proactive vulnerability discovery (red-team agent)
- ✅ Performance optimization (performance-engineer agent)
- ✅ Inclusive design (accessibility-validator agent)
- ✅ Operational excellence (dependency-manager + documentation-writer)

**Next Steps:**
1. Integrate new agents into CI/CD pipeline
2. Establish agent coordination protocols
3. Train team on new agent capabilities
4. Measure and iterate on agent effectiveness

---

**Last Updated:** 2026-01-30  
**Review Frequency:** Quarterly  
**Next Review:** 2026-04-30
