# 模块开发与交付

先阅读 [团队约定](team-rules.md)。A/D 分支及基线见 [上手说明](team-onboarding.md)，个人 AGENTS.md 仍只留本地。验收和公开自检按模块命名，旧 B/C/D/E 命令不再使用。

## 公开入口

| 模块 | Owner | 公开入口 | 测试目录 |
| --- | --- | --- | --- |
| resume | A | `backend.modules.resume.public:ResumeService` | `tests/resume/` |
| jobs（含 matching） | D | `backend.modules.jobs.public:JobsService` | `tests/jobs/` |
| diagnosis | D | `backend.modules.diagnosis.public:DiagnosisService` | `tests/diagnosis/` |
| analytics | A | `backend.modules.analytics.public:AnalyticsService` | `tests/analytics/` |

类无参构造、同步实例方法，签名见 `backend/core/ports.py`。实例可能被多请求共享，不保存单次请求输入。公共层只依赖公开入口，不调用其他模块内部实现。

## 示例与自检

```powershell
uv sync --locked
uv run --locked python -m scripts.check_member resume --examples
uv run --locked python -m scripts.check_member jobs --examples
uv run --locked python -m scripts.check_member diagnosis --examples
uv run --locked python -m scripts.check_member analytics --examples
```

实现后对自己的模块去掉 `--examples`；D 必须分别自检 jobs 和 diagnosis。合成输入来自 `examples/fixtures/team.json`，示例明确标记 Mock，不能作为真实交付。

真实检查拒绝 Mock/示例入口，验证公开输出和保留字段，运行模块测试及公共测试。缺少测试、全部跳过、没有实际通过用例或调用超时均失败。工具不改 .env、分支或公共数据库。公开调用默认 45 秒，模块/公共测试各至少给 180 秒，可用 `--timeout` 调整。

diagnosis 默认只检查入口与同步签名，不构造服务、不调用 AI；输出需离线替身测试验证。只有明确要做真实验证时使用 `--live`，CI 不传此参数。其他模块不得在默认自检时依赖收费服务；向量网络能力用离线替身测试，并单独记录真实验证。临时入口可用 `--provider module:Class`，不改变正式契约。

MEMBER_CHECK_PASS 仅表示自动自检通过，不替代 T5 功能、效果与人工验收。测试覆盖空白、重复、大小写、缺字段、失败和边界，不能只复制固定样例输出。

## 范围与 CI

D 在自己的分支运行：

```powershell
git fetch origin
uv run --locked python -m scripts.check_scope D
```

检查 `origin/feat/core-a...HEAD` 已提交变化；允许 jobs/diagnosis 后端、前端、测试及 D 集成请求，不允许公共文件。A 的公共/resume/analytics 变更由审查验收，不套用 D 的目录限制。范围检查不是敏感信息扫描，也不包含未提交文件。

共同检查：

```powershell
uv run --locked pytest -q
uv run --locked ruff check backend tests scripts examples
uv run --locked ruff format --check backend tests scripts examples
node scripts/check_frontend.mjs
```

CI 监听 main、feat/core-a、feat/intelligence-d 的 push 和所有 PR，运行 Windows/Ubuntu × Python 3.11/3.13。D 分支必须同时有 jobs/diagnosis 入口和测试；缺一个就失败。A/main 检查已存在模块，缺失模块仍需台账记录，不能视为最终完成。旧成员分支或未知分支 PR 被拒绝；D PR base 必须是 feat/core-a，最终 PR 只能由 A 指向 main。

Node 22+ 仅用于前端检查，自动发现公共与模块的 `*.test.mjs`；运行系统无需 Node。UI 见 [前端接入](frontend-integration.md)。

## 交付

PR 填写 T5 条目、模块完成情况、准确 SHA、样例、测试结果、UI 复现及未验证项。公共需求写入 [集成请求](integration_requests/README.md)。A 将 PASS/BLOCKED/ADAPT 与集成证据记录到 [台账](acceptance.md)，不要自行预填 PASS。真实数据库、浏览器、模型和 fresh install 的最终门槛不能用基础自检代替。
