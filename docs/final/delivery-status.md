# 最终交付状态与已知限制

2026-09-08，分支 feat/core-a，PR #5/#6/#7/#8 已集成。PR #8 merge 为 **a41a31d22dac3b31cb7cac8303f63cdd799ecab4**。本次完成技术集成、clean clone 安装复验和材料收尾；完整课程/质量门槛仍有缺口，不合 main。

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

1. 固定独立 AI/LLM-as-a-Judge 评估：三次尝试中两响应完成但 STAR 为空、一请求失败，可评改写为零。需使用完整经历另建评估版本取得质量证据，不能覆盖旧批次或挑成功。解析评分均值 3/5、keyword 与主观适配 Spearman 0.27557 仅是有限证据，不是准确率；评审指出漏项。见 [AI 报告](ai-evaluation-results.md)。
2. BOSS直聘与智联招聘登录后核心体验没有完成。当前只有工具阻塞记录，不能宣称实际比较了两款产品的简历制作/匹配功能。见 [竞品记录](../competitor-analysis.md)。

因此当前**不具备“全部验收通过”条件**，不创建宣称最终验收通过的 A → main PR，且不自动合 main。UI 本身和安装无未解决技术 blocker；质量/课程证据需完成后再准备最终 PR。

## 运行限制

- 默认 Diagnosis 为明确演示服务；真实模型需要服务端配置。本轮真实联网仅 custom/openai_chat；另外两协议为离线适配覆盖，不声称全部厂商实测。
- Fresh install 真实调用首次上游 TemporaryLLMError/502、第二次 53.757 秒成功。功能可用不等于模型服务稳定性已经达标；保留失败分母。
- 规则解析依赖格式/词表，需核对草稿。关键词覆盖不衡量熟练度、年限、硬条件或录用概率；语义模型为可选依赖，默认不下载、不启用。
- 数字/原文守卫不能证明所有语义事实；生成建议、待补量化和新增技能必须核实。模型原文中的技术词不会为了固定 UI 文案清理而被改写。
- 本地单用户应用，未实现登录、多用户隔离或生产互联网部署。SQLite 是便捷演示；本轮最终运行和持久化使用 PostgreSQL/pgvector。
- 本次是新应用环境和新数据库，主机 Python/PostgreSQL/浏览器二进制沿用已安装版本，不宣称全新操作系统安装。两条现有依赖弃用提示保留。
