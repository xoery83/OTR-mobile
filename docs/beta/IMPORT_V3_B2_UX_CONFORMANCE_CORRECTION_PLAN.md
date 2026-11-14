# Import V3 B2 UX 对齐审查与最小修复计划

2026-11-14 · Owner 有条件批准：仅 UX-C1 实施 · 基线 `d2c4d0c`

**结论：业务与数据验收保留，Capture / Activity / Results / Review 的视觉验收不通过。**
主要问题已有批准条款覆盖，无需重新设计。Slice 4 使用了 Foundation 控件和正确的结果数据，但没有落实 Blueprint 的组件组合、行结构、信息层次和主次操作。UI Guard PASS 不等于 UX Conformance PASS。暂停 Slice 5/6。

## 1. 本轮实际阅读与查看的原始材料

| 原始材料 | 实际路径与引用方式 | 权威性 / 阅读结果 |
| --- | --- | --- |
| CP-UX-01，2026-10-14 | `/Users/xoery/Downloads/OTR_CP_UX_01_CAPTURE_ENTRY_COMPOSER_CONNECTIONS_PRODUCT_DESIGN_DELTA_2026-10-14.md`；完整阅读 §§1–9 | 已批准；§§2–5 为入口、Sheet、Composer、草稿依据 |
| CP-UX-02，2026-10-14 | `/Users/xoery/Downloads/OTR_CP_UX_02_CAPTURE_SUBMISSION_ACTIVITY_LIFECYCLE_PRODUCT_DESIGN_DELTA_2026-10-14.md`；完整阅读 §§1–11 | 已批准；ACTIVITY-01/04R/06/07、§§3–5/8 为 Progress/Results/返回依据 |
| Review Product Delta + Blueprint V2，2026-10-15 | `/Users/xoery/Downloads/OTR_UPD_UX_02_REVIEW_FORM_RESOLUTION_PRODUCT_DESIGN_DELTA_2026-10-15.md`；`/Users/xoery/Downloads/OTR_UPD_UX_02_REVIEW_UI_INTERACTION_BLUEPRINT_V2_2026-10-15.md`；均完整阅读 | 已批准；VIS-01–04、§§1–7；具体几何为 PROVISIONAL，不冒充冻结的像素规范 |
| Composer amendment，2026-10-21 | `docs/ops/import-pre-submit-ux-20261021/HANDOFF.md`；Native 补充 `docs/ops/import-native-intake-20261021/HANDOFF.md` | 已读现存交接原文；未定位到独立命名的 Owner amendment 原文件，记为 **MISSING_SOURCE（独立原文）**，不将交接摘要重建为正式原文。Owner Slice 1 指令已明确再次批准紧凑附件菜单 |
| Import Activity Product Delta，2026-10-23 | `/Users/xoery/Downloads/Document Module Design V1/OTR_Import_Activity_Product_Design_Delta_20261023.docx` | 完整读取 OOXML 全文；以下用原文标题和段落号定位：List content ¶31–32、Status semantics ¶34–35、Detail reuse ¶37–38 |
| Import Activity UI Blueprint，2026-10-23 | 同目录 `OTR_Import_Activity_UI_Blueprint_20261023.docx` | 完整读取全文；Screen C ¶9–11、Screen D ¶12–14、Icon and typography ¶18–20 |
| 三张原 UX 参考图 | 同目录 `导入活动与 AI 会话界面蓝图.png`、`OTR移动文档UX蓝图海报.png`、`文档详情 UI 蓝图展示板.png` | **已实际打开查看**。本次主要采用第一张的第4/5面板（Progress / Results）；后两张只核对原件和关联入口，不扩大到 Documents 开发 |
| Review 独立视觉包 | V2 原文明确写明参考图包另行提供；当前 Intake 索引及上述材料未找到可核实的 Review V2 独立图片 | **MISSING_SOURCE（独立图片）**。不把 Activity 图当成 Review 图；以已读取 V2 结构图和 VIS 条款为准 |
| UI Foundation / Theme | `docs/architecture/ui-foundation.md`、`src/ui/visual.ts`、`src/ui/palette.ts`；术语依据 `docs/architecture/OTR_TERMINOLOGY_GLOSSARY.md` | 已读取 Foundation、检查相关 Theme tokens；业务语义不因视觉修正变化 |
| 当前批准计划 | `docs/beta/IMPORT_V3_B2_INCREMENTAL_DELIVERY_PLAN.md` 及 Owner 后续 Slice 3/4 指令 | 后续 Owner 决定优先：Production 自动 NEW/LINK，DEV 一次 Batch Confirm；保留真实 Linked / ABSTAIN 展示 |

