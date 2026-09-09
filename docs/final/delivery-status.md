# 最终交付状态与已知限制

截至 2026-09-09，分支 feat/core-a，PR #5/#6/#7/#8 已集成。PR #8 merge 为 **a41a31d22dac3b31cb7cac8303f63cdd799ecab4**。技术集成与 clean clone 验收已完成。补充 STAR 验证已执行并保留失败限制；两款竞品人工体验记录已补齐。最终 [PR #9](https://github.com/eonewg/t5-resume-match/pull/9) 更新供用户审查，不合 main。

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
| 交付材料 | README、台账、测试记录、AI 报告、两款人工竞品记录与设计对照、痛点报告与五页演示脚本已整理 |

准确范围与记录见 [PR #8 审查](pr8-review.md)、[fresh install](fresh-install.md)、[测试](test-results.md)、[演示脚本](demo-script.md)。后续收尾仅改文档、验收脚本和无密钥摘要，不改变已安装验证的产品实现。

## 样本口径

[holdout](../../data/holdout/2026-09-08/README.md)包含五份 Canonical 完整 JD 与三份公开学生时期履历；[market](../../data/market/2026-09-08/README.md)是新增五份招聘方摘要与薪资证据。默认按钮导入 Canonical 五份；补充五份用 `uv run --locked python -m scripts.import_final_samples --apply` 幂等导入。

只导入这两批时是十条、六雇主、四条 USD/year 可比、五条无区间、一条周期未知。不是应届生平均薪资或市场总体结论；摘要不用于完整 JD 召回率。合成验收输入不混入真实来源统计。

## 验收结论与效果限制

1. 原固定独立 AI 评估保持原样：两响应完成但 STAR 为空、一请求失败。新增 [补充 STAR 验证](star-supplement.md)已用两段完整经历执行；两组均为 TemporaryLLMError，分别 93.133/94.140 秒，未获可评价结果，四质量维度均 null。按用户指示只记限制，不改 Prompt/配置、不重跑美化。原解析均分 3/5、keyword 与主观适配 Spearman 0.27557 不作为准确率；仍无改写质量提升结论。
2. BOSS直聘与智联招聘的 [体验报告](../competitor-analysis.md)已补入用户 2026-09-09 的人工记录，包含简历、诊断/优化、岗位推荐与结果展示，以及优点、问题和设计对照；竞品体验证据缺口关闭。公开资料与人工观察分开，不声称 A 自行操作或竞品完全没有匹配解释。

指定的补充验证和两款竞品体验证据已完成，**PR #9 保留草稿供用户最终审查**，不自动合 main。技术验收和竞品体验材料通过；STAR 调用可用性与改写效果证据不足仍列为已知限制，不标为质量 PASS。后续是否合并由用户决定，本轮不再修改系统或重跑模型。

## 运行限制

- 默认 Diagnosis 为明确演示服务；真实模型需要服务端配置。本轮真实联网仅 custom/openai_chat；另外两协议为离线适配覆盖，不声称全部厂商实测。
- Fresh install 真实调用首次上游 TemporaryLLMError/502、第二次 53.757 秒成功。功能可用不等于模型服务稳定性已经达标；保留失败分母。
- 规则解析依赖格式/词表，需核对草稿。关键词覆盖不衡量熟练度、年限、硬条件或录用概率；语义模型为可选依赖，默认不下载、不启用。
- 数字/原文守卫不能证明所有语义事实；生成建议、待补量化和新增技能必须核实。模型原文中的技术词不会为了固定 UI 文案清理而被改写。
- 本地单用户应用，未实现登录、多用户隔离或生产互联网部署。SQLite 是便捷演示；本轮最终运行和持久化使用 PostgreSQL/pgvector。
- 本次是新应用环境和新数据库，主机 Python/PostgreSQL/浏览器二进制沿用已安装版本，不宣称全新操作系统安装。两条现有依赖弃用提示保留。
