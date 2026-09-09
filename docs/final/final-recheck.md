# 最终两项复验与交付判定

2026-09-09，A 在 `feat/core-a` 完成最后两项复验，结论 **READY FOR FINAL MERGE**。
实测产品代码 head 为 `9952baf688e114cd7095faa1b5924e19dde9c1dd`；本次后续提交仅收口文档与证据。
最终交付 head 以 [PR #9](https://github.com/eonewg/t5-resume-match/pull/9) 的当前 head 为准，
本地可用 `git rev-parse HEAD` 核对；PR 正文记录文档提交后的完整 SHA，避免本文自引用提交哈希。
PR 保持 Ready for review，未合并 main；合并后复核属于合并操作阶段。

Diagnosis 已通过[最终三组真实服务与浏览器验收](diagnosis-siliconflow.md#逐条-star-严格校验与最终验收)。
本轮新增真实模型调用为 **0**，未修改模型、Prompt、Resume、业务代码或 `.env`。
历史失败、Mock 标签和独立质量评估均保留；已知产品限制继续见 [交付状态](delivery-status.md#运行限制)。

## 应用重启数据一致性：PASS

- 使用已有 PostgreSQL `t5_fresh_20260908_1421`，PostgreSQL 17.6 / pgvector 0.8.1。
  该库已有真实 Diagnosis 持久化记录，避免为了验收新增模型请求。当前 `.env` 的模型设置原样读取，
  仅通过进程环境按数据库文档选择 PostgreSQL；未使用 SQLite、测试 API、provider 替换或新库代替重启。
- 通过普通 `POST /api/v1/resumes` 保存人工确认的合成字段，`POST /api/v1/jobs` 保存
  `source_type=synthetic` 的岗位，再 `POST /api/v1/matches` 创建 50% 关键词匹配。
  标识为 `FINAL-RESTART-20260909-9952baf`，三个 ID 见 JSON 证据。保留旧对象，未清库或手工改库。
- 重启前，通过现有 GET 接口快照 **5 Resume、15 JD、5 Match、3 Diagnosis，共 28 条记录**；
  Diagnosis 中 2 条为此前保存的真实结果，1 条为历史 Mock，重读时全部保留原标签，未把 Mock 计为真实模型验收。
- Analytics 对全部来源、真实来源、真实来源加 2026-09-08 日期边界分别快照。
  Analytics 没有独立结果持久表，源 JD 的完整业务字段、筛选响应和统计输出均纳入比较。
- README 正式命令：`uv run --locked python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`。
  第一个进程 PID 46300 经 Ctrl+C 正常关闭，日志显示 `Application shutdown complete`，
  停机期间 health 探测无 HTTP 响应；随后相同命令、相同数据库启动 PID 5936。
- 新进程 `/health`、`/ready` 均 HTTP 200，四模块真实入口正常。
  28 条对象的完整 API 业务字段、ID、关联、Mock 标签及 3 种 Analytics 响应逐项一致。
  全部表记录数及业务摘要前后一致；迁移版本和向量表保持原状，无重复创建、意外初始化或覆盖。
  数据库摘要排除 created_at/updated_at/applied_at；不以日志、进程号等非业务差异判失败。

完整本地前后快照保留于 `.verification/final-recheck/`，不提交简历原文。
[公开证据](evidence/final-recheck-20260909.json)记录每条路径的前后 SHA-256、关键 ID/关联、各表数量与摘要。

## 十条市场样本统计：PASS

使用现有 `POST /api/v1/analytics/sample-jobs` 和
`uv run --locked python -m scripts.import_final_samples --apply`；两者各执行两次，
均返回 created=0、existing=5，说明原库已完整导入且重复执行未增量。
未修改 canonical 文件、薪资事实或数据库记录。

从五份 holdout Canonical JSON 和五份 final market JSON 独立重算，并按来源 URL 与原文逐条核对保存值：

| 指标 | canonical 重算 / Analytics API / 前端 |
| --- | --- |
| 真实市场样本 | 10 |
| 已知雇主 | 6 |
| 具备完整上下界 | 5；其中 1 条周期未知，不可比较 |
| 有效可比薪资 | 4，全部 USD / year |
| 无完整薪资区间 | 5 |
| 单位未确认 | 1，具体为周期未知 |
| 采集日期 | 2026-09-08 |

四条 USD 年薪原始区间为 110,000–130,000、190,000–245,000、320,000–405,000、91,300–140,000。
不折汇、不折算月/年、不用中点或零替代缺失值。技能频次按保存后的技能逐岗去重重算，18 项一致；
Python 8/10=80%，Go 与 Linux 各 6/10=60%。历史文档的 10/6/4 预期仍正确，无导入缺口或统计代码缺陷。

`GET /api/v1/analytics?source_type=real` 返回 sample_size=10、company_count=6、
salary_coverage=4/5/1，单组 USD/year 样本 4。全库 available_count=15 包含 4 条旧 unknown
和本轮 1 条 synthetic；它不是市场筛选分母。前端默认 real 显示“岗位样本 10 / 已录入 15 条”，语义一致。

使用原有 Edge/Playwright QA 工具访问普通 `/#analytics`；桌面 1440px 和移动 390px 刷新后均显示
10/6/4，四个区间、未知值和 API 一致，无页面异常、无 POST 请求。Browser 插件运行文件缺失，
未将此次检查写成应用内浏览器验收。见[桌面](evidence/final-market-desktop-20260909.png)、
[移动](evidence/final-market-mobile-20260909.png)与公开 JSON 的页面文本/断言。

## 必要回归

| 检查 | 结果 |
| --- | --- |
| Analytics + PostgreSQL 产品定向测试 | 14 passed，3.51 秒 |
| `uv run --locked pytest -q`（配置真实 T5_TEST_DATABASE_URL，隔离 schema） | 615 passed、0 skipped，29.48 秒 |
| `node scripts/check_frontend.mjs` | 77 passed、0 failed、0 skipped |
| `ruff check backend tests scripts examples` | PASS |
| `ruff format --check backend tests scripts examples` | PASS，109 文件 |
| `python -m scripts.smoke_postgres` | 扩展、迁移、索引、向量写查及 Resume→JD→关键词匹配 PASS |

两条既有 Starlette/anyio 弃用提示保留。最初沙箱中的 uv 缓存、pytest 临时目录及 Node/Edge 子进程访问受限；
使用获准的正常本机执行环境后上述检查通过，未修改产品或测试以规避失败。
全量回归连接独立测试用途的 `t5` 数据库/隔离 schema，不影响重启验收库。
未运行会调用真实模型的通用 `scripts/smoke.py`；模型成功/失败证据沿用已验收记录。