**冲突处理：** 10月21日紧凑附件菜单优先于 CP-UX-01 §4.1 的旧三按钮；不恢复常驻 Files/Photos/Camera。参考图的彩色类型图标和蓝色动作不覆盖 VIS-01/04 / Foundation；采用中性图标及现有 OTR 语义色。图中“会在后台继续”的强承诺不覆盖 CP-UX-02 的 iOS 限制。图中未来灰色步骤不代表已经完成，不能生成假事件。V3 Local-First 后续 Owner 决定优先于旧页级/区域级证据描述：不恢复 Proof、永久上传或字段定位前置，只展示真实可用的 Document / 原文。

## 2. Original Blueprint vs Current UI

使用完整 App 已有截图；未重新运行 App、Analyze、Save 或模型。A/B 取 Slice 1 原始验收截图，C 取 Slice 2，D/E/F 取 Slice 4；这些是**各阶段实际截图，不是本轮六屏重新拍摄**。当前源码确认相应结构仍在；C 中旧“手动 Analyze”文案不能据此认定为最新运行行为。无法据历史截图确认的动态布局明确保留 NOT_VERIFIED。

| 屏幕与当前截图 | 已批准结构 | 实际偏差、代码位置与判断 |
| --- | --- | --- |
| **A 空 Capture**：`../ops/import-b2-slice1-20261113/screenshots/A-empty-trip.png` | CP-UX-01 §§2–4：紧凑、随内容增长、明确 Trip、空 Tray 隐藏；21日统一玻璃 Composer/紧凑菜单；Foundation SheetHeader 标准 | 输入面和菜单基本保留，不能重做已通过交互。但发现空态说明链接占据多行；旧两标签与后续 replacement connection 页的完整 amendment 对照不足，不能擅自恢复标签。`CaptureComposer.tsx:268–350,446–522`。Sheet 外框使用 `visual.radius.hero`（18）而非 Foundation sheet（26）；`maxHeight` 近满屏，不是已验证的85–90%适配。**部分符合，局部样式纠正；不宣称全部视觉 PASS。** |
| **B 附件+文字**：同目录 `C-mixed-text-files.png` | CP-UX-01 §4.2/4.3：Tray 紧邻 Magic Input、横向紧凑卡、数量清楚、直接移除；Submit 主、Add/Clear 次 | Tray、移除、文本与未 Add 草稿、Clear 已具备。截图中缩略图部分裁切、图卡文件标签可读性弱；需核对是横滑位置还是布局裁切，不能仅凭截图判定丢失。卡片、计数、Clear 与编辑面视觉组不够紧密，主 Submit 为箭头，需保留但确保主次层级及可访问标签。`CaptureComposer.tsx:359–444,560–682`。**交互保留，修局部排布；不重做文件接收。** |
| **C Submit / Processing**：`../ops/import-b2-slice2-20261113/screenshots/02-submit-waiting.png` | ACTIVITY-01、CP-UX-02 §3.1/3.2：同 Sheet 原位转换，业务事件时间线、当前阶段；Activity Blueprint Screen C；参考图第4面板 | 原位转换已通过；实际页面为“本机计数→Import progress/Activity→若干说明→Import results→多按钮→原件”，没有批准的业务时间线。Header/本机保存/状态解释多层重复，等待时出现 Results 标题。`CaptureProgress.tsx:154–237,240–262,399–425`，`UniversalCaptureResults.tsx:319`。**已实现但视觉/IA不符合，必须修正。** 不伪造事件时间或百分比；历史无事件时只显示当前已知阶段。 |
| **D Results**：`../ops/import-b2-slice4-20261114/screenshots/results-final.png` | ACTIVITY-04R/06/07、CP-UX-02 §4.1：结果 Header、紧凑业务类型计数标签（零隐藏）、正式结果行、Attention 汇总、历史进度、Done；Activity Blueprint Screen D / 参考图第5面板 | 数量正确，但 Header 仍叫 Import progress；“Activity / saved locally / Needs review / 长说明”重复。Created/Linked 标题下是居中独立 UiButton，类型/记录时间左对齐，Document 又一个独立居中按钮；没有整行布局、中性类型图标、实际日期/地点副文、操作标记/chevron；无业务类型标签。普通 UiText/UiButton 的默认间距堆叠造成大片空白和高纵向成本。`UniversalCaptureResults.tsx:319–449,489–550`、`CaptureProgress.tsx:154–176`。**数据 PASS，UX FAIL。** |
| **E Needs Review**：`../ops/import-b2-slice4-20261114/screenshots/needs-review.png`；展开结构辅以 Slice3 `exception-review-expanded.png` | V2 VIS-01–04，§§2–5：全屏 Push、固定 Batch/剩余数量、一个连续全宽列表、问题优先、对象/原因副文、chevron、单个 inline accordion、一个来源面板 | 全屏 Push、无 Bottom Shell、单展开、横向来源 chip、一个主滚动已存在；应保留。当前全屏里是一个居中图标/标题按钮+分离的原因，缺少紧凑行与固定 BatchContext。来源 chip 是 Source 1/2，源文件名称在下面；大块原文可能压倒问题。`ImportExceptionReviewScreen.tsx:219–245,265–344,384–414`。**结构部分符合，行与证据层级不符合。** 缺日期只提示“手工补充”，没有 date 控件；属于功能缺口，见§4。 |
| **F 完成后返回 Trip**：`../ops/import-b2-slice4-20261114/screenshots/day-feed-return.png`；操作记录 `interaction-record.md` | CP-UX-02 §4.1/8：Done 关闭回原页；正式对象→owning Details；原位置恢复；Foundation 原生 Back/一套导航 chrome | Details/Day→原 Batch 数据身份已验证，但 Results 同时给大按钮 Open Day 和 Return Trip Home，没有明确单一“完成/返回原页”层级。`app/(tabs)/trip/index.tsx:49` 又在内容顶部添加 Back to Results，处于 underlapHeader，不能视为已满足原生返回/安全区规范。截图顶端有旧 Capture unavailable 残影，尚未证明最终候选是否仍复现，记 **NOT_VERIFIED**，不伪报新运行失败。**返回功能 PASS；返回层级和布局需修。** 不重设计 Day Feed。 |

