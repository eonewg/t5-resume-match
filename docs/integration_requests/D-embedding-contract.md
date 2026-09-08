# D Level 2：语义匹配设计与 A 最小集成请求

当前预处理已升级为 `t5-clauses-v2`，先排除否定/学习意向/无关句段再切片。
下文 v1 模型与评分方案保持，v1 文本预处理被 [过滤与验证记录](D-filter-validation.md) 替代；不得复用 v1 缓存。

分支 `feat/intelligence-d` → `feat/core-a`；初始同步基线 `ebbe251`，PR #5 已由 A 合并，无冲突。
本阶段保留关键词匹配，添加可选本地模型增强；没有公共 schema/数据库/导航/核心层变更。

## 固定方案 v1

- Provider：D `EmbeddingProvider.encode(list[str]) -> list[list[float]]`，同步批量接口；内置 `LocalMiniLM`。
- 模型：[sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)。
  固定 revision `e8f8c211226b894fcb81acc59f3b34ba3efd5f42`；384 维；官方模型 mean pooling，最多 128 token。
  使用 SentenceTransformers 适配器本地 CPU 推理；模型与可选依赖预先安装，业务请求禁止自动下载。
- JD 对象：`jd_text` 的句子片段。简历对象：用户确认的 `experience + skills`，不向量化 name/company/education 或整个 raw_text，
  不把原文中已经删除的技能重新计入关键词。经历可能仍含个人信息，因此不上传外部服务、不缓存原文。
- 预处理 v1：NFKC；按句号/问号/感叹号/分号/换行断句；合并空白；每段最多 80 字符；去除空段并按出现顺序去重。
  每侧最多 32 段。保留语义大小写，不加 prompt/prefix，不把全部文档拼成单个截断向量。
  tokenizer 检测超过 128 token、片段超限则整次降级，不静默截断。输入对象和原文不修改。
- 距离：L2 归一化向量的 cosine；显式检查批量数量、384 维、有限数字与非零范数。
  每个 JD 片段取简历片段中的最大 cosine。`semantic_score = 100 × mean(max(0, cosine_i))`。
  负相似度映射 0，正交映射 0，相同方向映射 100；不采用 `(cos+1)/2` 将正交误映射为 50。
- 组合：`final = round((1-alpha)*keyword_score + alpha*semantic_score, 2)`。
  默认 alpha=0.2，通过 `T5_JOBS_SEMANTIC_WEIGHT` 调整，允许 0–0.5，关键词权重始终至少一半。
  **理由是限制未校准模型相对关键词基线的最大影响为 20 分**，不是声称 0.2 是统计最优值；样本运行前固定，不按效果调参。
  语义既可加分也可减分，不用只加分公式。alpha=0 不调用模型。
- 解释：直接命中和未命中仍完全来自关键词集合；语义相近不移除 missing，不证明技能已掌握。
  展示分项分数、权重、计算方式和最多 3 个 JD/简历片段对照；完整对照存于 D 内部 `MatchDetails`。
  `match()` 仍只返回现有 MatchResult，未擅自增加公共 metadata 字段。

## 开关、降级与当前限制

默认 `T5_JOBS_EMBEDDING=off`，返回原 Level 1 结果。
显式 `local` 且本地模型及依赖可用时进行选定 JD/简历的内存 pair scoring。
模型失败、缺失依赖/模型、坏向量、超出输入预算、没有已确认简历内容时自动返回原关键词数值及原 gap，追加降级原因。
异常细节不展示、不写日志，避免泄漏原文、路径或密钥。配置权重非法明确报配置错误，不伪装正常。
JD 无 skills 但有文本时可以提供低权重语义信号，明确关键词 0 为占位、不能算完整评估。
真实 Diagnosis 开关/失败行为没有改动；本地 embedding 不等于 DeepSeek 诊断。

当前不依赖向量库执行单对本地实验；没有向量库时默认仍为 keyword-only。
显式本地实验是无持久化模式，不能作为 pgvector 已接通。没有实现批量检索、持久化、索引或数据库降级切换。
固定模型可能误判否定/学习意向/相关概念，片段均值也可能受 JD 福利等非要求文本影响。
默认不启用，需独立人工验收后再决定生产开关；不能将一个 cosine 或这批合成样本视为岗位适任性结论。

