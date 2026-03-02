# Skills Catalog

Use this catalog to choose a skill quickly. Gate and policy details are centralized in `docs/workflow/gates.md` and handoff structure is in `docs/workflow/handoff-format.md`.

## Core Skills

Core skills map directly to a mandatory workflow phase or gate path.

| Skill | Use When | Link |
| --- | --- | --- |
| requirements-researcher | Scope is ambiguous and needs constraints/trade-offs before specification. | [.agents/skills/requirements-researcher/SKILL.md](requirements-researcher/SKILL.md) |
| implementation-engineer | Implementing a feature/fix across userscript/backend/contracts. | [.agents/skills/implementation-engineer/SKILL.md](implementation-engineer/SKILL.md) |
| code-review | Reviewing correctness, maintainability, and dependency/test risk. | [.agents/skills/code-review/SKILL.md](code-review/SKILL.md) |
| qa-testing | Validating behavior, regression risk, and coverage quality. | [.agents/skills/qa-testing/SKILL.md](qa-testing/SKILL.md) |
| security-risk | Running threat/risk analysis and security gate decisions. | [.agents/skills/security-risk/SKILL.md](security-risk/SKILL.md) |
| documentation | Updating developer/user docs and process docs. | [.agents/skills/documentation/SKILL.md](documentation/SKILL.md) |
| release-management | Coordinating release readiness for schema/auth/deploy risk. | [.agents/skills/release-management/SKILL.md](release-management/SKILL.md) |

## Situational Skills

Situational skills are selected only when task scope explicitly includes that concern.

| Skill | Use When | Link |
| --- | --- | --- |
| debugging-assistant | Root-cause analysis is needed for failures or environment drift. | [.agents/skills/debugging-assistant/SKILL.md](debugging-assistant/SKILL.md) |
| userscript-implementation | Work is userscript-specific (Tampermonkey metadata, CSP, DOM extraction). | [.agents/skills/userscript-implementation/SKILL.md](userscript-implementation/SKILL.md) |
| ux-accessibility | UI changes need keyboard/focus/contrast/semantics checks. | [.agents/skills/ux-accessibility/SKILL.md](ux-accessibility/SKILL.md) |
| performance-optimization | Performance bottlenecks or budgets must be measured and improved. | [.agents/skills/performance-optimization/SKILL.md](performance-optimization/SKILL.md) |
| network-resilience | Timeouts/retries/offline/recovery behavior needs hardening. | [.agents/skills/network-resilience/SKILL.md](network-resilience/SKILL.md) |
| refactoring-expert | Internal structure needs behavior-preserving cleanup. | [.agents/skills/refactoring-expert/SKILL.md](refactoring-expert/SKILL.md) |
| spec-writer | Writing or updating implementation plans/specification docs. | [.agents/skills/spec-writer/SKILL.md](spec-writer/SKILL.md) |

## Canonical References

- Workflow and mandatory gates: `docs/workflow/gates.md`
- Handoff contract: `docs/workflow/handoff-format.md`
- Workflow orchestration and phase mapping: `AGENTS.md`
