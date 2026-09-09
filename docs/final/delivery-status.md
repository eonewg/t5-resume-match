# 最终交付状态与已知限制

截至 2026-09-09，本轮实测产品基线 `9952baf688e114cd7095faa1b5924e19dde9c1dd`，
分支 `feat/core-a`。Diagnosis 最后一轮修复和真实验收 PASS：严格 schema 后逐条过滤违规 STAR，
三组 DeepSeek 各一次均成功，原 content_filter 组合保留合法诊断并过滤数字违规条目。
正式 Diagnosis 为 `SiliconFlow / deepseek-ai/DeepSeek-V4-Flash`；Resume 保持 Ling3-flash。

[PR #9](https://github.com/eonewg/t5-resume-match/pull/9) 当前实际状态为 **Ready for review**，
本轮重启一致性与十条市场样本复验均 PASS，判定 **READY FOR FINAL MERGE**。
最终交付 head 见 PR 正文（本轮后续仅文档/证据提交），不自动合 main。
[最终两项复验](final-recheck.md)记录当前产品代码、命令、快照摘要与全部回归结果；
此前产品修复 `29af3ab` 的 push/PR 两轮共 10 项检查 SUCCESS，含 PostgreSQL job：
[push CI](https://github.com/eonewg/t5-resume-match/actions/runs/34326170422)、
[PR CI](https://github.com/eonewg/t5-resume-match/actions/runs/34326175644)。

下面旧 PR #8 数据为历史验收范围；最新完整安装记录为
[559118d 集成验收](release-acceptance-results.md)，最新 Diagnosis 证据见
[SiliconFlow 最终验收](diagnosis-siliconflow.md#逐条-star-严格校验与最终验收)。

## PR #8 历史验收

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

准确范围与记录见 [PR #8 审查](pr8-review.md)、[fresh install](fresh-install.md)、[测试](test-results.md)、[演示脚本](demo-script.md)。此后 Resume/Diagnosis 有独立修复，不将旧安装结果当作最新产品的全量重验。

## 样本口径

[holdout](../../data/holdout/2026-09-08/README.md)包含五份 Canonical 完整 JD 与三份公开学生时期履历；[market](../../data/market/2026-09-08/README.md)是新增五份招聘方摘要与薪资证据。默认按钮导入 Canonical 五份；补充五份用 `uv run --locked python -m scripts.import_final_samples --apply` 幂等导入。

只导入这两批时是十条、六雇主、四条 USD/year 可比、五条无区间、一条周期未知。不是应届生平均薪资或市场总体结论；摘要不用于完整 JD 召回率。合成验收输入不混入真实来源统计。

## 验收结论与效果限制

1. 原固定独立 AI 评估保持原样：两响应完成但 STAR 为空、一请求失败。新增 [补充 STAR 验证](star-supplement.md)已用两段完整经历执行；两组均为 TemporaryLLMError，分别 93.133/94.140 秒，未获可评价结果，四质量维度均 null。按用户指示只记限制，不改 Prompt/配置、不重跑美化。原解析均分 3/5、keyword 与主观适配 Spearman 0.27557 不作为准确率；仍无改写质量提升结论。
2. BOSS直聘与智联招聘的 [体验报告](../competitor-analysis.md)已补入用户 2026-09-09 的人工记录，包含简历、诊断/优化、岗位推荐与结果展示，以及优点、问题和设计对照；竞品体验证据缺口关闭。公开资料与人工观察分开，不声称 A 自行操作或竞品完全没有匹配解释。

历史固定评估与补充失败保持原样；最新 Diagnosis 三组与浏览器验收已关闭本轮调用可用性阻塞，
不把少量成功或原文/数字保护当作独立语义质量 PASS。PR #9 当前 Ready for review，未合并。

## 当前收尾清单

- Diagnosis：最终三组真实调用及浏览器验收 PASS；历史质量评价保持原结论。
- 应用重启：28 条 Resume/JD/Match/Diagnosis、关联关系、3 种 Analytics 查询及各表业务摘要一致，PASS。
- 市场统计：canonical / 保存值 / API / 页面一致，10 条、6 雇主、4 USD 年薪，5 无区间、1 周期未知，PASS。
- 最新回归：Python 615 passed / 0 skipped（真实 PostgreSQL）；frontend 77 passed；定向 14 passed；Ruff check/format、PG/pgvector smoke PASS。
- 本轮无产品代码、模型、Prompt、Resume 或秘密配置变更，无新增模型请求。
- 已完成项不再列为 pending。PR #9 Ready for review，**READY FOR FINAL MERGE**；main 合并与合并后复核按用户范围尚未执行。

## 运行限制

- 当前本机已配置正式 Diagnosis SiliconFlow / DeepSeek-V4-Flash；干净安装需自行提供服务端密钥。真实联网仅 custom/openai_chat；另外两协议仍是离线适配覆盖。
- Fresh install 真实调用首次上游 TemporaryLLMError/502、第二次 53.757 秒成功。功能可用不等于模型服务稳定性已经达标；保留失败分母。
- 规则解析依赖格式/词表，需核对草稿。关键词覆盖不衡量熟练度、年限、硬条件或录用概率；语义模型为可选依赖，默认不下载、不启用。
- 数字/原文守卫不能证明所有语义事实；生成建议、待补量化和新增技能必须核实。模型原文中的技术词不会为了固定 UI 文案清理而被改写。
- 本地单用户应用，未实现登录、多用户隔离或生产互联网部署。SQLite 是便捷演示；本轮最终运行和持久化使用 PostgreSQL/pgvector。
- 本次是新应用环境和新数据库，主机 Python/PostgreSQL/浏览器二进制沿用已安装版本，不宣称全新操作系统安装。两条现有依赖弃用提示保留。
