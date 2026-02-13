# Copilot Instructions

- Follow the security-first workflow in [AGENTS.md](../AGENTS.md).
- Use the **Skills Directory** table in AGENTS.md as the canonical index of available skills.
- Before applying a skill, open its `.agents/skills/<skill>/SKILL.md` and follow the workflow and guardrails inside.
- When a task spans multiple phases, select skills using the **Phase ↔ Skills Mapping** in AGENTS.md.
- For UI/card-affecting changes, apply the mandatory design gates in AGENTS.md: config-first decisions, per-surface reuse, and card parity checks.
- Treat card differences as config-driven whenever feasible; avoid ad-hoc branching when config can express the behavior.
- Reuse UI code within each surface (userscript ↔ userscript, dashboard ↔ dashboard); cross-surface runtime code sharing is not required.
