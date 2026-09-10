# 团队协作规则

职责以[五人分工方案](../T5_FIVE_PERSON_ALLOCATION.md)为准，功能范围见[T5 需求](../T5_REQUIREMENTS_MATRIX.md)。A–E 表示待确认姓名的职责角色，计划权重不代表历史贡献。个人 AGENTS.md 仅留本地。

## 职责与接口

| 成员 | 主责 | 角色说明 |
| --- | --- | --- |
| A | 总架构、公共平台、数据库、公共前端、配置、CI 与最终集成 | [A](roles/A.md) |
| B | Resume、编辑保存与历史 | [B](roles/B.md) |
| C | Jobs、Matching、Embedding | [C](roles/C.md) |
| D | Diagnosis、STAR 与定向建议 | [D](roles/D.md) |
| E | Analytics、市场样本、统计口径与模块测试 | [E](roles/E.md) |

业务模块通过[API 契约](api-contract.md)、公共 Schema 和 ports 交互，不调用其他模块内部实现。四个公开 provider 保持 resume、jobs、diagnosis、analytics；Matching 和 Embedding 位于 jobs。

A 统筹公共数据库、依赖、配置及共享前端。C 定义向量模型、维度、距离及评分需求，A 实施存储和迁移。各成员自测自己的模块，公共需求写入集成请求；各成员负责本模块测试，A 组织系统验证、汇总并集成。每个文件仅有一个修改负责人；公共文件归 A，业务模块归 B–E。具体边界见[独占范围](../T5_FIVE_PERSON_ALLOCATION.md#3-独占文件范围)，跨模块需求由目标文件负责人实施。历史请求和验收按当时事实保留。

main 为维护集成基线，从 main 创建任务分支、PR 指向 main，不自动合并。

## Git 流程

1. 开始前检查仓库、origin、工作区，fetch 后确认基线；保护已有修改，不覆盖未知内容。
2. 从最新 main 创建维护分支。允许 `feat/*`、`fix/*`、`chore/*`、`docs/*`、`test/*`、`refactor/*`，不要求 `-a` / `-d` 后缀；分支名须符合 Git ref 语法。PR 目标为 main。
3. 独立任务验证后只暂存明确文件并 commit/push；不重写已推送历史、不使用 force push 或 hard reset。合并由明确授权及仓库保护规则决定，不自动 merge main。
4. main 和上述维护分支的 push、所有 PR 均运行 CI。`check_scope --ci` 校验分支/目标，并扫描当前全部 Git 跟踪文件：禁止 `.env`、`__pycache__`、`.pyc`、`.db` 和超过 5 MiB 的文件。未跟踪本地文件不属于交付扫描；该检查不替代完整密钥扫描。
5. CI 不按 A/D owner 限制现代 PR 路径；始终运行四模块入口/测试存在性检查、完整 pytest、Ruff、前端与 PostgreSQL 检查。Resume/Diagnosis 契约探测保持离线，不调用付费模型。
6. 五人职责用于任务分配与审查，不变更 CI 的模块名。历史 `check_scope D` 仍表示旧 jobs + diagnosis 路径自检，不表示当前 D 的角色，也不是维护 PR 的强制门槛。
7. 按变更涉及的模块提供准确提交、测试与实际业务效果证据；保留失败和未验证边界，不删除测试规避失败。历史系统验收记录保留当时事实。

不重写 Git 提交历史。权限、认证或无法安全处理的 Git 状态须明确说明。未要求后台监控时，不自动创建监控任务。

## 验证与证据

每项功能对应 T5 要求，按 Level 1 → Level 2 → Level 3 推进，测试随开发同步。未交付模块可用明确标记的 Mock，不把 Mock 视为真实验收通过。

保留原文和事实；无法解析的字段为空，不虚构经历、技能或量化成果。真实采样、课程样本、合成演示分别标注，个人信息脱敏、密钥不入库。图表注明来源、样本量、时间范围与缺失值口径，不将少量 JD 外推整个市场。

收尾列出分支、commit、文件、模块验收与集成、实际检查和待办。AI 需求拆解、设计、编码、测试、文档及联调过程仅记录实际证据，不编造结果。
