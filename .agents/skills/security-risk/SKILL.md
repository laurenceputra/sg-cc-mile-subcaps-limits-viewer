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

## Output Format
- Risks identified (severity-ranked)
- Mitigations and required controls
- Residual risk and acceptance rationale
- Security gate recommendation (`APPROVE` / `REQUEST CHANGES` / `BLOCK`)

## References
- [Threat modeling worksheet](references/threat-model.md)
