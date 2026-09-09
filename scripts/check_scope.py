"""Maintenance CI delivery checks and optional local D-owner scope checks."""

import argparse
import os
import subprocess
import sys
from pathlib import PurePosixPath

from backend.core.config import ROOT
from scripts.member_specs import D_UI_BRANCH, MODULES

MAINTENANCE_PREFIXES = {"feat", "fix", "chore", "docs", "test", "refactor"}


def allowed_path(owner, path, branch=None):
    if owner == "D" and branch == D_UI_BRANCH:
        return path.startswith("frontend/") or (
            path.endswith(".md")
            and (
                path.startswith("docs/ui/")
                or path
                in (
                    "docs/frontend-integration.md",
                    "docs/integration_requests/D-ui-refresh.md",
                )
            )
        )
    prefixes = [
        prefix
        for spec in MODULES.values()
        if spec.owner == owner
        for prefix in (
            f"backend/modules/{spec.key}/",
            f"{spec.tests}/",
            f"frontend/src/modules/{spec.key}/",
        )
    ]
    if any(path.startswith(prefix) for prefix in prefixes):
        return True
    return path.startswith(f"docs/integration_requests/{owner}-") and path.endswith(".md")


def violations(owner, paths, branch=None):
    errors = []
    for path in paths:
        if owner is not None and not allowed_path(owner, path, branch):
            errors.append(f"超出 {owner} 责任范围: {path}")
        file = PurePosixPath(path)
        if file.name == ".env" or "__pycache__" in file.parts or file.suffix in (".pyc", ".db"):
            errors.append(f"不应交付的本地文件: {path}")
        local = ROOT / path
        if local.is_file() and local.stat().st_size > 5 * 1024 * 1024:
            errors.append(f"超过 5 MiB，不应直接交付: {path}")
    return errors


def ci_gate(ref, target):
    """Return an error for unsupported refs/targets; no A/D owner is required."""
    if target not in ("", "main"):
        return "FAIL: 维护 PR 必须指向 main。"
    if ref == "main":
        return "FAIL: PR 来源必须是维护分支。" if target else ""
    prefix, separator, name = ref.partition("/")
    if prefix not in MAINTENANCE_PREFIXES or not separator or not name:
        return "FAIL: 请使用 feat/*、fix/*、chore/*、docs/*、test/* 或 refactor/* 维护分支。"
    # Git owns ref syntax validation. Pass the ref as an argument, never shell code.
    result = subprocess.run(
        ["git", "check-ref-format", "--branch", ref],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return "FAIL: 非法 Git 分支名。" if result.returncode else ""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("owner", nargs="?", choices=("D",))
    parser.add_argument("--base", default="origin/main")
    parser.add_argument("--ci", action="store_true")
    args = parser.parse_args()
    owner = args.owner
    ref = (
        subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT, text=True).strip()
        if not args.ci
        else ""
    )
    if args.ci:
        ref = os.environ.get("GITHUB_HEAD_REF") or os.environ.get("GITHUB_REF_NAME", "")
        target = os.environ.get("GITHUB_BASE_REF", "")
        failure = ci_gate(ref, target)
        if failure:
            print(failure)
            return 1
        owner = None
        # Scan the checkout, including inherited files, on both pushes and PRs.
        # No deleted development branch or event-dependent diff base is needed.
        command = ["git", "ls-files", "-z"]
    else:
        if owner is None:
            parser.error("请指定 owner D 或 --ci")
        command = [
            "git",
            "diff",
            "--name-only",
            "--no-renames",
            "-z",
            f"{args.base}...HEAD",
        ]
    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        print("FAIL: 无法读取 Git 文件；本地 scope 检查请先 fetch 并确认 --base。")
        return 1
    paths = [p for p in result.stdout.decode("utf-8").split("\0") if p]
    errors = violations(owner, paths, ref)
    if errors:
        print("\n".join(errors))
        return 1
    print(f"SCOPE_CHECK_PASS: {owner or 'maintenance CI'}，{len(paths)} 个文件。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
