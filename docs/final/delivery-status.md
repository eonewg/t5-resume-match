# 最终交付状态与已知限制

2026-09-08，分支 feat/core-a，PR #5/#6/#7/#8 已集成。PR #8 merge 为 **a41a31d22dac3b31cb7cac8303f63cdd799ecab4**。技术集成与 clean clone 验收已完成。本轮仅补充 STAR 验证和公开竞品调研，未改产品或配置；准备最终草稿 PR 供审查，不合 main。

## 已完成

| 范围 | 实际结果 |
| --- | --- |
| UI Review | PR #8 准确 head 828dc948767e64d28c2b6dc9450bd11162331910 PASS，未发现 UI 集成 blocker |
| Resume | 原文、确认/清空保护、重解析候选、保存重读与历史版本；新 UI/刷新/重启通过 |
| Jobs/Matching | 已保存 JD、真实关键词分数与 gap，跨页选择、失败清旧结果；默认 semantic off |
| Diagnosis | 真实 STAR/JD、事实提醒、失败/重试/演示区分；fresh 首次上游失败，第二次成功 |
| Analytics | 来源/日期/样本/词云/技能/分单位薪资/未知值，十条真实来源统计复验通过 |
| Fresh install | GitHub clean clone、新 venv/空缓存、新空库迁移、正式应用启动、18 条记录重启持久化 PASS |
| 完整检查 | Python 396 passed/0 skipped，frontend 57 passed，Ruff/四模块契约/scope/PG/pgvector/合并 CI 成功 |
| 交付材料 | README、台账、测试记录、AI 报告、竞品缺口、痛点报告与五页演示脚本已整理 |

准确范围与记录见 [PR #8 审查](pr8-review.md)、[fresh install](fresh-install.md)、[测试](test-results.md)、[演示脚本](demo-script.md)。后续收尾仅改文档、验收脚本和无密钥摘要，不改变已安装验证的产品实现。

## 样本口径

[holdout](../../data/holdout/2026-09-08/README.md)包含五份 Canonical 完整 JD 与三份公开学生时期履历；[market](../../data/market/2026-09-08/README.md)是新增五份招聘方摘要与薪资证据。默认按钮导入 Canonical 五份；补充五份用 `uv run --locked python -m scripts.import_final_samples --apply` 幂等导入。

只导入这两批时是十条、六雇主、四条 USD/year 可比、五条无区间、一条周期未知。不是应届生平均薪资或市场总体结论；摘要不用于完整 JD 召回率。合成验收输入不混入真实来源统计。

## 剩余验收缺口

1. 原固定独立 AI 评估保持原样：两响应完成但 STAR 为空、一请求失败。新增 [补充 STAR 验证](star-supplement.md)已用两段完整经历执行；两组均为 TemporaryLLMError，分别 93.133/94.140 秒，未获可评价结果，四质量维度均 null。按用户指示只记限制，不改 Prompt/配置、不重跑美化。原解析均分 3/5、keyword 与主观适配 Spearman 0.27557 不作为准确率；仍无改写质量提升结论。
2. BOSS直聘与智联招聘的 [公开调研报告](../competitor-analysis.md)已根据用户提供材料与官方产品说明完成，包含流程、长处、待核实反馈及设计对照；不声称登录后的人工实测。严格需求表仍要求两款实际体验，人工记录待补。

本轮指定补充验证与公开调研已完成，可创建 **feat/core-a → main 最终草稿 PR** 供用户审查；不自动合并、不标为全部质量/课程门槛 PASS。STAR 调用可用性/效果证据不足如实保留，严格课程的两款人工体验仍待补充。用户后续可据真实证据决定最终验收，不因本轮限制修改系统。

## 运行限制

- 默认 Diagnosis 为明确演示服务；真实模型需要服务端配置。本轮真实联网仅 custom/openai_chat；另外两协议为离线适配覆盖，不声称全部厂商实测。
- Fresh install 真实调用首次上游 TemporaryLLMError/502、第二次 53.757 秒成功。功能可用不等于模型服务稳定性已经达标；保留失败分母。
- 规则解析依赖格式/词表，需核对草稿。关键词覆盖不衡量熟练度、年限、硬条件或录用概率；语义模型为可选依赖，默认不下载、不启用。
- 数字/原文守卫不能证明所有语义事实；生成建议、待补量化和新增技能必须核实。模型原文中的技术词不会为了固定 UI 文案清理而被改写。
- 本地单用户应用，未实现登录、多用户隔离或生产互联网部署。SQLite 是便捷演示；本轮最终运行和持久化使用 PostgreSQL/pgvector。
- 本次是新应用环境和新数据库，主机 Python/PostgreSQL/浏览器二进制沿用已安装版本，不宣称全新操作系统安装。两条现有依赖弃用提示保留。
