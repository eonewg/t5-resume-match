# 团队开发上手

## 统一基线

A 的公共骨架在 `feat/core-a`，通过 PR 审阅后合入 main。PR 合并之前，main 仍只有初始化文件。成员优先在合并后从 `origin/main` 建立角色分支。

需要提前开发时，可以明确使用 `origin/feat/core-a` 作为临时分支基线，之后由 A 协调同步；不要从空 main 重建框架，也不要直接在 A 分支提交业务代码。下面默认 PR 已合并。

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
| C | 你负责 C。读取 AGENTS.md 和 docs/roles/C.md，在 feat/jobs-c 实现 JD 与可解释匹配模块。 |
| D | 你负责 D。读取 AGENTS.md 和 docs/roles/D.md，在 feat/diagnosis-d 实现 AI 诊断模块。 |
| E | 你负责 E。读取 AGENTS.md 和 docs/roles/E.md，在 feat/analytics-e 实现数据分析与质量保障。 |

先阅读 [接口契约](api-contract.md)、[架构说明](architecture.md) 和自己的角色文件。根 AGENTS.md 现在是团队规则，不默认所有人承担 A。同一工作目录不要同时切换多个角色分支，使用各自 clone 或独立 worktree。

## 第一轮交付

1. B/C 优先用合成简历与 JD 实现真实解析及关键词匹配；D/E 可以基于公开 Schema 和测试替身并行开发。
2. 成员交付公开服务类、模块测试、输入输出样例，以及依赖/配置/契约变更请求。
3. A 检查请求并接入 provider，先跑通 B+C，再加入 D/E；Mock 不代表真实模块完成。
4. UI 开发先与 A 对齐公共前端壳。当前只有交互式 API 文档，尚无正式前端工程，避免各模块工程配置不兼容。

角色分支通过 PR 审阅，由获授权的 A 处理最终合并。本次 A 的 PR 是公共基线交付，不代表真实业务模块已完成。
