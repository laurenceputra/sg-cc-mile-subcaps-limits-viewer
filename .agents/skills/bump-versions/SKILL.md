---
name: bump-versions
description: Bump repository version fields in lockstep for patch/minor/major releases, including root and workspace package.json files, package-lock.json headers and workspace entries, and userscript @version headers. Use when preparing a release, syncing mismatched version fields, or updating this repo after a version change.
---

# Bump Versions

## Overview

Keep every release-facing version field aligned. Use this skill when the repo version changes or when one version source drifts from the rest.

## Workflow

1. Decide the target version.
   - Use an explicit semver when given.
   - Use `patch` by default when the user asks to bump versions without naming a level.
2. Run the bundled script from the repo root.
   - Explicit version: `python .agents/skills/bump-versions/scripts/bump_versions.py --version 1.2.3`
   - Automatic bump: `python .agents/skills/bump-versions/scripts/bump_versions.py --bump patch`
3. Review the diff before committing.
   - Root `package.json`
   - Workspace `package.json` files
   - `package-lock.json` root and workspace package entries
   - `*.user.js` `@version` headers
4. If the repo adds new versioned files later, update the script first, then this skill.

## Notes

- Keep the userscript `@version` aligned with the repo version unless the user explicitly wants them to diverge.
- Do not touch dependency version numbers inside `package-lock.json`; only update package metadata versions.
- If the requested version already matches all targets, report that nothing changed.