### 七项问题的归因

1. **工程信息过露：** 不是默认页暴露全部 ID（本轮未发现），而是多个技术/持久化说明、重复状态和读回解释挤占主区域。CP-UX-02 §3.2 已要求业务步骤，技术内容降到已有 Details。
2. **结果行缺失：** 原图已有列表，§4.1 已定义对象/类型/时间/动作/深链；直接落实，不再提出新产品方案。
3. **Progress/Results 混用：** `CaptureProgress` 外壳和 `UniversalCaptureResults` 的通用 Activity section 持续叠加；同一 Activity 不代表两个阶段必须用同一排版。分开渲染，继续使用原数据。
4. **重复 Details / Check：** 当前 V3 大部分 ready 情况已隐藏 Check；**并非每个候选都有 Check**。但 readUnavailable 和通用 Analysis 分支仍可出现，`CaptureProgress` 另有 Details。保留一个历史/处理详情折叠入口，普通观察自动完成；真实不可恢复错误才给原动作入口。
5. **主次操作：** 结果行可点而不是按钮组；一项上下文主操作（需要处理时 Review，否则 Done），Trip/Day/新导入为适当次操作；不改开发 Confirm 语义。
6. **iPad：** 不是把所有空间填满；使用已有自适应单列、清楚的对齐和信息密度。没有批准的精确 iPad 宽度/双栏规范，不从手机图推造数值。
7. **Theme：** palette/UiButton 使用正确不代表组合正确；原图结构+Foundation 角色同时满足。普通业务类型图标中性；只有真实成功/警告使用对应语义状态。

## 3. UX Correction Plan

