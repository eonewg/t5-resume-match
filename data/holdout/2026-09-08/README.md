# 独立验收材料 · 2026-09-08

本批 **5 个真实 JD + 3 份作者公开的学生时期简历**，用于后续 keyword / embedding、技能与表达 gap 及最终报告。
与既有 `data/jd`、`data/resumes` 和 D 的 30 JD / 40 配对样本内观察分开管理。
采集发生在冻结 D 关键词提交 `fe3dfbb65ec5fe46852a6fb9ddd0a42adf2c92f5` 之后，未用本批调整词表。

## 来源与材料

`manifest.json` 列出全部记录。每条包含源链接、采集时间、快照路径和 SHA-256；简历还包含固定 Git commit、学生状态证据及 MIT 许可。

| 编号 | 内容 | 来源 |
| --- | --- | --- |
| holdout-jd-01 | Graduate Software Engineer, Open Source and Linux | [Canonical](https://job-boards.greenhouse.io/canonical/jobs/8142329) |
| holdout-jd-02 | Junior Linux Kernel Engineer - Ubuntu | [Canonical](https://job-boards.greenhouse.io/canonical/jobs/5370815) |
| holdout-jd-03 | Junior Ubuntu Software Engineer | [Canonical](https://job-boards.greenhouse.io/canonical/jobs/6707669) |
| holdout-jd-04 | Distributed Systems Testing Software Engineer, Python / Go | [Canonical](https://job-boards.greenhouse.io/canonical/jobs/2969042) |
| holdout-jd-05 | Junior Product Manager | [Canonical](https://job-boards.greenhouse.io/canonical/jobs/6980706) |
| student-01 | 2018 年计算机本科高年级学生简历 | [作者公开源文件](https://github.com/dickwyn/resume/blob/cca65404bcca1627aa469c4757b3cf6a17f9ff4b/resume-dickwyn.tex) |
| student-02 | 数据科学与大数据技术本科生，含并行计算项目 | [作者公开源文件](https://github.com/NeverGpDzy/ZhiyuDing-latex-resume/blob/e60ae0a7c71f22219848b86adb8e0c6ae1bc430b/resume.tex) |
| student-03 | 预计 2023 年毕业的化学工程本科生，含 Python 科研经历 | [作者公开源文件](https://github.com/tengjuilin/markdown-resume/blob/9df2a0d20b9be119f3e27c4fc48b58f4c6f5fc48/source/resume.md) |

JD 来自招聘方公开 Greenhouse API，保留完整描述 HTML，并转换为纯文本；不把福利中的 USD 2,000 学习预算当成薪资。
没有可靠薪资区间时，`salary/salary_min/salary_max/currency/salary_period` 均为空，不猜测或强制换算。

简历来自作者本人发布的个人履历仓库，不是空模板或合成姓名替换模板。
去掉了顶部姓名、邮箱、电话、个人主页和排版前导；保留项目、学校、时期、技能及原有数字。
LaTeX/Markdown 转纯文本只去排版标记，不翻译、不增加经历或技能；脱敏源文件保存在 `sources/`，许可在 `licenses/`。
源 SHA 是按 UTF-8 解码并规范化文本换行后计算的内容哈希，不是下载文件的字节哈希。

## 使用口径

- 这些是**公开自述**的学生时期履历；未独立核验学历、排名和项目成果。历史简历不代表作者现在仍是学生。
- 保留来源与版权归属，属于去标识化，不是不可逆匿名；不要从源链接重新导入联系方式。
- JD 仅覆盖同一雇主的 5 个岗位，文本为英文；存在雇主、语言、地区和时间偏差。不能宣称代表中国学生招聘市场。
- 原有真实采样 JD 和本批共同保留。若课程要求本班同学授权提供的当前简历，需要另行采集，不能将公开历史履历改标为本班样本。
- 这阶段交付材料与真实性/兼容性校验，**没有**生成泛化指标、人工金标准或 embedding 输出。

后续评测先固定此 manifest 与代码 SHA，再由独立人工标注技能/工具、必选/任选/加分要求和表达 gap，保留分歧。
简历结构化技能必须经人工确认，原始解析结果单独报告，避免把解析遗漏误算为匹配算法问题。
固定相同的输入和 15 组笛卡尔配对，分别记录 keyword 分数、embedding 原始距离、组合评分及理由。
注明指标分母与缺失值，不把关键词分当作录用概率。若用本批调参，它就不再是测试集，须另建独立数据。

校验：`uv run --locked python -m scripts.validate_holdout`。
