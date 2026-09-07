"""CI/local check of changed paths relative to A; does not modify any branch."""

import argparse
import os
import subprocess
import sys
from pathlib import PurePosixPath

from backend.core.config import ROOT
from scripts.member_specs import BRANCHES, MODULES


def allowed_path(owner, path):
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


def violations(owner, paths):
    errors = []
    for path in paths:
        if not allowed_path(owner, path):
            errors.append(f"超出 {owner} 责任范围: {path}")
        file = PurePosixPath(path)
        if file.name == ".env" or "__pycache__" in file.parts or file.suffix in (".pyc", ".db"):
            errors.append(f"不应交付的本地文件: {path}")
        local = ROOT / path
        if local.is_file() and local.stat().st_size > 5 * 1024 * 1024:
            errors.append(f"超过 5 MiB，请先向 A 说明用途: {path}")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("owner", nargs="?", choices=("D",))
    parser.add_argument("--base", default="origin/feat/core-a")
    parser.add_argument("--ci", action="store_true")
    args = parser.parse_args()
    owner = args.owner
    if args.ci:
        ref = os.environ.get("GITHUB_HEAD_REF") or os.environ.get("GITHUB_REF_NAME", "")
        target = os.environ.get("GITHUB_BASE_REF", "")
        if ref == BRANCHES["D"]:
            owner = "D"
            if target and target != BRANCHES["A"]:
                print("FAIL: D PR 必须指向 feat/core-a。")
                return 1
        elif ref in ("main", BRANCHES["A"]):
            if target and not (ref == BRANCHES["A"] and target == "main"):
                print("FAIL: 最终 PR 只能从 feat/core-a 指向 main。")
                return 1
            print("A/main 的公共改动由 PR 审查；本项只检查 D 目录边界。")
            return 0
        else:
            print("FAIL: 分支不符合 A/D 约定；D 开发使用 feat/intelligence-d。")
            return 1
    if owner is None:
        parser.error("请指定 owner D 或 --ci")
    result = subprocess.run(
        ["git", "diff", "--name-only", "--no-renames", "-z", f"{args.base}...HEAD"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        print("FAIL: 无法比较集成基线；请先 git fetch origin，并确认 --base。")
        return 1
    paths = [p for p in result.stdout.decode("utf-8").split("\0") if p]
    errors = violations(owner, paths)
    if errors:
        print("\n".join(errors))
        return 1
    print(f"SCOPE_CHECK_PASS: {owner}，{len(paths)} 个已提交变更文件。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
