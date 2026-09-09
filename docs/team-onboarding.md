# 团队维护上手

PR #9 已合入 main。当前统一从最新 main 开始维护；旧 A/D 集成分支不再使用或恢复。
功能与模块职责见 [T5 需求](../T5_REQUIREMENTS_MATRIX.md)、[A](roles/A.md)、[D](roles/D.md)，
当前流程以 [团队约定](team-rules.md) 为准。

## 获取与创建维护分支

```powershell
git clone https://github.com/eonewg/t5-resume-match.git
cd t5-resume-match
git switch main
git pull --ff-only origin main
git status
# 确认工作区干净后，按实际任务选择名称：
git switch -c fix/your-topic
```

已有 checkout 先保护本地修改；已有维护分支继续在原分支工作，不重复创建或重写历史。
允许 `feat/*`、`fix/*`、`chore/*`、`docs/*`、`test/*`、`refactor/*`，无需 A/D 后缀，PR 指向 main。
个人 AGENTS.md 保持本地、不提交；其中若仍有开发期分支指令，应按当前明确任务与团队维护流程更新本地入口。

## 开发、验证与交付

A 继续协作维护公共平台、Resume、Analytics、数据库与质量；D 继续协作维护 Jobs/Matching、Embedding、Diagnosis。
这些职责用于审查，不再通过现代 PR 的分支后缀强制限定路径。
按 [模块自检指南](member-development.md) 验证公开契约、相关业务与边界，再运行完整检查。

只暂存本次文件，commit/push 到维护分支并创建 PR → main。PR 说明变更行为、准确 SHA、验证及未验证项；
不提交密钥或本地数据库，不自动合并，不改写历史验收事实。
