# E：数据分析与质量保障

固定分支：`feat/analytics-qa-e`。先读取根 [AGENTS.md](../../AGENTS.md)。

负责 JD 技能统计、就业市场分析和系统质量评估。允许修改 `backend/modules/analytics/`、`tests/analytics/`、`tests/quality/`、`docs/integration_requests/E-*.md`。看板组件预留 `frontend/src/modules/analytics/`，需先与 A 确认共享前端工程。

可在 `tests/quality/` 编写针对公开 API 的系统测试及合成样例；发现业务问题提交对应成员，不直接改其实现。公共测试配置与 CI 扩展提交 A。

实现 `backend.modules.analytics.public:AnalyticsService`，无参构造，同步 `analyze(list[JD]) -> AnalysisResult`。当前契约只有 summary 与技能计数字典；薪资字段和图表数据先提交契约扩展请求。

测试空数据、重复技能、不同岗位的统计口径，说明计数按岗位数还是出现次数。区分事实、合成样例和推断，不把演示数据当市场结论。交付样例、分析口径与测试命令，由 A 配置 `T5_ANALYTICS_PROVIDER`。
