"""One-command module smoke gate. It is not an A acceptance verdict.

Examples: uv run python -m scripts.check_member resume --examples
Real module:   uv run python -m scripts.check_member resume
Diagnosis is offline by default; --live explicitly permits a real diagnosis request.
"""

import argparse
import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from pydantic import BaseModel

from backend.core.config import ROOT
from backend.core.providers import load_provider, provider_class
from backend.schemas.contracts import (
    JD,
    AnalysisResult,
    DiagnosisInput,
    DiagnosisResult,
    JDData,
    JDInput,
    MatchResult,
    Resume,
    ResumeData,
    TextInput,
)
from examples.fixtures import load_cases
from scripts.member_specs import BRANCHES, D_BRANCHES, D_UI_BRANCH, MODULES, OWNER_MODULES


class CheckFailure(Exception):
    pass


def require(condition, message):
    if not condition:
        raise CheckFailure(message)


def validate(model, value):
    return model.model_validate(value.model_dump() if isinstance(value, BaseModel) else value)


def skill_set(values):
    return {item.strip().casefold() for item in values}


def probe(module: str, target: str, *, examples=False, live=False):
    """Execute only public methods using synthetic inputs."""
    spec = MODULES[module]
    cls = provider_class(spec.key, target)
    if not examples:
        require(target != "mock" and not target.startswith("examples."), "真实检查不能使用示例入口")
        require(not getattr(cls, "is_mock", False), "入口仍声明 is_mock=True，尚未交付真实实现")
    if module == "diagnosis" and not (examples or live):
        return "OFFLINE: diagnosis 仅检查入口与同步签名；不构造实例、不调用 AI。需模块离线测试验证输出。"
    if module == "resume" and not (examples or live):
        return "OFFLINE: resume 仅检查入口与同步签名；不构造实例、不调用 AI。需模块离线测试及单独真实抽取评测。"

    provider = load_provider(spec.key, target)
    require(examples or not provider.is_mock, "实例仍声明 is_mock=True")
    service = provider.service
    samples = load_cases()
    resume = Resume.model_validate(samples["resume"])
    jobs = [JD.model_validate(value) for value in samples["jobs"]]

    if module == "resume":
        result = validate(ResumeData, service.parse(TextInput(raw_text=resume.raw_text)))
        require(result.raw_text == resume.raw_text, "resume 必须保留输入原文")
        require("python" in skill_set(result.skills), "resume 未提取样例明确列出的 Python 技能")
        short = "未提供学历和技术经历。"
        result = validate(ResumeData, service.parse(TextInput(raw_text=short)))
        require(result.raw_text == short, "resume 对缺失字段输入也必须保留原文")
    elif module == "jobs":
        for jd in jobs:
            data = JDInput(title=jd.title, company=jd.company, jd_text=jd.jd_text)
            result = validate(JDData, service.parse(data))
            require(
                result.jd_text == jd.jd_text
                and result.title == jd.title
                and result.company == jd.company,
                "jobs 必须保留 JD 的标题、公司和原文",
            )
            require(
                skill_set(result.skills) == skill_set(jd.skills), "jobs 的样例 JD 技能提取不一致"
            )
        for case in samples["match_cases"]:
            left = resume.model_copy(update={"skills": case["resume_skills"]})
            right = jobs[0].model_copy(update={"skills": case["job_skills"]})
            before = (left.model_dump(), right.model_dump())
            result = validate(MatchResult, service.match(left, right))
            require(
                result.resume_id == left.id and result.jd_id == right.id, "jobs 返回了错误的关联 ID"
            )
            require(
                skill_set(result.matched_skills) == skill_set(case["matched_skills"]),
                f"jobs {case['name']} 的 matched_skills 不一致",
            )
            require(
                skill_set(result.missing_skills) == skill_set(case["missing_skills"]),
                f"jobs {case['name']} 的 missing_skills 不一致",
            )
            require(
                before == (left.model_dump(), right.model_dump()), "jobs 不得原地修改传入的简历/JD"
            )
    elif module == "diagnosis":
        data = DiagnosisInput(resume_text=resume.raw_text, jd_text=jobs[0].jd_text)
        validate(DiagnosisResult, service.diagnose(data))
    elif module == "analytics":
        result = validate(AnalysisResult, service.analyze(jobs))
        counts = {key.casefold(): count for key, count in result.skills.items()}
        expected = {key.casefold(): count for key, count in samples["analytics_expected"].items()}
        require(
            counts == expected, "analytics 样例技能统计应为 Python=2、SQL=2、Docker=1（岗位数）"
        )
        empty = validate(AnalysisResult, service.analyze([]))
        require(empty.skills == {}, "analytics 无岗位时应返回空统计")
    return (
        "EXAMPLE_CHECK_PASS（固定示例，不是业务验收）" if examples else "PUBLIC_CONTRACT_CHECK_PASS"
    )


