# 团队开发上手

课程小组组织不变，主要代码 owner 为 A/D。先读 [T5 需求](../T5_REQUIREMENTS_MATRIX.md)、[两人分工](../T5_TWO_PERSON_ALLOCATION_STRICT.md)、[团队约定](team-rules.md) 和 [接口契约](api-contract.md)。

## 统一基线

新开发使用最新 A 集成分支；D 不从旧 main 或历史 diagnosis 分支继续新任务：

```powershell
git clone --branch feat/core-a https://github.com/eonewg/t5-resume-match.git
cd t5-resume-match
git fetch origin
```

A 留在 `feat/core-a`。D 首次建分支时执行：

```powershell
git switch -c feat/intelligence-d origin/feat/core-a
git push -u origin feat/intelligence-d
```

本地或远端已有 D 分支时切换/跟踪已有分支，不重复创建或重写历史；同步 A 用 merge 并保护本地修改。普通 Git 工作交由 Agent 自动完成。不同 owner 使用独立 clone/worktree。

个人 AGENTS.md 留本地、不纳入版本控制。A 可依据根目录 [严格版说明](../AGENTS_A_T5_STRICT.md) 设置入口；D 的本地入口引用 [D 角色说明](roles/D.md)。不要把 A 的个人入口复制给 D。旧分支如果仍跟踪 AGENTS.md，切换前先在仓库外备份个人文件。

## 开始开发

| Owner | 任务 |
| --- | --- |
| A | 读取本地 AGENTS.md 与 docs/roles/A.md，在 feat/core-a 完成公共平台、resume、analytics、数据库和系统验收 |
| D | 读取本地 AGENTS.md 与 docs/roles/D.md，在 feat/intelligence-d 完成 jobs/matching 并继续完善已集成 diagnosis |

按 [开发自检指南](member-development.md) 先运行合成接入示例；示例通过不代表业务完成。按 Level 1 → Level 2 → Level 3 推进：A 做简历编辑闭环，D 做关键词匹配基线；缺少对方模块时使用公开 Schema/Mock。D 提交薪资/向量公共需求，A 实施数据库与契约，再完成市场图表和全链路演示。

D 的 PR 仅指向 feat/core-a，准确提交通过模块验收后集成。最终 A 仅通过 feat/core-a → main PR 交付，门槛见 [验收台账](acceptance.md)。历史 diagnosis 的 PASS 和公共基线合并不代表 T5 全部完成。