## 请求 A 的最小公共接口（待确定，不提前实现）

1. 同步批量读写向量的公共 port：按文档类型/ID、内容哈希、模型 ID+revision、dimension=384、预处理版本取/存片段向量。
   要求返回向量的相同版本信息，缺失与暂不可用有明确状态；更新/删除简历和 JD 时失效，避免旧内容错配。
2. 若公共服务提供检索：明确 cosine 距离/相似度方向、过滤文档范围与同模型版本；D 不假定 pgvector 返回值已是相似度。
   本阶段 pair scoring 仅需读取两个已选文档的片段向量，不强求先实现全库检索。
3. 如需公共展示模式/分项分数，请 A 提供可选 metadata（keyword_score、semantic_score、final_score、status、model/version）。
   当前通过已有 gap_analysis 完整解释，前端采用中性“匹配分”标签，不依赖猜测公共未定义字段。
4. A 决定可选部署依赖及缓存路径：本轮在仓库外 uv 临时环境验证 sentence-transformers==5.1.0、torch==2.8.0+cpu；
   未修改 pyproject.toml / uv.lock。公共安装需由 A 锁定依赖并预置固定 revision 模型。

仅通过 A 最终提供的 port 接入；D 不创建表、迁移、vector 列、索引，也不读取公共数据库内部对象。

## 验证方法

默认 `pytest` 仅用替身，覆盖正常语义/组合、关键词精确保留、失败降级、坏向量、负 cosine、输入预算、空输入、公共 API 保存读回。
真实模型与独立新样本另用 `tests/jobs/evaluate_semantic.py` 显式运行，不放入 CI 默认测试，失败不生成成功报告。
模型需要预先缓存；报告见 [语义样本评估](D-semantic-evaluation.md)。
2026-09-08 实测：完整 pytest **147 passed**（Jobs 54、Diagnosis 44、core 32、Resume 17）；
Ruff check / format check 通过（57 Python 文件），统一前端 **32 passed**；jobs / diagnosis 成员自检通过。
真实 Edge 在公共壳 D 预览中分别验证 keyword-only 和真实本地模型增强：保存/选择、分项解释、gap、失败重试、Mock、长文本/XSS、390px 与导航清理通过。
一例关键词 33.33，语义 61.68，组合 39；缺失 Docker / SQL 清单保持不变。真实模型独立对照排序 6/8 正确，2 个难负例错误如实记录。
首次使用 `uvicorn` 可执行入口未载入 uv 临时模型依赖，浏览器确实显示关键词降级；改为同环境 `python -m uvicorn` 后真实模型路径通过。
这不是 PostgreSQL/pgvector 验证，也不是语义业务验收通过。

仓库外临时运行方式（PowerShell，首次下载仅公开模型，不上传简历；A 决定正式依赖）：

```powershell
# 显式预下载固定模型；此步骤不在服务或默认测试中执行
uv run --quiet --locked --with sentence-transformers==5.1.0 --with torch==2.8.0+cpu --extra-index-url https://download.pytorch.org/whl/cpu python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',revision='e8f8c211226b894fcb81acc59f3b34ba3efd5f42',device='cpu')"
$env:PYTHONPATH='.'
$env:PYTHONUTF8='1'
$env:OMP_NUM_THREADS='2'
$env:HF_HUB_OFFLINE='1'
uv run --quiet --locked --with sentence-transformers==5.1.0 --with torch==2.8.0+cpu --extra-index-url https://download.pytorch.org/whl/cpu python tests/jobs/evaluate_semantic.py
# 独立浏览器测试服务器，另一终端设置 T5_SMOKE_SEMANTIC=1 后运行 browser-smoke.cjs
$env:T5_JOBS_EMBEDDING='local'
$env:T5_JOBS_PROVIDER='backend.modules.jobs.public:JobsService'
$env:T5_DATABASE_URL='sqlite://'
uv run --quiet --locked --with sentence-transformers==5.1.0 --with torch==2.8.0+cpu --extra-index-url https://download.pytorch.org/whl/cpu python -m uvicorn backend.main:app --host 127.0.0.1 --port 8768
```
