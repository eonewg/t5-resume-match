# 团队开发上手

## 统一基线

[PR #1](https://github.com/eonewg/t5-resume-match/pull/1) 将公共骨架作为团队开发基线合入 main。先确认 PR 状态为 Merged，再从 `origin/main` 建立角色分支；不要直接在 A 分支提交业务代码。若 PR 尚未合并且需提前开发，可明确从 `origin/feat/core-a` 建角色分支，再由 A 协调后续同步。下面默认 PR 已合并。

## 成员启动

仓库为私有仓库，成员需有读取/推送权限；所有者需按真实 GitHub 用户名授予访问权限，本次未添加协作者。

```powershell
git clone https://github.com/eonewg/t5-resume-match.git
cd t5-resume-match
```

在 Agent 中粘贴对应任务，普通 Git 操作由 Agent 按根 AGENTS.md 执行：

| 成员 | 可直接使用的任务 |
| --- | --- |
| A | 你负责 A。读取 AGENTS.md 和 docs/roles/A.md，在 feat/core-a 维护公共架构与模块集成。 |
| B | 你负责 B。读取 AGENTS.md 和 docs/roles/B.md，在 feat/resume-b 实现简历模块，通过公开接口交付。 |
| C | 你负责 C。读取 AGENTS.md 和 docs/roles/C.md，在 feat/matching-c 实现 JD 与可解释匹配模块。 |
| D | 你负责 D。读取 AGENTS.md 和 docs/roles/D.md，在 feat/diagnosis-d 实现 AI 诊断模块。 |
| E | 你负责 E。读取 AGENTS.md 和 docs/roles/E.md，在 feat/analytics-qa-e 实现数据分析与质量保障。 |

先阅读 [接口契约](api-contract.md)、[架构说明](architecture.md) 和自己的角色文件。根 AGENTS.md 现在是团队规则，不默认所有人承担 A。同一工作目录不要同时切换多个角色分支，使用各自 clone 或独立 worktree。

## 第一轮交付

1. B/C 优先用合成简历与 JD 实现真实解析及关键词匹配；D/E 可以基于公开 Schema 和测试替身并行开发。
2. 成员交付公开服务类、模块测试、输入输出样例，以及依赖/配置/契约变更请求。
3. A 检查请求并接入 provider，先跑通 B+C，再加入 D/E；Mock 不代表真实模块完成。
4. UI 开发先与 A 对齐公共前端壳。当前只有交互式 API 文档，尚无正式前端工程，避免各模块工程配置不兼容。

成员 PR 目标设为 `feat/core-a`，由 A 对准确提交验收后逐个集成，测试失败时停止后续合并；不要将成员 PR 直接指向 main。验收结论为 PASS/BLOCKED/ADAPT，记录在 [验收台账](acceptance.md)。四个模块均 PASS 且完整联调通过后，再由 A 完成最终系统的 main 合并。本次 PR #1 仅是获授权的公共开发基线，不代表真实业务模块已完成。
