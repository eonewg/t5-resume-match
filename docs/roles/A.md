# A：平台、Resume、Analytics、数据库与最终交付

固定分支：`feat/core-a`。遵守 [协作规则](../team-rules.md) 和 [T5 需求](../../T5_REQUIREMENTS_MATRIX.md)。

## 责任范围

A 负责 public/core、Resume、Analytics、quality/QA、PostgreSQL/pgvector、公共前端、CI、架构与最终集成。

| 范围 | 目录与内容 |
| --- | --- |
| 公共平台 | backend/main.py、backend/api/、backend/core/、backend/models/、backend/schemas/ |
| Resume | backend/modules/resume/、frontend/src/modules/resume/、tests/resume/ |
| Analytics | backend/modules/analytics/、frontend/src/modules/analytics/、tests/analytics/ |
| 公共前端 | frontend/index.html、frontend/src/app.js、frontend/src/core/、全局样式 |
| 质量与交付 | tests/core/、tests/quality/、scripts/、examples/、.github/、根配置/依赖、共享文档和交付材料 |

## T5 交付

- Resume：粘贴原文、自动结构化、字段展示与编辑、保存后重新读取、保留原文。字段缺失留空，不虚构事实；已有保存 API 不等于编辑器完成。
- 公共链路：统一 API、Schema、ports/provider、简历/JD 选择与持久化、四模块挂载及流程串联；接口变化同步文档、兼容策略和测试。
- Analytics：基于系统已录入 JD 展示近期热门技能词云、岗位薪资分布、技能要求分布和市场观察/职业规划说明，标明来源、样本量、时间范围及缺失值。
- PostgreSQL/pgvector：连接、扩展、SQLAlchemy/pgvector 依赖、表与 vector 字段、索引、查询/读写 adapter、初始化/迁移及真实集成测试。D 明确模型、维度、距离和评分需求，A 实施数据库；SQLite 仅用于过渡演示。
- 问题定义：组织至少 2 款招聘 APP 对比、5 份真实 JD、3 份学生简历及痛点报告，D 提供表达/技能 gap 分析。脱敏并注明来源，不能用合成材料补真实样本数量。
- quality/QA：公共测试、系统 E2E、数据口径与异常检查、CI、README/环境说明、clean clone / fresh install、答辩演示和真实 AI 辅助过程记录。

## 模块验收与集成

A 按 Resume、Jobs/Matching、Diagnosis、Analytics 验收自己的模块和 D 的交付，结果写入 [台账](../acceptance.md)。

检查准确 SHA 相对共同祖先的变更并对比 A 基线，区分继承代码与越界修改；检查误提交、公开契约、模块测试、实际业务效果与未验证项。

Jobs/Matching 必须有关键词基线、0–100 分数、matched/missing 技能和一致的 gap 解释，不能只给向量分数。Diagnosis 必须有 STAR 增强、JD 定向建议、量化补充提示及事实边界，真实失败不能伪装为 Mock 成功。

D 业务错误写明文件、复现与预期并交 D 修复；公共兼容问题由 A 适配。ADAPT 复验 PASS 后才能集成，不擅自重写 D 算法。未经授权不代发外部消息。

## 最终验证与交付

执行 uv sync --locked、完整 pytest、Ruff check/format 和 node scripts/check_frontend.mjs；另外真实验证 PostgreSQL/pgvector、模型输出、浏览器 E2E、README 和 clean clone / fresh install，检查 .env.example 不含密钥。

只有满足 [系统门槛](../acceptance.md#最终系统门槛) 后，才通过 feat/core-a → main PR 最终交付。收尾给出分支、commit、文件、验收/集成状态、验证结果及真实限制。
