# D 模块交接与集成请求

> 历史交付记录：PR #4 已由 A 合入 core-a。A 已在 `93e1b12` 注册 diagnosis 页面并补充配置说明。
> 以下验证数字及旧 PR 目标限制为当时记录，不代表新两人开发的状态。
> 当前分支/责任/待办以 [D 严格版计划](D-strict-plan.md) 为准：新开发用 `feat/intelligence-d`，PR 目标 `feat/core-a`。

分支：`feat/diagnosis-d`。核心实现提交：`d1e030a`；文档及页面验证见本分支后续提交。
完整使用说明：[D README](../../backend/modules/diagnosis/README.md)。

## A 可直接接入的入口

```dotenv
T5_DIAGNOSIS_PROVIDER=backend.modules.diagnosis.public:DiagnosisService
DEEPSEEK_API_KEY=
T5_DIAGNOSIS_MODEL=deepseek-v4-flash
```

`DiagnosisService` 可无参构造，同步 `diagnose(DiagnosisInput) -> DiagnosisResult`。
保持公共 `summary + suggestions`，STAR、JD、关键词和风险按标签写入 suggestions。
已有公共 diagnoses/workflow 路由无需调整，也不需要数据库迁移。
没有配置密钥时诊断明确失败，不冒充 Mock 或成功结果。

## 请求 A 处理的公共事项

1. 在共享环境变量示例增加以上配置名及 README 中可选配置；密钥值保持空。
2. D 测试已迁移至 `tests/diagnosis`，适配 A 的自动发现；无需修改测试规则。
3. 公共组件已提供 `frontend/src/modules/diagnosis/index.js:mount`，
   可在 `/?preview=diagnosis#diagnosis` 预览。请 A 验收后在公共注册表正式挂载。
   旧独立页面仅保留兼容，不作为公共系统接入入口。
4. 公共输出已兼容，暂不请求丰富结构的公共 Schema/数据库升级。
5. 若统一依赖需处理 Starlette 的 HTTPX/AnyIO 弃用提示，由 A 更新根依赖并复验。
6. 用户明确要求本次 PR base=main，但 `scripts/check_scope --ci` 当前只允许成员
   PR 指向 feat/core-a。本次不修改/绕过规则；请 A 与用户确认目标分支策略。
7. 公共 API 客户端默认 45 秒，D 默认多次重试可能超过该时长。真实联调时请 A
   统一评估 UI 超时与模型超时配置；当前不修改公共 API 客户端。

不新增运行依赖：网络层为标准库，校验与独立页面使用仓库已有 Pydantic/FastAPI。
测试使用已有 dev 依赖；可选浏览器脚本所需 Playwright 未写入根依赖。

## 已验证

- 合并 `origin/main` 的 `c209eb0` 到 D 分支，无文本冲突；保留全部公共支持。
- `pytest -q`：69 passed（D 44、core 25）；`scripts.check_member D`：PASS。
- 全仓 Ruff check / format check 通过；`node scripts/check_frontend.mjs`：24 passed。
- 公共壳浏览器 smoke 通过：缺失选择、公共 API、Mock 标签、失败重试、长文本安全显示、
  390px 窄屏和切换页面后无重复事件。
- 真实 DiagnosisService 通过公共动态 Provider 装载（仅 LLM 网络部分被测试替身替换）。
- 公共 POST/GET diagnoses 保持关联 ID、公共字段和持久化；workflow 失败后不保留待写入匹配记录。
- 无真实密钥提交；相对最新 main 只修改 D 的 backend、tests、frontend 和 D-* 交接文件。
- PR 目标规则是已知例外，不能把指向 main 的 CI 检查描述为全通过。

## 待真实验收

需团队配置有效 DeepSeek API Key 后，使用已获同意的简历/JD样本实测输出事实、
针对性、延迟和费用。当前结果不能标记为“真实模型验证通过”。
待 A 审核合入集成分支；D 未修改 main 或其他成员分支。
