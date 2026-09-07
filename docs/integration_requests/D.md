# D 模块交接与集成请求

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
2. 合入后把 `backend/modules/diagnosis/tests` 加入统一 pytest/CI 收集路径。
3. 独立页面目前由 D 的 `web:create_app` 运行，Mock 使用 `web:create_demo_app`。
   公共前端工程尚未提供；请 A 决定最终页面入口及路由挂载，不要求其他成员调用 D 内部实现。
4. 公共输出已兼容，暂不请求丰富结构的公共 Schema/数据库升级。
5. 若统一依赖需处理 Starlette 的 HTTPX/AnyIO 弃用提示，由 A 更新根依赖并复验。

不新增运行依赖：网络层为标准库，校验与独立页面使用仓库已有 Pydantic/FastAPI。
测试使用已有 dev 依赖；可选浏览器脚本所需 Playwright 未写入根依赖。

## 已验证

- `pytest backend/modules/diagnosis/tests tests/core -q`：56 passed。
- Ruff 检查与格式校验；Mock 页面桌面/手机实际操作。
- 真实 DiagnosisService 通过公共动态 Provider 装载（仅 LLM 网络部分被测试替身替换）。
- 公共 POST/GET diagnoses 保持关联 ID、公共字段和持久化；workflow 失败后不保留待写入匹配记录。
- 无真实密钥提交，无其他成员目录/公共配置修改。

## 待真实验收

需团队配置有效 DeepSeek API Key 后，使用已获同意的简历/JD样本实测输出事实、
针对性、延迟和费用。当前结果不能标记为“真实模型验证通过”。
待 A 审核合入集成分支；D 未修改 main 或其他成员分支。
