# OTR Mobile 2.0 — Import Workbench V2.1

**Universal Document Inspector — Product & UI Implementation Contract**

**Date:** 2026-10-16  
**Status:** Owner-approved implementation direction  
**Scope:** Local DEV Import Workbench  
**Visual Reference:** OTR Import Workbench V2.1 — Universal Document Inspector

## 1. 核心目标

将现有 Workbench 升级为一个可反复操作、可观察、可比较的旅行文件解析测试环境。

Owner 不需要查看 JSON 或 Codex 日志，就能够：

1. 上传任意受支持格式的旅行文件，包括没有旅行信息的文件。
2. 查看每份文件实际提取出的内容。
3. 观察确定性规则、Apple 本地模型和未来远端模型各自的贡献。
4. 查看一个 Input 产生零个、一个或多个业务解释结果。
5. 判断哪些字段有效、哪些缺失、哪些被拒绝，以及原因。
6. 点击字段定位原始文件证据。
7. 重复运行同一文件，对比不同版本的解析结果。
8. 录入人工标准答案，衡量解析质量和模型增量价值。

**核心原则：Document-first、Booking-type-agnostic、Evidence-first。**

Workbench 不得预设所有文件都是 Flight，也不得假定每份文件一定产生 Booking。

## 2. 信息架构

采用桌面优先的五个工作区。

| 工作区 | 主要职责 |
|---|---|
| Test | 上传文件、选择 Runner、执行解析 |
| Inspect | 原件预览、业务候选、字段与证据 |
| Compare | 同一文件不同 Run 的结果比较 |
| Ground Truth | 人工标注和质量评估 |
| Runs | 历史执行、重跑、版本和导出 |

Settings / Developer Details 作为辅助入口。

默认打开最近一次 Inspect；首次使用或无历史记录时打开 Test。

支持中英文切换。

## 3. 通用文件与业务类型

### 3.1 输入文件

在现有 Runner 能力范围内支持：

- PDF：文本 PDF、扫描 PDF。
- 图片：JPEG、PNG。
- UTF-8 文本。
- 已有合法 Trace 文件的只读导入。

Email、网页、Office、Wallet Pass 等未来格式只在相应输入适配器真实可用时开放，不得假装已经支持。

### 3.2 业务解释类型

Workbench 的展示模型必须能够容纳：

- Flight / Air Transport
- Stay / Accommodation
- Car Rental
- Scheduled Transport：Train、Bus、Ferry、Water Taxi 等
- Activity / Tour / Event
- Ticket / Pass
- Mixed / Multiple
- Unclassified / Unsupported

这些是通用 UI 目标类型，不代表相应解释器均已实现。

实际类型名称、字段和身份关系以现有 OTR Import/Core 合同为准。

不得为展示方便创造新的 Canonical Booking 或 Trip Item 类型。

### 3.3 N→M 关系

必须支持：

- 一个 Input → 零个业务解释结果。
- 一个 Input → 一个解释结果。
- 一个 Input → 多个不同业务解释结果。
- 多个 Input → 同一 Booking 的相关证据。
- 一个 Booking → 多个 Segment 或 Trip Item。

Workbench 必须分别展示 Input、Interpretation、Candidate、Booking、Segment 和 Canonical Item 的真实身份与阶段。

**解释器输出不等于正式 Candidate；Candidate 不等于已接纳的 Booking。**

## 4. Inspect — 核心三栏界面

参照附带 V2.1 视觉图。

### 左栏：Document Preview

- PDF 原始页面预览、翻页、缩放和页缩略图。
- 图片原图预览。
- 文本文件原文展示。
- 当前选中字段对应的证据高亮。
- 多页和多 Input 切换。
- 原文提取文本及 OCR 框查看。

仅当真实 Trace 提供可靠页码、坐标或字符范围时才进行精确定位。

没有坐标时展示原文片段和可用页码；不能伪造定位。

### 中栏：Parsed Results

顶部显示真实识别结果，例如：

Flight ×1 / Stay ×1 / Rental ×1 / Unclassified ×1

这些数量必须来自实际诊断输出。

提供两个视图：

**By Business Result**

按解释结果分组，动态显示对应业务字段。

**By Field**

跨解释结果查看全部字段，方便诊断重复、冲突和遗漏。

每个业务结果应显示：

- 类型及真实身份。
- Interpretation / Candidate / Admission 阶段。
- 完整、部分、证据不足、未支持等可读诊断状态。
- 对应 Input 来源。
- 关联 Segment 数量（如适用）。
- 字段列表及证据状态。