| 类别 | 最小修正 | 范围 / 不改变的部分 |
| --- | --- | --- |
| **已批准但未落实** | 补业务时间线；Results 独立标题/摘要、零隐藏类型计数标签、正式紧凑结果行、Attention 一处汇总、Done；Review 固定 BatchContext、紧凑单层 accordion 行 | 只读现有事实；不改 Parser、Admission、Queue/Sync、Receipt、幂等和关联 |
| **已实现但视觉不符** | Composer 外框使用既有 sheet 规范；Tray/计数/编辑面整组对齐；用同一行呈现结果图标、标题、实际业务副文、Created/Linked、时间和chevron；Review 按左对齐问题/对象/原因布局；减少说明段/按钮堆叠 | 保留原 Handler/operation/预览/草稿；原件入口低于业务结果，不丢失关联 |
| **真实功能依赖，不伪装纯视觉** | 缺日期 Review 当前无输入/修正接线；保存失败文案错误指向 Review（catalog `capture.results.failed`），失败应进入已有 owning recovery；Results→Activity-filtered Updates 尚未落实 | 日期字段沿用已批准 TYPE-05，不授权扩大 Core；若现有提交合同不能消费输入，单独报精确限制。Updates入口属原 Slice6 依赖，不在本轮偷做；不宣称直接 Review 等同原导航合同 |
| **需要最小 Owner 确认的视觉 Delta** | iPad 采用单列、自适应高度且受限阅读宽度的 Sheet；不新增双栏。确切宽度/展开高度用现有容器与Foundation做一张后续静态布局预览确认 | 原文85–90%仅设计目标；V2具体尺寸仍 provisional，不冻结新全局token。无需重开自动导入/确认/业务设计 |
| **Beta Visual Polish** | 阴影细调、动画时序、精确图标字重和全局字体密度审计 UI-TYPO-01 | 不将正式列表、状态区分、44pt、深浅色可读性、Dynamic Type 推到 polish；这些是本次应落实的基础 |

### 最小文件范围（未来批准后）

- `src/features/capture/CaptureComposer.tsx`：局部外框/间距/Tray与输入组合；不改接收、草稿、清除和提交生命周期。
- `CaptureContent.tsx`：同一 Sheet 根据已有当前事实显示正确 Header / 组件；保留原 Activity/job。
- `CaptureProgress.tsx`：业务时间线/当前阶段和一个历史/详情入口，压低原件计数及技术说明。
- `UniversalCaptureResults.tsx`：结果 Header、摘要、类型标签、紧凑行、Attention/Not Created/真实过渡状态和主次操作。可用该文件局部组件，不建通用 Results Framework。
- `src/data/operations/universalV3Activity.ts`：**仅当显示需要时**，从现有 accepted snapshot 透出已授权的日期/地点等展示字段；不改归类、计数、保存或状态机。候选信息不得代替正式对象副文。
- `ImportExceptionReviewScreen.tsx`：固定Context、左对齐行、neutral icon/chevron、来源名称tabs及单证据面板。保留现有提交/观察；TYPE-05缺口独立跟踪。
- `app/(tabs)/capture.tsx`、`app/(tabs)/trip/index.tsx`：只有返回定位/原生header接线确需修正时改；不扩展其他导航。已工作的P1–P6 Details不重做。
- `src/ui/catalogs.ts`：用户语言与阶段标题（英文/简体中文）。仅复用 `SheetHeader`、`UiSection`、`AppIcon`、existing controls/forms、theme/visual tokens；不改全局 Theme，不新建基础框架。

## 4. 修复后的目标结构

以下是原 Blueprint 的组件树落实，不是新引擎或新持久状态。相同 Activity 数据/身份，按阶段呈现不同主体。

