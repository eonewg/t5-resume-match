# 测试与集成证据

## PR #7

D 准确源 SHA `35b1301c9389b7a68dbbaefe28292870113d645d`，合入 A 为 `0b175f0b73071b648012f32257e51cdaf9524c78`。PR 改动限定 Diagnosis 与 D 测试/记录；A 在集成前完成确认字段序列化和诊断超时适配，并以 PR 更新分支同步给 D。没有合 main。

- GitHub push/PR 共 10 项检查 SUCCESS。
- 准确 D 源的独立工作目录：真实 PostgreSQL 下 Python 378 passed、0 skipped，前端 54 passed；Ruff、pgvector smoke 通过。
- Chat/Responses/Messages 的文本提取、thinking 排除、截断/拒答、HTTPS 自定义地址、请求限制、重试与密钥不回传已离线审查/测试；真实联网验证限 custom/openai_chat。
- A 真实调用 26.747 秒，零重试，`is_mock=false`；输入/输出 token 为 779/1667。真实浏览器调用 24.398 秒，结果包含 STAR/JD 建议。
- 编辑原文含 Python/SQL 后确认仅 SQL，保存读回与匹配 33.33%；诊断使用确认字段，旧原文技能不被重新带回。受控 502 清除旧结果，显式重试复用真实缓存结果，不伪装 Mock 成功。
- 市场页 10 条真实来源、6 雇主、4 年薪区间、5 无区间、1 周期未知，390px 页面检查通过。可移植摘要见 [浏览器记录](evidence/browser-report.json) 和 [市场结果](evidence/market-report.json)。

## 固定评估调用

[operator-record](../../data/evaluation/2026-09-08/operator-record.json) 保留输入 SHA、当时代码 SHA、3 份解析、15 个匹配预测、3 次真实生成及 A/B 映射。两次成功、一次 TemporaryLLMError，均保留，不用重跑挑选成功结果。独立 AI 评审已返回，原件保留并重新汇总核对，见 ai-evaluation-results.md；不是人工金标准。

## 本轮检查

本轮新增 UI 分支的允许/拒绝路径、PR 目标和旧权限隔离回归；新增薪资样本重复导入与周期未知保护；新增 judge 汇总/原件保护测试。执行结果在本轮提交前补记于验收台账。

复现命令：

```powershell
& ./scripts/local_postgres.ps1 -Action Connect
uv run --locked ruff check backend tests scripts examples
uv run --locked ruff format --check backend tests scripts examples
uv run --locked pytest -q
uv run --locked python -m scripts.smoke_postgres
node scripts/check_frontend.mjs
```

CI 普通矩阵未配置 PostgreSQL 时会跳过 PG 专项；CI postgres job 和本地实际 PG 全量结果单独判断。测试不自动调用付费模型，真实调用需明确 live 选项。PR #8 合并后 fresh install 与 UI E2E 已执行，新增记录见下文；旧日志仅作为历史证据。

评估补充核对：固定 D1/D2 的第一条解析经历只有标题/时间，真实响应虽成功但 `star_rewrites=[]`，只有 JD 建议。D3 是调用失败。三个原始记录和盲评输入不变；汇总分别报告请求完成 2、空改写 2、可评改写 0、失败 1，改写提升应为 null，不以空文本计算提升。早前另一次合成验收的 STAR 成功不替代本批结果。


## PR #8 与 fresh install

准确 UI head `828dc948767e64d28c2b6dc9450bd11162331910`：Python 396 passed/0 skipped、frontend 57 passed，真实 PG/pgvector、Ruff、scope 和十项 GitHub 检查通过；旧 A 脚本只适配定位与文案。Review 见 [PR #8](pr8-review.md)。

merge `a41a31d22dac3b31cb7cac8303f63cdd799ecab4`：全新 clone/venv/空依赖缓存安装 32 包，新数据库两次迁移通过。完整 Python 396 passed/0 skipped（23.32 秒）、frontend 57 passed、Ruff（全仓库格式 147 文件）、scope/公开契约与 PG/pgvector smoke 通过。GitHub [合并 CI](https://github.com/eonewg/t5-resume-match/actions/runs/34237691949)成功。

真实浏览器首次 502（服务端 TemporaryLLMError），第二次 53.757 秒真实 STAR/JD 输出成功；两个尝试都保留。普通应用重启后 18 条 API 记录逐项不变，浏览器刷新载入、Desktop/390px 五页与演示/失败回归通过。完整边界、命令和机器可读摘要见 [fresh install](fresh-install.md)。不以合成浏览器成功代替固定评估改写质量。


## 补充验证收尾（文档与评估材料）

在 ac952ff 上新增独立批次，两组完整原文项目/相关 JD 真实请求均为 TemporaryLLMError，93.133 / 94.140 秒，无可评价 STAR；每组一次外层验证、三次既有内部尝试。原固定评估所有文件哈希不变，产品、Prompt、配置、依赖不变。检查新增 run.py 的 Ruff、输入/来源/hash、JSON 和报告链接，独立 Agent 核验证据；不重复付费调用或完整 fresh install。提交后既有 GitHub CI 仍执行完整测试。