字段行包含名称、值、来源、验证结果和详情入口。

不允许仅用一个绿色 `Confirmed` 混合表达模型认可、证据有效、用户确认及正式 Admission。

### 右栏：Evidence & Interpretation

选中任意字段后，展示其完整处理过程：

1. 原件文字或 OCR 观察。
2. 确定性解析候选。
3. Apple 本地模型观察或建议。
4. 远端模型结果（仅实际调用时）。
5. Evidence Validation。
6. Consolidation / Conflict Resolution。
7. Typed Interpretation。
8. Candidate / Admission（仅实际执行时）。

每一步展示：

- 实际输入与输出。
- 字段新增、保留、修改、拒绝或缺失。
- 原文证据。
- 接受/拒绝原因。
- 已记录的耗时。
- 当前使用的规则或模型版本（Developer Details）。

如果阶段未运行，显示 `Not Run`。

如果 Trace 未记录相关信息，显示 `Not Recorded`。

不得根据最终结果虚构中间处理过程。

## 5. Stage Contribution Matrix

提供可切换的阶段矩阵。

| 字段 | Extraction | Rules | Apple Local | Evidence | Typed |
|---|---|---|---|---|---|
| Flight Number | 原文存在 | 提取成功 | 可能确认 | 有效 | 采用 |
| Departure Time | 原文存在 | 未识别 | 未识别 | 无候选 | 缺失 |
| Cabin | 原文存在 | 未识别 | 模型提出 | 证据拒绝 | 未采用 |

上述仅为展示示例。

实际矩阵必须来自真实 Trace。

阶段统计至少区分：

- Extracted observations
- Proposed fields
- Evidence-valid fields
- Rejected fields
- Typed accepted fields
- Missing required fields

这些数量不能混算。

## 6. 无法识别文件与异常状态

Workbench 必须把“没有结果”和“执行失败”分开。

### 6.1 无旅行内容

文件读取与适用的提取成功，但没有足够旅行相关信息。

展示：

**未发现可用的旅行预订信息**

显示实际运行的阶段和零结果，不生成虚构 Booking。

### 6.2 证据不足

发现旅行线索，但缺少形成可信业务解释所需的关键字段。

展示已发现字段、缺失字段和原因。

### 6.3 不支持的业务内容

文件可能包含旅行信息，但当前解释器不支持该业务类型。

展示提取结果和能力限制。

### 6.4 提取失败

例如损坏文件、加密 PDF、无法读取的内容。

明确显示提取失败，不得报告为无旅行内容。

### 6.5 模型不可用或超时

保留已成功的确定性解析结果。

明确标记模型未执行或执行失败，不得将其解释为模型确认文件没有旅行内容。

### 6.6 混合结果

一个文件中部分业务解释成功、部分失败时，逐项展示。

不得因为其中一项失败而清空其他有效结果。

以上属于诊断展示分类；本合同不授权新增正式数据库枚举或业务状态机。

## 7. Test — 上传与运行

支持多文件选择、拖放和已保存 Input 的重复运行。

执行模式：

- Mac Local Component
- iOS Native Diagnostic Component
- 已有 Trace 的只读查看

清楚显示每个 Runner 的连接状态、支持能力和限制。

iOS 不可用时不得静默切换 Mac 并声称 Native 成功。

默认 `DIAGNOSTIC_ONLY`：

- 不提交正式 Capture Batch。
- 不上传 DEV Storage。
- 不触发 Admission。
- 不修改 Canonical Trip。
- 不发送通知。
- 不调用未经授权的远端模型。

允许重复测试相同原件，不应要求每次重新选择文件或重新安装 App。

## 8. Compare — 多次解析比较

只能比较同一 Input 或经过明确确认具有相同原件身份的 Run。

默认选择最近两个不同 Run。

比较内容：

- 业务结果数量与类型。
- 新增、丢失、修改的字段。
- Evidence 有效性变化。
- Typed 完整性变化。
- 多 Segment 结构变化。
- 解析耗时变化。
- 模型/规则版本差异。
- Local/Remote 模型的增量贡献。

结果分为 Improved / Regressed / Changed / Unchanged / Not Comparable。

没有人工 Ground Truth 时，不得仅凭字段数量增加宣称准确率提高。

## 9. Ground Truth — 人工标准答案

以普通表单代替 JSON 编辑。

根据实际业务类型加载已有字段定义。

支持：