```text
A/B Capture — 同一个自适应 Sheet
  SheetHeader（标题 / Close）
  Trip context（小且明确；未分配如实显示）
  Composer shared glass surface
    Horizontal Tray（有附件才显示；卡片/移除/数量）
    Magic Input（自然增长；Inline Add）
    紧凑附件菜单 / 已有输入动作 / 主 Submit
  Clear All（有内容才显示，保留确认）/ 条件错误反馈

C Processing — 原位替换，不另开 Sheet
  SheetHeader + Trip/Batch context + 提交时间
  一处当前业务状态
  业务事件时间线（原件已保存 / 等待网络 / 读取旅行信息…）
  简短、真实的可离开提示
  一个展开历史/处理详情入口；条件性原输入恢复动作

D Results — 同 Activity 的结果主体
  SheetHeader（结果标题 / Close）
  Batch/Trip + 秒级记录时间
  紧凑完成摘要（处理已结束；N新增/N关联/N待处理）
  非零业务类型标签（类型计数，不按附件数计Item）
  正式对象列表（一个对象一行；按正式记录时间倒序）
    neutral type icon | title +真实业务副文 | Created/Linked/Updated + chevron
    次级：秒级结果时间；有权关联原件入口（多份仍一行对象）
  一处 Needs Attention（真实Review与失败区别）
  低强调 Not Created/原件保留（真实ABSTAIN；不猜测漏识别项目）
  过渡状态：已保存Item但关联待完成 / UNKNOWN，不能全完成
  主操作：Review或Done（按真实状态）；返回Trip/Day为次操作
  可展开历史 Progress / 已有技术 Details（不重复）

E Review — 原生全屏 Push，无Shell
  Native Back / Review + 固定BatchContext / N remaining
  单一全宽列表
    neutral icon | 问题 / 对象+简短原因 | chevron
    唯一展开行：问题→说明→横向命名来源tabs→一个可用原文区域
              →现有合法决策控件→一个Confirm
  saved/applying/recheck在原行显示，只有真实resolve才减数
  不加入Proof；缺失locator不制造定位，不编造摘录

F Return
  Done关闭回原页面及位置；选中正式对象用原owning Details
  原生Back返回原Activity/Batch；不在Day之上另叠内容导航栏
  需要修正仅限Import返回接线，不调整Day产品设计
```

## 5. 最短实施与后续验收顺序（尚未开始）

1. Owner 审核本计划，确认仅剩的 iPad 呈现 Delta；缺失的独立图包/21日原文件明确记录，不用猜图阻断已明确条款。
2. 先做 Results 与 Processing 的局部展示分离，沿用已通过的数据投影；再修 Review 行/固定Context；Composer仅局部规范差额。不要从空白重做Slice1–4。
3. 复用已有结果和只读/合成状态，在完整App拍摄 A–F **同设备/同locale/同字号**截图；同原图并排验收，而不是只提交代码guard结果。
4. 操作验证：当前Batch→对象/原件→原Results，Done→实际来源页；进度转结果不换Batch；长列表滚动与单Accordion；partial/UNKNOWN不得误显示完成。无新模型/业务Save是首选。
5. 深浅色、中文/英文、大字体、44pt和键盘做受影响界面检查；几何边界用真正UI操作确认，不仅静态截图。若需真实写入验证TYPE-05，另明确现有合同与范围，不擅自执行。

**本轮实际执行：仅原文/图片/源码/历史截图只读审查和本计划输出。零代码修改、零SQL、零部署、零Analyze/Save/DeepSeek；未Commit/Merge/Push。** 历史Git查询一次因缺失父对象失败，未修仓库或扩大历史调查；上述引用均来自可直接读取的真实文件。

**停止：等待 Owner 审核 UX Correction Plan。Slice 5/6 不启动。**

## Owner 验收约束与执行拆分

仅实施 UX-C1 Processing/Results/Return。UX-C2 Review/Composer须下一次授权；Slice5/6暂停。业务类型非零标签与处理结果标记独立，Linked不计入新增，N Documents→1 Item只展示一次；业务日期/地点来自授权Item，记录时间来自Receipt。Done始终可用，与Needs Review独立。UNKNOWN只对账；失败不得进入Semantic Review。TYPE-05 inline输入及完整Review V2状态保留为UX-C2明确功能验收，不以文字提示代替。Results→activity-filtered Updates→Review仍为Slice6依赖，不标完整合规。使用同设备/locale/字号前后截图，补iPhone/iPad、深浅色、中英文及真实交互；零新模型、零原B1保存/QA179、零SQL/权限/生产变更；不Merge/Push，完成UX-C1即停止。

## Owner 设备基线补充（2026-11-14）

从UX-C1开始，iPhone 16 Pro Simulator为主验收；iPad为辅助适配回归，保留原有数据/Session/SQLite/原件/队列。新iPhone必须正常DEV登录，不复制上述内容。实际正常登录后能读Trip与正式Item，但原Batch历史仅在旧设备本机；Owner随后明确批准在正常登录完整App中加入**不进入产品源码的临时只读验收入口**，通过现有合法Core GET读取真实DEV回执展示Results，Processing使用标注合成状态。该批准不等于实现跨设备历史或复制私有原件；缺少原件如实标记，仍零Analyze/Save/DeepSeek。
