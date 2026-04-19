#!/usr/bin/env python3
"""Bump repository version fields in lockstep.

Updates:
- root package.json version
- workspace package.json versions (as defined by root workspaces)
- package-lock.json root + workspace package entries
- userscript @version headers in *.user.js files

Usage:
  python bump_versions.py --bump patch
  python bump_versions.py --version 1.2.3
  python bump_versions.py --dry-run
"""

from __future__ import annotations

import argparse
import glob
import json
import re
from pathlib import Path
from typing import Iterable

VERSION_RE = re.compile(r"(^\s*//\s*@version\s+)(\d+\.\d+\.\d+)(\s*$)", re.MULTILINE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bump repo version fields in lockstep")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--version", help="Explicit target semver, e.g. 1.2.3")
    group.add_argument("--bump", choices=("patch", "minor", "major"), default="patch", help="Semver part to increment (default: patch)")
    parser.add_argument("--repo-root", default=".", help="Repository root (default: current directory)")
    parser.add_argument("--dry-run", action="store_true", help="Print intended changes without writing files")
    return parser.parse_args()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def dump_json(path: Path, data: dict, dry_run: bool) -> None:
    new_text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if dry_run:
        print(f"[dry-run] update {path}")
        return
    path.write_text(new_text, encoding="utf-8")


def bump_semver(version: str, bump: str) -> str:
    parts = version.split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        raise ValueError(f"Not a semver version: {version!r}")
    major, minor, patch = (int(part) for part in parts)
    if bump == "patch":
        patch += 1
    elif bump == "minor":
        minor += 1
        patch = 0
    elif bump == "major":
        major += 1
        minor = 0
        patch = 0
    else:
        raise ValueError(f"Unsupported bump: {bump!r}")
    return f"{major}.{minor}.{patch}"


def resolve_workspace_package_jsons(repo_root: Path, workspaces: Iterable[str]) -> list[Path]:
    package_jsons: list[Path] = []
    seen: set[Path] = set()
    for pattern in workspaces:
        for match in glob.glob(str(repo_root / pattern), recursive=True):
            candidate = Path(match)
            if candidate.is_dir():
                package_json = candidate / "package.json"
            elif candidate.name == "package.json":
                package_json = candidate
            else:
                continue
            if package_json.exists() and package_json not in seen:
                seen.add(package_json)
                package_jsons.append(package_json)
    return package_jsons


def update_package_json(path: Path, new_version: str, dry_run: bool) -> bool:
    data = load_json(path)
    old_version = data.get("version")
    if old_version == new_version:
        return False
    data["version"] = new_version
    dump_json(path, data, dry_run)
    return True


def update_package_lock(path: Path, new_version: str, workspace_package_paths: Iterable[Path], dry_run: bool) -> bool:
    data = load_json(path)
    changed = False

    if data.get("version") != new_version:
        data["version"] = new_version
        changed = True

    packages = data.get("packages")
    if isinstance(packages, dict):
        root_pkg = packages.get("")
        if isinstance(root_pkg, dict) and root_pkg.get("version") != new_version:
            root_pkg["version"] = new_version
            changed = True

        for package_json in workspace_package_paths:
            rel_dir = package_json.parent.relative_to(path.parent).as_posix()
            pkg_entry = packages.get(rel_dir)
            if isinstance(pkg_entry, dict) and pkg_entry.get("version") != new_version:
                pkg_entry["version"] = new_version
                changed = True

    if changed:
        dump_json(path, data, dry_run)
    return changed


def update_userscript_versions(repo_root: Path, new_version: str, dry_run: bool) -> list[Path]:
    updated: list[Path] = []
    for script_path in repo_root.rglob("*.user.js"):
        if "node_modules" in script_path.parts:
            continue
        text = script_path.read_text(encoding="utf-8")
        new_text, count = VERSION_RE.subn(rf"\g<1>{new_version}\g<3>", text, count=1)
        if count and new_text != text:
            if dry_run:
                print(f"[dry-run] update {script_path}")
            else:
                script_path.write_text(new_text, encoding="utf-8")
            updated.append(script_path)
    return updated


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()

    root_package_json = repo_root / "package.json"
    package_lock_json = repo_root / "package-lock.json"

    root_data = load_json(root_package_json)
    current_version = root_data.get("version")
    if not isinstance(current_version, str):
        raise SystemExit(f"Root package.json has no string version: {root_package_json}")

    if args.version:
        new_version = args.version
    else:
        new_version = bump_semver(current_version, args.bump)

    if new_version == current_version:
        print(f"Already at {new_version}; nothing to do.")
        return 0

    workspace_patterns = root_data.get("workspaces", [])
    if not isinstance(workspace_patterns, list):
        raise SystemExit("package.json workspaces must be a list")

    workspace_package_jsons = resolve_workspace_package_jsons(repo_root, workspace_patterns)

    changed_files: list[Path] = []
    if update_package_json(root_package_json, new_version, args.dry_run):
        changed_files.append(root_package_json)

    for package_json in workspace_package_jsons:
        if update_package_json(package_json, new_version, args.dry_run):
            changed_files.append(package_json)

    if package_lock_json.exists() and update_package_lock(package_lock_json, new_version, workspace_package_jsons, args.dry_run):
        changed_files.append(package_lock_json)

    changed_files.extend(update_userscript_versions(repo_root, new_version, args.dry_run))

    if changed_files:
        print(f"Updated {new_version}:")
        for path in changed_files:
            print(f"- {path.relative_to(repo_root)}")
    else:
        print(f"No files changed for {new_version}.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