- 零个、一个或多个业务结果。
- 多 Segment。
- 多旅客/参与人（如适用）。
- 字段正确值。
- 原件未提供。
- 尚未人工检查。
- 业务类型识别错误或无相关内容。

允许人工新增、删除、拆分或合并标准答案中的业务结果，但这些操作仅修改诊断标注，不修改正式 OTR 数据。

准确率必须以人工确认的数据为依据。

至少提供：

- 字段 Precision / Recall（有适用 Ground Truth 时）。
- 类型识别准确情况。
- Evidence 有效率。
- Typed 完整性。
- Local 模型增量贡献。
- Remote 升级率及实际成本（仅实际调用时）。
- 运行耗时。

未标注的数据显示 N/A，不显示虚假的 0%。

## 10. 技术诊断与版本信息

原始 JSON、Run ID、Input ID、SHA-256、模型标识、规则版本、Trace Schema、内部错误码和耗时明细全部保留。

但默认放在 Developer Details 中。

用户界面优先显示：

- 原始文件名。
- 运行时间。
- Runner。
- 人类可读状态。
- 实际字段和证据。

不得删除或降低现有工程诊断能力。

## 11. 实施范围与安全边界

复用已有：

- Workbench 本地 HTTP 服务。
- Mac Runner。
- iOS Native Bridge。
- C4 Trace。
- Evidence Validator。
- Typed Interpretation。
- Replay/Compare。
- Ground Truth 存储。

禁止：

- 重写第二套解析引擎。
- 为未来类型提前实现全部解析器。
- 新增生产数据库 Migration。
- 修改 Auth/RLS 或 Admission 业务合同。
- 将测试原件或敏感 Trace 提交 Git。
- 使用示例数据冒充真实解析结果。
- 为匹配视觉参考虚构 Booking 或字段。

保持本地 loopback 访问和诊断数据隔离。

## 12. 实施优先级

### V2.1-A — Universal Inspect

最高优先级。

完成通用 Document Preview、业务结果分组、动态字段、Evidence Details、空结果状态。

用已有真实 PDF/JPG 验证。

### V2.1-B — Stage Contribution

补齐阶段贡献矩阵、拒绝原因和实际 Typed 缺失分析。

仅展示 Trace 已经证明的信息。

### V2.1-C — Compare / Ground Truth

完善字段级 Diff、动态业务标注表单和真实质量指标。

### V2.1-D — Visual Polish

按视觉参考统一布局、响应式、状态颜色、图标和中英文。

不要在 Inspect 尚不可用时优先进行纯 CSS 美化。

## 13. 最小验收场景

1. 真实 Flight PDF：查看原文、规则字段、Apple 输出、证据拒绝及 Typed 缺失。
2. 真实 JPG：区分 OCR、确定性字段和模型新增观察。
3. Mixed Document：一个 Input 产生多个不同业务结果；没有实际解释器时以真实测试 Trace 或明确标注的合成 UI Fixture 检查布局，不能冒充 Runtime PASS。
4. Empty Image：零相关结果，且状态诚实。
5. Unsupported Booking：有内容但没有对应解释器。
6. Corrupt PDF：提取失败，而不是无旅行内容。
7. Multi-segment Flight：按真实身份展示多个 Segment。
8. Same Input Replay：不同 Run 的字段与证据变化。
9. Ground Truth Empty：准确率 N/A。
10. iOS Unavailable：清楚提示，不假装 Native 执行成功。

## 14. 交付要求

交付：

- 可直接打开的本地 Workbench 地址。
- 实施 Commit SHA。
- 一个真实 PDF 和 JPG 的可操作 Inspect。
- 一张真实运行的 Inspect 截图。
- 可用与尚不可用的业务类型矩阵。
- 现有 Trace 不足以支持的功能清单。
- 简短的启动和操作说明。

本轮只要求基础桌面视觉验收，不需要完整截图矩阵。

**完成后交 Owner 实际试用，不自动进入新一轮 UI 扩展。**

## 15. 视觉参考优先级

实施依据优先顺序：

1. 已批准的 OTR Import/Core 业务合同。
2. 本 V2.1 Product & UI Contract。
3. 附带的 V2.1 Visual Reference。
4. 现有 Workbench 技术实现。

参考图中的文件、Booking、字段、数量、状态和证据全部是示例。

不得把 `Confirmed` 视觉状态解释成正式 Admission，也不得把 Flight、Hotel、Rental 的示例数据写入真实运行结果。