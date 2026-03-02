---
name: security-risk
description: "Combine security scanning and threat modeling for changes involving data handling, API interception, sync, storage, authentication, encryption, and auth/session token lifecycle design."
license: MIT
tags:
  - security
  - privacy
  - threat-modeling
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.0.0
---

# Security Risk

Identify security and privacy risks and propose mitigations.

## Workflow
1. Review data flows and trust boundaries.
2. Scan for injection, logging, and secret-handling risks.
3. Review auth/session lifecycle controls where applicable:
   - access token TTL and scope
   - refresh token rotation and reuse detection
   - cookie flags (`HttpOnly`, `Secure`, `SameSite`)
   - revocation/logout behavior
   - inactivity/session-expiry semantics
4. Verify abuse resistance:
   - rate limiting
   - CSRF/origin protections
   - auditability and incident response signals
5. Summarize risks, mitigations, and residual risk.

## Phase 4 Security Testing Gate (Mandatory)
- Run OWASP ZAP scan coverage for changed attack surfaces.
- Run manual penetration testing for auth/session, injection, authorization, and business-logic abuse paths.
- Include attack simulation evidence for high-risk paths.
- Gate criteria:
  - `APPROVE`: no critical exploitable findings and residual risk accepted.
  - `REQUEST CHANGES`: high/medium findings require mitigation before release.
  - `BLOCK`: any critical exploitable vulnerability remains.

## Backend/Auth/Schema Workflow Tightening (Mandatory when applicable)
- Enforce **Schema Compatibility Gate** with forward migration verification.
- Enforce **Preview Smoke Gate** for `/login`, auth refresh/session, and protected data paths.
- Enforce **Environment Parity Gate** for bindings/secrets/runtime assumptions.
- Enforce **Failure-Mode Requirement** with symptom/detection/rollback documentation.
- Enforce **Post-Deploy Observation Gate** with endpoint error-rate monitoring and blocker handling for unexplained 5xx spikes.

## Verification Default
- Run the most relevant verification commands by default and report results.
- Do not ask permission to run tests/security checks.
- Only skip verification when explicitly requested.
- Always include exact command(s) and short outcome summaries.

## Output Format
- Risks identified (severity-ranked)
- Mitigations and required controls
- Residual risk and acceptance rationale
- Gate Decision (`APPROVE` / `REQUEST CHANGES` / `BLOCK`)
- Security Sign-off (`APPROVE` / `REQUEST CHANGES` / `BLOCK`)

## References
- [Threat modeling worksheet](references/threat-model.md)
