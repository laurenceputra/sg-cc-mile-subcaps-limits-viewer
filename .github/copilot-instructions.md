# Copilot Instructions

- Follow the security-first workflow in [AGENTS.md](../AGENTS.md).
- Use the canonical workflow gates in [docs/workflow/gates.md](../docs/workflow/gates.md).
- Use the canonical handoff contract in [docs/workflow/handoff-format.md](../docs/workflow/handoff-format.md).
- Use the skill catalog in [.agents/skills/README.md](../.agents/skills/README.md).
- Before applying a skill, open its `.agents/skills/<skill>/SKILL.md` and follow the workflow and guardrails inside.
- When a task spans multiple phases, select skills using the **Phase ↔ Skills Mapping** in AGENTS.md.
- For UI/card-affecting changes, apply the mandatory design gates in `docs/workflow/gates.md`: config-first decisions, per-surface reuse, and card parity checks.
- For backend worker test changes, apply the mandatory test design and anti-pattern gates in `docs/workflow/gates.md` and block approval on failures.
- Treat card differences as config-driven whenever feasible; avoid ad-hoc branching when config can express the behavior.
- Reuse UI code within each surface (userscript ↔ userscript, dashboard ↔ dashboard); cross-surface runtime code sharing is not required.
- Keep data handling local-first by default; allow optional remote sync/auth flows only when explicitly approved, encrypted, and aligned with AGENTS.md privacy controls.
- Never add remote logging for sensitive data.
