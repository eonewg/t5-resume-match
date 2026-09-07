# B：简历模块

固定分支：`feat/resume-b`。先读取根 [AGENTS.md](../../AGENTS.md)。

负责简历文本解析、结构化内容编辑与校验。允许修改 `backend/modules/resume/`、`tests/resume/`、`docs/integration_requests/B-*.md`。前端组件预留 `frontend/src/modules/resume/`；先与 A 确认公共前端技术栈，再在共享工程中开发组件。

不修改公共 Schema、数据库、路由挂载、全局依赖或其他成员模块。需要额外依赖或编辑保存接口时提交集成请求；现有公共 API 保存新简历记录，不原地更新旧记录。

实现 `backend.modules.resume.public:ResumeService`，无参构造，同步 `parse(TextInput) -> ResumeData`，遵守 `backend/core/ports.py`。保留原文，解析不出的字段使用契约允许的空值，不虚构学历和经历。

提供中文/英文、空白、缺失字段、重复技能等测试；用固定原文验证结构化输出及原文保留。交付公开入口、样例、测试命令和依赖请求，由 A 配置 `T5_RESUME_PROVIDER` 并验证集成。