def module_tests_exist(module, root=ROOT):
    directory = root / MODULES[module].tests
    require(
        directory.is_dir() and any(directory.rglob("test_*.py")),
        f"缺少 {MODULES[module].tests}/test_*.py；不能只靠公共测试交付",
    )


def run(command, *, timeout):
    completed = subprocess.run(command, cwd=ROOT, timeout=timeout, check=False)
    require(completed.returncode == 0, f"检查失败（退出码 {completed.returncode}），见上方输出")


def run_probe(module, args):
    target = args.provider or (
        MODULES[module].example if args.examples else MODULES[module].entrypoint
    )
    command = [
        sys.executable,
        "-m",
        "scripts.check_member",
        module,
        "--_probe",
        "--provider",
        target,
    ]
    if args.examples:
        command.append("--examples")
    if args.live:
        command.append("--live")
    run(command, timeout=args.timeout)


def run_module_tests(module, *, timeout):
    module_tests_exist(module)
    # A separate module report prevents an empty/skipped module passing on core tests alone.
    with tempfile.TemporaryDirectory(prefix="t5-module-") as temporary:
        report = Path(temporary) / "tests.xml"
        run(
            [sys.executable, "-m", "pytest", MODULES[module].tests, "-q", f"--junitxml={report}"],
            timeout=timeout,
        )
        cases = ET.parse(report).getroot().iter("testcase")
        require(
            any(
                not any(case.find(tag) is not None for tag in ("skipped", "failure", "error"))
                for case in cases
            ),
            "模块测试没有实际通过的用例（全部跳过或未收集）",
        )
    run([sys.executable, "-m", "pytest", "tests/core", "-q"], timeout=timeout)


def ci_modules(ref: str, root=ROOT):
    if ref == D_UI_BRANCH:
        # UI uses all four existing contracts; this grants no backend edit permission.
        return list(MODULES)
    if ref in D_BRANCHES:
        # Require both deliveries even if one module has not been created yet.
        return list(OWNER_MODULES["D"])
    require(ref in ("main", BRANCHES["A"]), f"未知 owner 分支 {ref}，请使用团队约定的分支名")
    return [key for key, spec in MODULES.items() if (root / f"backend/modules/{key}").exists()]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("module", nargs="?", choices=MODULES)
    parser.add_argument(
        "--examples", action="store_true", help="只检查固定接入示例，不代表模块实现"
    )
    parser.add_argument("--provider", help="替换公开入口 module:Class（不修改 .env）")
    parser.add_argument(
        "--live", action="store_true", help="明确允许 diagnosis 调用真实 AI，可能产生费用"
    )
    parser.add_argument("--timeout", type=int, default=45, help="公开调用总时限，默认 45 秒")
    parser.add_argument(
        "--ci", action="store_true", help="CI 已运行完整 pytest 后，检查分支对应入口"
    )
    parser.add_argument("--_probe", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    require(args.timeout > 0, "timeout 必须大于零")
    if args.ci:
        require(
            not args.examples and not args.live and not args.provider and not args.module,
            "--ci 不与模块/示例/真实 AI 参数混用",
        )
        ref = os.environ.get("GITHUB_HEAD_REF") or os.environ.get("GITHUB_REF_NAME", "")
        modules = ci_modules(ref)
        if not modules:
            print("CI: 尚无业务模块，公共骨架检查不代表模块交付。")
        for module in modules:
            module_tests_exist(module)
            run_probe(module, args)
        return 0
    require(args.module is not None, "请指定 resume/jobs/diagnosis/analytics 或 --ci")
    if args._probe:
        print(probe(args.module, args.provider, examples=args.examples, live=args.live))
        return 0
    if not args.examples:
        module_tests_exist(args.module)
    run_probe(args.module, args)
    if not args.examples:
        run_module_tests(args.module, timeout=max(args.timeout, 180))
        print("MODULE_CHECK_PASS：公开自检和测试通过；A 仍需审查实现、范围及业务效果。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (CheckFailure, subprocess.TimeoutExpired) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        # Third-party exception messages can contain credentials. Show the type, not raw values.
        print(
            f"FAIL: 入口导入、构造或调用失败（{type(error).__name__}）；请用模块离线测试定位。",
            file=sys.stderr,
        )
        sys.exit(1)
