# Ledger UI/UX 首轮审计

日期：2026-09-14
状态：审计完成，等待人工评审 Polish backlog
范围：仅 UI/UX、交互、可访问性与可观察性能；未修改产品代码、schema、Backend、repository 或财务语义

## 审计方法与证据边界

- 从 Release 产品的正常 `Ledger` tab 进入，使用 iPhone 17 Pro 与 iPhone 17 Pro Max Simulator（iOS 26.5）。
- 主要视觉样本为 `Europe 2026 UI Polish`：133 笔 Expense、8 个多语言/超长姓名成员、72 INCLUDED、61 EXCLUDED、1 RATE_REQUIRED、1 个 receipt fixture。
- 使用 `Europe 2026 Replay` 已验证的 126 笔真实结构和 Stage 10 只读证据核对密度、Settlement 和性能；未改动 Replay。
- 仅对稀有状态 Journey 做只读导航与 Settlement preview，未 Finalize、未确认 Payment、未调整任何财务事实。审计后 Simulator 已恢复选中 `Europe 2026 UI Polish`。
- 代码证据仅检查直接相关的 Ledger screen、hook 和 reporting repository；未做全仓重新审计。
- 2026-09-14 重跑 10,000 Expense repository 性能用例：代表性筛选/汇总查询 **62 ms**，目标 `<250 ms`，通过。Stage 10 已记录 Replay bootstrap **2.926 s**、Settlement preview **669 ms**。
- Simulator 自动化观察的界面稳定上界为约 1.7–5.1 s，其中包含辅助功能树抓取的固定等待，**不作为纯 App frame-time 指标**，只用来判断是否出现空白、闪烁或缺少 loading feedback。
- 本轮无真机特有问题，因此未使用物理 iPhone。

## 1. Executive summary

Ledger 的财务功能已经可用，但当前界面仍像“验收工具叠加在产品 UI 上”，而不是已收敛的 iOS 旅行记账体验。主要问题不是颜色或圆角，而是信息架构、常用任务的渐进披露、财务状态用语和超长页面编排。

关键结论：

1. `Spending` 与 `Settlement` 适合保留为 Journey 内的顶层模式；`Search` 是 Spending 内的原生搜索能力，不应与 `Analysis`/`Review` 并列为三个永久卡片按钮。
2. `My Ledger` 值得保留，但现在被埋在充满 Dev/Acceptance Journey 的 Action Sheet 底部；`Review` 应为有待处理事项时才显著的次级入口。
3. Expense 录入未达到已批准 UX Flow 的 80% 快速路径：首屏直接暴露 notes、category、ISO 时间、receipt、8 名参与者、5 种 split 和 settlement participation。
4. 有 **3 个 P0 财务上下文风险**：搜索/分析下钻把单日筛选显示为 `Last 30 days`；列表的 `Excluded`/“Excluded from authoritative total”混合了本人无份额、未估值、冲突和结算排除的不同语义；Expense 详情可通过一个无确认的 Switch 立即改变“谁欠谁”。
5. Debug 信息大面积进入正常 UI：UUID、revision、`SYNCED`、`ACCEPTED`、`MANUAL_AGREED`、evidence code/fingerprint、canonical server、root settlement、input digest、rounding integer 和 support diagnostics。
6. SQLite 查询基础很好，10k 代表性汇总查询仅 62 ms；当前性能风险主要在 UI：Search 每个字符重跑 4 类查询、首页一次 render 100 行的 `ScrollView`、Settlement/Review 一次 map 全部长内容。
7. 多语言基本不会崩溃，中文、法语重音、Nordic 字符和 emoji 都可显示；但超长标题迫使首页行高失控，金额受挤压，且多处用缩小字号代替 reflow。

## 2. Current Ledger information architecture

### 当前结构

```text
App tab: Ledger
├─ Journey Action Sheet
│  ├─ Journey list
│  └─ My Ledger
├─ Spending / Settlement
│  ├─ Spending
│  │  ├─ Mine / Group
│  │  ├─ Analysis
│  │  ├─ Search & Filter
│  │  ├─ Review
│  │  └─ Expense list → Expense detail → Edit/Receipt
│  └─ Settlement
│     └─ preview/finalize/balances/transfers/payments/
│        adjustments/statement/export 全部堆叠在同一长页
└─ + Expense
   └─ 全屏 modal：快速字段 + 全部高级字段
```

### 建议保留/下沉

| 模块                         | 建议层级                                 | 理由                                   | 是否需产品批准 |
| ---------------------------- | ---------------------------------------- | -------------------------------------- | -------------- |
| Spending                     | Journey 内顶层                           | 日常记录与查看的核心                   | 否             |
| Settlement                   | Journey 内顶层                           | 目标、权限、风险都与 Spending 显著不同 | 否             |
| Search                       | Spending 导航栏的 `.searchable`/搜索入口 | 搜索是列表能力，不是独立产品模块       | 是             |
| Filters                      | Search/List 内 toolbar/menu/sheet        | 九个常驻 chip 在窄屏上不可扫视         | 是             |
| Analysis                     | Spending 内次级页                        | 保留深度，但不与快速记账竞争           | 否             |
| Review                       | 待办状态/次级列表                        | 应在有待处理项时显示 badge 或入口      | 是             |
| My Ledger                    | Ledger 的跨 Journey 二级入口             | 不应埋在 Journey Action Sheet 最底部   | 是             |
| Expense history/audit        | Expense detail 内 disclosure/push        | 普通用户首先需要事实和金额             | 否             |
| Payment/Adjustment/statement | Settlement detail 的独立 push            | 不应把全生命周期塞在一页               | 是             |

## 3. Navigation audit

- 正常 `Ledger → Spending → Expense → Edit` 为 push + modal，大方向正确；但 Edit modal 没有可见 Cancel/Back，导航栏仍显示 `New Expense`，内容再显示 `Edit Expense`。
- `Search → Expense → Back` 实测保留了中文查询 `暴风雨` 和结果，这是正确的 iOS stack 行为，无需改动。
- `Analysis(Time) → bucket → Search drill-down → Back` 实测保留了 Time 维度和滚动位置，无需改动；但 drill-down 的筛选文案错标为 `Last 30 days`。
- `Review → finding → related Expense` 不成立：finding 卡片点击无反应，没有 View Expense 入口。
- `Settlement → Transfer` 与 `Your Balance` route 实际上重用同一整页 `SettlementReadinessScreen`，不是聚焦的 transfer/balance detail。
- Settlement 的 readiness、member balances、transfers、Payment、Adjustment、statement 与 export 在一个超长 ScrollView 中；用户需要反复上下滚动，无法通过导航层级建立心智模型。
- Journey Action Sheet 使用系统原生控件，但对 14+ 条目、重名 Journey 和长名不合适；应改为可搜索、标记当前选中项的 sheet/list。

## 4. Sticky/persistent control audit

| 页面               | 应滚动消失                             | 应持续可见                                                          | 建议位置                                                                          |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Ledger landing     | summary、attention banner、recent 标题 | Journey 简短上下文、Spending/Settlement；`+ Expense` 在 Spending 中 | 标题折叠后的 navigation toolbar；主操作可用 toolbar/FAB，不用 web 式固定大 header |
| Spending           | Mine/Group 总结数字可滚动              | 搜索；当用户正在切换 scope 时保留 Mine/Group                        | navigation search + 可折叠 scope toolbar                                          |
| Search             | 结果 summary                           | 搜索框、已激活筛选数、Filter 按钮                                   | `.searchable` + toolbar Filter；已选筛选用单行 summary，不把 9 chips 全部 sticky  |
| Analysis           | 解释文字                               | Mine/Group、dimension，以及尚未提供的 period                        | 顶部折叠 toolbar/Menu；避免水平滚动 tabs                                          |
| Expense form       | Journey 名、已展开的 advanced sections | Cancel、Save；金额/币种在长表单中保留简短摘要                       | navigation toolbar 中 Cancel/Save；长表单可加底部 Save，但不应出现两个同等 Save   |
| Settlement preview | 说明文字、详细 balances                | Journey 上下文、readiness 状态；Finalize 在看完摘要后可达           | 底部 toolbar 中的明确主操作，保留确认对话框                                       |
| Transfer/Payment   | 历史时间线                             | 付款双方、未付/待确认金额、当前状态                                 | 独立 push detail + 底部主操作；表单用 sheet                                       |
| Review             | support/debug 信息不应出现             | Open/Resolved filter、finding count                                 | toolbar Menu/Picker；单条行 swipe/context menu 处理次要动作                       |

## 5. Native-control audit

- **已正确使用**：App 底部 tab bar、NavigationStack 返回、Spending/Settlement 与 Mine/Group 的 tab semantics、对 Finalize 的 confirmation dialog、结算线私 export 警告、Switch/checkbox/radio 的 accessibility role、主要 44–48pt 触摸目标。
- **应用原生模式替换**：
  - Search 改用 iOS `searchable`/导航搜索；Filter 用 toolbar button + sheet/Form，已选状态才显示 chip。参考 Photos/Files。
  - Journey 多选项场景用 searchable sheet + List + checkmark，不用超长 Action Sheet。参考 Notes folder picker/Files location picker。
  - Category 用 Picker/Menu，date/time 用本地化 DatePicker，currency 用可搜索 Picker，不让普通用户编辑 ISO/enum/free text。
  - Advanced Expense options 用 DisclosureGroup/“More details” push/sheet；participants 与 split 用单独 sheet，不在首屏全量平铺。
  - Transfer 作为 NavigationStack detail，Paid 作为 sheet，Received/Reject/Dispute 用状态化底部 toolbar 与 confirmation dialog。参考 Wallet 的卡片详情/活动时间线。
  - Review 应是可筛选 List；单项 push 到 finding detail，再链接 Expense。Acknowledge/Dismiss 使用 menu/swipe 或 detail 内动作，不在每张卡上常驻。参考 Reminders。
- **需 OTR 专用 UI**：付款金额与结算金额并列、INCLUDED/EXCLUDED 解释、partial payment timeline、rate evidence 和 settlement/adjustment lineage。这些不应强行套成通用 Setting row。

## 6. Expense-entry audit

### 实测快速路径

打开 `+ Expense` 后 amount 自动聚焦。在不改默认币种、payer、8 人 equal split 和 INCLUDED 的情况下，最少显式操作为：

1. 点 `+ Expense`；
2. 输入 amount；
3. 点 merchant/title；
4. 输入 title；
5. 点顶部 Save。

从 tap 数看约 3 个显式 tap（不计键盘输入），但这不等于“快”：用户在首屏看不到参与人/split/INCLUDED 摘要，要向下滚动很远才能确认金融默认。少 tap 是通过隐藏确认上下文实现的，不是通过好的快速摘要实现的。

### 80% case

建议首屏仅保留 amount + currency、merchant/title、`Paid by Leo`、`Split equally · 8 people`、每人金额预览、Save 和 `More details`。Category、notes、date/time、receipt 可作为次级快捷项；不应先显示 ISO 时间和全部 split mode。

### Advanced split

当前 8 名参与者 + 5 种 split 全展开，长姓名使表单极长。应用 participant summary row 进入 selectable list sheet，split summary row 进入独立 split editor；Exact/Percentage/Shares 仅在选择后生成输入框。

### Multi-currency

当前 currency 是 3 字符 free text，不支持搜索、最近币种或本地化名称；异币种时会暴露 `REFERENCE_RATE` 等逻辑对应的英文选项和 `RATE_REQUIRED`。应先保留本地事实，再用单独 Currency & Value sheet 处理 rate escalation。

### Receipt-first

现有入口可达，且持久化/队列语义正确；但 UI 显示“durable app storage”、upload/OCR raw status、永久 `Retry upload and OCR` 按钮，并为每个 member 生成一个 `Confirm draft · X paid` 按钮。应改为原生来源选择、receipt preview、OCR 建议摘要和单一 payer picker/Confirm。

### Save/offline/error recovery

- 本地先保存的基础正确，不需改财务语义。
- 顶部和页底同时出现 Save；第二个 Save 只增加不一致风险。
- 没有可见 Cancel/Back，也未发现离开脏表单的未保存警告。
- 验证错误在页底，用户从顶部 Save 发起时可能看不到失败原因；应聚焦第一个错误并在字段旁说明。

## 7. Long-list/performance/cache audit

### 已证明表现

| 项目                      | 证据                                                                | 判断                                                    |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| 10k reporting query       | 2026-09-14 重跑：62 ms，正确返回 5,000 条 food 汇总                 | **No query/index change needed now**                    |
| Replay bootstrap          | Stage 10：126 笔 bootstrap 2.926 s                                  | 可接受的首次网络初始化，但 UI 必须先显示 SQLite 缓存    |
| Replay Settlement preview | Stage 10：669 ms                                                    | 查询可接受；用 skeleton/局部 progress 比单独 spinner 好 |
| UI Polish 133 rows        | Ledger 首页只查 30；Search 一次查与 render 100，剩余手动 Load more  | 133 条能用，但不是可扩展 UI                             |
| Warm return               | Analysis 下钻返回保留 dimension/滚动；Search-detail-back 保留 query | **State retention is good for stack return**            |
| Offline cached opening    | 既有 Release 验收证明 133/126 缓存可离线重开                        | **Data cache path needs no redesign**                   |

### 技术风险

- Ledger home、Search、Analysis、Review、My Ledger、Settlement 全部是 `ScrollView + array.map`，没有 windowing/virtualization。Search 最多一次 mount 100 个可变高行；10k fixture 只测 repository，没有测 10k UI scroll。
- Search `onChangeText` 每个字符立即触发 `listExpenses + summarize + listFilterOptions + listJourneys`，无 debounce/cancel/stale-response 保护；filter options 和 Journey 元数据在每次输入时被重复查询。
- Analysis 每次 dimension/scope 切换都重查 `listJourneys` 再查 bucket；币种元数据可由 route/context 复用。
- Ledger root 的远程 refresh 完成后重跑 context/report，且 `refreshPersonal("ALL")`与当前 Journey 一起刷新。本地首次 render 是正确的，但需用 profiler 确认前台切换时是否发生不必要的全页重 render。
- 列表没有渲染 receipt thumbnail，因此目前不存在图片阻塞首行的问题；但 `hasReceipt` 也没有被显示，附件可发现性不足。

### 建议分类

- **No change needed**：当前 reporting SQLite indexes/聚合查询；离线 SQLite 先显示架构。
- **UI virtualization/windowing**：Search/Review 首先改用 `FlatList`/native list；Ledger home 只有 30 行，可随同类组件顺手收敛，不必单独抽象框架。
- **Caching opportunity**：缓存 filter options 和 Journey currency metadata；不为 Expense rows 新造第二套 cache。
- **Prefetch opportunity**：Settlement 可在用户靠近旅程结束或首次切换时预取服务器 preview 依赖的最新快照；不预先 Finalize。
- **State retention opportunity**：持久保留每 Journey 的 Spending scroll、Mine/Group、Search query/filter、Analysis period/dimension；目前 stack back 表现好，但 tab/Journey 切换还没有明确的跨 mount 状态存储。

## 8. Multilingual/text-resilience audit

- 中文简/繁、French accents、Icelandic/Nordic、emoji 和中英混排均能显示，未观察到字形缺失、基线明显错位或裁切。
- 首页和 Search 中的超长标题完全展开，一行可占 5–6 行文本；这保住了内容，但破坏了列表扫视性。建议列表最多 2–3 行，详情页完整显示。
- 金额和标题并排时，超长标题挑战金额宽度；大数 `€9,999,999.99`、KWD 3 位小数、ISK/JPY 0 位小数都正确显示，但应在窄屏/大字体下改为金额独立行，不应依赖 `minimumFontScale=0.5`。
- Expense detail 的超长中文标题包装正常，8 个长姓名 exact split 也可读；但屏高成本很大，应在“Split details” disclosure 中展开。
- 不应直接翻译给普通用户的标签：`authoritative`、`canonical`、`MANUAL_AGREED`、`RATE_REQUIRED`、`SYNCED`、`ACCEPTED`、`HEURISTIC`、`revision`、`root settlement`、`input digest`、`rounding adjustment minor`、`settlement participation`。应先重写为产品语言，再做本地化。

## 9. Debug-information audit

| 信息                                                                                                | 分类                         | 未来呈现                                                       |
| --------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| 金额、币种、payer、participants、分摊金额、费用日期、receipt 是否存在                               | USER-FACING                  | 保留，使用本地化语言                                           |
| 是否计入本次结算、待补汇率、有冲突、待收款确认、部分已付、有争议                                    | USER-FACING                  | 保留，用人类可理解的状态 + 明确下一步                          |
| rate source/date、payer posted cost、manual agreement reason、rounding explanation、完整 split      | ADVANCED USER                | 收进“金额如何计算”/statement detail                            |
| UUID/reporting identity、server/repository ID、revision、raw sync/business enum                     | DEBUG ONLY                   | 从正常 Expense detail 移除                                     |
| `MANUAL_AGREED`、`REFERENCE_RATE`、`ACTUAL_PAYER_COST`、`RATE_REQUIRED` raw enum                    | DEBUG ONLY（产品含义需重写） | 用人类文案；raw 值只在 diagnostics                             |
| Review evidence code/fingerprint、layer、revision、`STALE/OPEN/ACKNOWLEDGED` raw state              | DEBUG ONLY                   | finding detail 仅显示可理解原因；raw 数据收进 diagnostics      |
| `Generate redacted support diagnostics`                                                             | ADVANCED USER / SUPPORT      | 设置 > Developer/Diagnostics Mode，正常 UI 关闭                |
| `canonical server data`、`immutable obligations`、`root settlement`、input digest、lineage sequence | DEBUG ONLY/实现概念          | 普通页面改为“最新行程账本”、“结算已确认”；证据细节收进高级说明 |
| acceptance Journey、fake/synthetic route/control                                                    | DEBUG ONLY                   | Dev build 或显式 Developer Mode 才可见                         |

### Developer / Diagnostics Mode 策略

1. 默认关闭；Production/normal Release 不显示验收 Journey 、raw ID 或 support 按钮。
2. Dev build 可默认开启；其他 build 只能通过明确的 Advanced setting 开启，并显示当前已开启。
3. Diagnostics 页只显示安全、红化后的运行状态；提供一次性复制/分享支持包，不把技术信息塞回业务页。
4. 不在本轮实现；这是 backlog D 的独立工作。

## 10. State/empty/error audit

- **Online**：本地内容先显示，背景 refresh 不阻塞 Ledger，方向正确。
- **Offline cached**：My Ledger 有 `Offline · showing the last SQLite snapshot`，Settlement 有 cached copy；但应统一说明“数据已安全保存在此设备”和“哪些动作会等待联网”。
- **Loading**：Ledger root 仅 spinner；Search/Analysis 无显式 loading state，查询时可显示旧结果或短暂空白；Settlement preview 仅 spinner，没有保留内容框架。
- **Retryable/failed**：多处只显示 `Ledger cache is unavailable`、`Settlement preview failed`等消息，缺少稳定 Try Again 动作和“数据是否安全”说明。
- **RATE_REQUIRED/conflict**：有颜色和文字，但首页 banner 不能点入对应 Expense；应直接打开已筛选列表。
- **INCLUDED/EXCLUDED**：Expense detail 文案表达了“仍在 Spending，不影响谁欠谁”，方向正确；但列表只显示模糊 `Excluded`，且可通过无确认 Switch 改变。
- **Empty states**：`No cached Expenses`、`No matching Expenses`、`No review findings` 只描述结果，未稳定回答“发生了什么/数据是否安全/下一步是什么”。无 Search result 应提供 Clear filters；无 Expense 应提供 Add Expense；无 Review finding 应明确“目前无需处理”。
- **No active Journey/multiple candidates**：有可恢复的选择流程，但 Journey chooser 中 Dev 数据过多、无选中标记、无搜索。
- **Receipt upload failure**：有 Retry，但 raw upload/OCR 状态混在一页；应分开“费用已保存”和“附件等待上传/OCR”。
- **Partially paid/awaiting/disputed/settled/adjustment/export**：逻辑俱备，但主要用 raw enum 和技术数值表达；需转换为时间线、人物方向和下一步动作。

## 11. Accessibility audit

- 主要 Pressable 多数有 44/48pt 最小高度，这一基础正确。
- Review 卡片把整个 `View` 设为 `accessible`，内部 Acknowledge/Dismiss 子按钮在 VoiceOver 树中被合并/丢失；同时 finding card 看起来可点却无导航。
- Expense form 的 modal 标题暴露 `Cancel` accessibility secondary action，但没有可见 Cancel 控件；可见用户和 VoiceOver 用户得到的导航模型不一致。
- 超长金额/标题多处使用 `adjustsFontSizeToFit` + `minimumFontScale=0.5` + `maxFontSizeMultiplier=2`；这会在大字体下缩小重要金额，不是真正的 Dynamic Type reflow。
- Search/Analysis 的水平 chip/tab scroller 无滚动指示，右侧选项被截断；对低视力和运动障碍用户可发现性差。
- 多处状态有文字而不是仅靠颜色，这是正确基础；但 `WARNING/INFO/HEURISTIC` 与 raw enum 不是有意义的 VoiceOver 描述。
- 金额方向在 Settlement 中仅用正负号，应在 VoiceOver label 中说“你应收”/“你应付”和对方姓名。
- 长表单需正确 focus ordering：首个错误字段、Save、Cancel、已展开高级区应有稳定顺序；现在页底 error 容易不被读到。

## 12. Screen-by-screen findings

“实现风险”是对未来 Polish 改动的风险估计，不是当前 bug 严重度。

| ID     | Screen / flow                        | Evidence                                                                                                                                            | Severity | Category                                        | User impact                                                | Recommended direction                                                                                       | Apple/native reference                          | Implementation risk | Product-semantic approval |
| ------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------- | ------------------------- |
| LUX-01 | Ledger landing                       | 首屏在列表前堆叠 Journey card、2 个 segment、summary、banner、3 个并列按钮                                                                          | P1       | IA / density                                    | 日常 Expense 被推到第二屏，不像“可用的账本首页”            | 保留 Journey + Spending/Settlement；Search 进 navigation，Analysis/Review 下沉                              | Notes list / Photos search                      | 中                  | 是                        |
| LUX-02 | Ledger landing / list                | `isAuthoritative=false` 同时包含本人无 split、RATE_REQUIRED、conflict 等，列表统一读作 `Excluded`；另有 settlement EXCLUDED                         | **P0**   | Financial context / terminology                 | 用户无法分辨“不是我的份额”、“暂未计入总额”和“不参与谁欠谁” | 拆分为互斥产品文案：Not in my share / Needs rate / Conflict / Not in settlement                             | Wallet 的明确交易状态                           | 中                  | **是**                    |
| LUX-03 | Journey switching                    | Action Sheet 显示多个重名 `Stage 7.2A/7.2B Acceptance`、blocker/simulator/synthetic Journey，My Ledger 在底部                                       | P1       | Debug cleanup / navigation                      | 普通用户难以找到真实 Journey 和 My Ledger                  | Dev Journey 在 diagnostics mode 隐藏；用 searchable selection sheet + selected checkmark                    | Files location picker                           | 低–中               | 是                        |
| LUX-04 | My Ledger                            | period segment 清晰；但列表充满 acceptance Journey，文案为 `exact allocated shares before settlement`                                               | P1       | IA / terminology                                | 跨 Journey 视图被 Dev 数据淹没，“Position”不易理解         | 保留 period；改为“结算前你付多/少了多少”并隐藏 Dev Journey                                                  | Wallet / Activity summaries                     | 低                  | 是（文案）                |
| LUX-05 | Spending scroll                      | Ledger title、Journey、Spending/Settlement、Mine/Group、+ Expense 全部随 ScrollView 滚走                                                            | P1       | Sticky controls                                 | 用户深滚动时丢失 Journey/scope 上下文，无法快速记账/搜索   | 折叠 title，保留简短 Journey/scope；+ Expense 放 toolbar                                                    | Apple large-title collapse                      | 中                  | 否                        |
| LUX-06 | Search                               | 9 个水平 chips 无 indicator，窄屏仅见前 4–5 个；包含 Business/Sync/Conflict 等技术维度                                                              | P1       | Native control / debug                          | 筛选不可发现，普通任务被技术项干扰                         | `.searchable` + Filter toolbar + grouped sheet；技术筛选进 Advanced                                         | Photos / Files                                  | 中                  | 是                        |
| LUX-07 | Search typing                        | 每个 `onChangeText` 重跑 rows、summary、filter options、journeys，无 debounce/cancel                                                                | P1       | Performance                                     | 快速输入时增加 SQLite/React 工作，存在旧结果覆盖新结果风险 | 150–250ms debounce，只重查 rows+summary，options/metadata 缓存一次                                          | Native search suggestion cadence                | 低                  | 否                        |
| LUX-08 | Analysis → day drill-down            | 点 `2026-07-25` 后结果正确是 5 笔，但 filter chip 显示 `Last 30 days`                                                                               | **P0**   | Financial context / navigation                  | 用户误以为汇总范围是 30 天，无法验证分析数字               | chip 显示确切日期/范围；保留来自 Analysis 的 context banner                                                 | Photos filtered-results title                   | 低                  | 否                        |
| LUX-09 | Analysis                             | dimension 水平滚动，无 period selector；Time bucket 按金额而非日期排序；`1 Expenses`                                                                | P2       | Comprehension / consistency                     | 时间分析看起来乱序，缺少范围上下文                         | dimension 用 Menu/segmented subset；加 period；Time 默认时间排序或明示“按金额”；复数化                      | Health/Wallet trend controls                    | 中                  | 是（排序/范围）           |
| LUX-10 | Analysis back                        | Time 维度、滚动位置在 drill-down back 后保留                                                                                                        | P3       | State retention                                 | 用户不丢上下文                                             | 保持当前 stack 状态；再扩展到 tab/Journey re-entry                                                          | NavigationStack                                 | 低                  | 否                        |
| LUX-11 | + Expense                            | 首屏直接显示 notes/category/raw ISO/receipt，下方还有 8 participants、5 split modes、settlement switch                                              | P1       | Primary workflow                                | 80% 简单 Expense 被会计表单打断，高级功能过早              | 首屏仅 amount/title/payer/split summary/save；其他 progressive disclosure                                   | Reminders quick add / Wallet add flow           | 中–高               | 是                        |
| LUX-12 | New/Edit Expense modal               | 编辑时导航栏仍显示 `New Expense`，页内显示 `Edit Expense`；标题重复；无可见 Cancel；顶/底各一 Save                                                  | P1       | Navigation / consistency                        | 用户不确定在新建还是编辑，离开方式不明，两个 Save 竞争     | 只保留导航栏 title + Cancel/Save；脏表单离开时 confirmation                                                 | iOS form modal                                  | 低                  | 否                        |
| LUX-13 | Expense field controls               | currency/category/date 都是 free-text TextInput，date 直接显示 ISO timestamp                                                                        | P1       | Native control / validation                     | 输入成本高，时区/拼写/枚举错误容易发生                     | searchable Currency Picker、Category Menu/Picker、localized DatePicker                                      | Calendar / Settings picker                      | 中                  | 否                        |
| LUX-14 | Participants/splits                  | 8 名长姓名和 5 split mode 平铺，缺少当前每人金额摘要                                                                                                | P1       | Progressive disclosure / financial confirmation | 用户需滚动很远才能确认默认，且不能快速检查 residual cent   | payer/participants/split 三个 summary row；点入单独 sheet；主表显示最终分摊摘要                             | Contacts multi-select + Form disclosure         | 高                  | 是                        |
| LUX-15 | Expense detail settlement toggle     | `Include in group settlement` Switch 的 `onValueChange` 直接执行 revisioned financial update，无确认/原因；其含义是改变谁欠谁                       | **P0**   | Financial safety                                | 误触可改变 Settlement 结果，又看起来像普通 preference      | 改为有解释的 row → confirmation dialog/sheet，显示影响；保留 audit                                          | Settings destructive/high-impact toggle pattern | 中                  | **是**                    |
| LUX-16 | Expense detail                       | raw ISO date、`MANUAL_AGREED`、fixture reason、UUID、revision、`SYNCED`、`ACCEPTED` 在正常 UI 常驻                                                  | P1       | Debug cleanup                                   | 技术状态与金额竞争，用户误以为需理解/处理                  | 只显示本地化日期、金额与用户状态；证据放 disclosure，ID 进 diagnostics                                      | Wallet transaction detail                       | 低                  | 否                        |
| LUX-17 | Expense history/audit                | Detail 没有面向用户的 history/audit 时间线，只有 `Revision 1`                                                                                       | P2       | Completeness / explanation                      | 用户无法理解谁改了什么，却看到无用 revision 数             | 加“Activity/History”次级 push，用人类时间线语言                                                             | Notes shared-note activity                      | 中                  | 否                        |
| LUX-18 | Receipt                              | 页面显示 durable storage、upload/OCR raw state、永久 Retry，且 payer 选择是 N 个 Confirm button                                                     | P1       | Native control / debug                          | receipt-first 像测试工具，成员多时按钮爆炸                 | 系统来源 menu + preview + 单一 payer picker + Confirm；仅失败时显示 Retry                                   | Photos document import / Share sheet            | 中                  | 否                        |
| LUX-19 | Settlement landing/readiness         | 首页文案是 `canonical server data`、`obligations`、`finalization`；预览不显示 cutoff/rate summary                                                   | P1       | Terminology / completeness                      | 非会计用户难以判断现在是“试算”还是“已生效”                 | 改为 `Preview settlement`、`Confirm final settlement`；显示截止时间、币种、待处理项                         | Wallet balance/status hierarchy                 | 中                  | 是（用语）                |
| LUX-20 | Settlement/Payment/Adjustment/export | 所有阶段在单一组件/长 ScrollView；`balance`、`transfer/[id]` routes 也重用整页                                                                      | P1       | IA / navigation                                 | 滚动深度过大，无法聚焦单个 transfer/payment，返回成本高    | Settlement overview → Transfer detail → Payment sheet；Adjustment/statement/export 各为独立 push/disclosure | Wallet card/activity/detail                     | 高                  | **是**                    |
| LUX-21 | Payment/statement                    | 显示 `Root Settlement`、Confirmed/Awaiting/Available、Discharge、organizer override、input digest、Expense UUID/revision、rounding integer          | P1       | Debug cleanup / terminology                     | 技术完整性压过用户任务，方向与下一步不清晰                 | 用“A owes B / Paid / Waiting for B / Received / Remaining”时间线；证据收进 advanced statement               | Wallet activity timeline                        | 高                  | 是                        |
| LUX-22 | Review                               | 顶部重复 `Ledger Review`；常驻 support diagnostics、全局 reason 框、raw finding enum/evidence fingerprint/revision/status；finding 不能打开 Expense | P1       | Debug cleanup / task flow                       | 用户不知道问题为何被提示，无法调查对应 Expense             | 人类可读 finding list → detail → Expense；reason 在具体动作后再询问；diagnostics 移出                       | Reminders flagged list                          | 中                  | 是                        |
| LUX-23 | Review VoiceOver                     | 卡片 parent `accessible` 导致内部 Acknowledge/Dismiss 按钮在可访问树中被合并/丢失                                                                   | P1       | Accessibility                                   | VoiceOver 用户无法完成 Review 动作                         | 不把整张含交互子项的 card 标为单一 accessible element；提供语义化 list row/actions                          | iOS accessibility containers                    | 低                  | 否                        |
| LUX-24 | Search/Review long list              | Search 一次 render 100 rows，Review 全量 map，都用 ScrollView；10k 只测 SQL                                                                         | P1       | Performance / windowing                         | 大数据下 mount/重排/内存无上界，长文本更放大问题           | 改为 FlatList/native virtualized list；保留 repository pagination                                           | Native List                                     | 中                  | 否                        |
| LUX-25 | Loading/error/empty                  | Search/Analysis 无 loading；多处只有 spinner 或 `cache unavailable`；empty 无下一步                                                                 | P2       | State UX                                        | 用户不知数据是否安全、是否正在更新、如何恢复               | 保留 SQLite 内容，局部 refresh indicator；错误说明安全性 + Try Again；empty 给单一下一步                    | Files/Notes empty & offline states              | 中                  | 否                        |
| LUX-26 | Dynamic Type / amount layout         | 标题/金额并排，金额常用最低 0.5 缩放；水平 amount/currency、member/amount row 未全部 reflow                                                         | P1       | Accessibility / multilingual                    | 大字体用户的重要金额可变得更小，长姓名可挤压金额           | 使用 layout breakpoint 纵向堆叠，允许金额换行，取消 0.5 缩放依赖                                            | Dynamic Type Form/List                          | 中                  | 否                        |
| LUX-27 | Receipt visibility in lists          | repository 已返回 `hasReceipt`，但 Ledger/Search rows 未呈现；fixture 中的 📎 来自合成 title                                                        | P2       | Information hierarchy                           | 用户无法从列表识别附件，必须逐条打开                       | 仅有 receipt 时显示系统 paperclip + VoiceOver label；不加 thumbnail                                         | Notes attachment indicator                      | 低                  | 否                        |

## 13. Proposed Apple-native interaction patterns

| OTR 任务            | 首选 pattern                                        | 适配 OTR 的原因                                                       | System-native vs OTR-specific           |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| Ledger 主导航       | Tab bar + Journey 内 segmented control              | Ledger 是 App 核心区，Spending/Settlement 是同 Journey 的两个稳定模式 | 系统导航 + OTR 数据                     |
| Journey 切换        | Searchable sheet + List + checkmark                 | 支持长名、重名、多 Journey 和 My Ledger                               | 系统 sheet/List                         |
| Expense 列表搜索    | `.searchable` + cancel/search suggestions           | 与 Notes/Photos 的心智模型一致                                        | 系统原生                                |
| Expense 筛选        | toolbar Filter + Form sheet                         | 大多数筛选低频，不占据列表顶部                                        | 系统原生，选项为 OTR                    |
| + Expense 80% case  | Focused modal composer                              | 金额优先、单手、可中断、本地保存                                      | 系统 modal/form + OTR financial summary |
| Participants/split  | Summary row → sheet/list/form                       | 快速路径显示结果，高级路径才显示编辑器                                | OTR-specific calculation UI             |
| Currency/rate       | Searchable Picker → valuation sheet                 | 币种选择是通用，结算估值是 OTR 特有                                   | 混合                                    |
| Expense actions     | Navigation toolbar + context menu/swipe             | 把 Edit/Receipt/次要动作与主信息分层                                  | 系统原生                                |
| Settlement overview | Sectioned List + sticky readiness state             | 首先回答是否可结算、谁付谁收                                          | 系统 List + OTR status                  |
| Transfer/Payment    | Push detail + bottom toolbar + payment sheet        | 单条 obligation 需稳定上下文和时间线                                  | OTR-specific content，系统导航          |
| Review              | Stateful list + finding detail + contextual actions | 待办、状态和筛选模式类似 Reminders                                    | 系统 List/Menu + OTR explanation        |
| Export/share        | Format/privacy confirmation + system Share Sheet    | 系统分享与隐私警告已成熟                                              | 系统原生，报告内容为 OTR                |

Apple 产品只作为交互原则参考：Settings 参考层级配置，Photos/Files 参考搜索筛选，Notes 参考 list/detail/edit，Reminders 参考待办与状态，Wallet 参考金融摘要和交易时间线。不建议复制任何单个 Apple 屏幕。

## 14. Prioritized Polish backlog

### A. Safe polish

1. **P0** 修正 Analysis 单日 drill-down 的日期 chip，显示真实 `[from,to)` 对应日期。
2. **P1** 修正 New/Edit modal 标题错配、重复页内标题、可见 Cancel，只保留一个主 Save，添加未保存离开确认。
3. **P1** 把 Expense detail 的 ISO date、raw policy/status/revision/UUID 收进高级/诊断区，正常界面显示本地化日期与人类文案。
4. **P1** 修正 Review accessibility container，让 finding row 与其动作可独立聚焦；增加 View Expense。
5. **P1** 为 amount/member/title 行增加 Dynamic Type reflow，不再把金额缩至 0.5 倍。
6. **P2** 列表长标题限制为 2–3 行，金额在窄屏/大字体下换行；详情保留全文。
7. **P2** 有 receipt 时显示 paperclip + VoiceOver label，不加 thumbnail。
8. **P2** 修正 `1 Expenses` 等复数与 raw uppercase label。
9. **P2** 为 no result/no Expense/no Review finding 添加单一明确下一步。

### B. Needs human UX/product decision

1. **P0** 批准并固化四类不同语义：本人无份额、未估值/冲突未计入总额、INCLUDED、EXCLUDED；禁止统一使用 `Excluded`。
2. **P0** 决定 settlement participation 的编辑权限、确认文案和是否要求原因；实现前不改财务语义。
3. **P1** 批准 Expense 80% 快速首屏与 More details 的边界；高级 split/multi-currency/receipt-first 保留原有能力但渐进披露。
4. **P1** 确认 Search 并入 Spending 列表的 navigation search，Filter 进 sheet，Analysis 保留二级页。
5. **P1** 确认 Review 改为待办型次级模块，仅有 open/actionable finding 时在 Spending/Settlement 显示入口。
6. **P1** 确认 My Ledger 的固定入口和 `Position` 用户文案。
7. **P1** 批准 Settlement overview → Transfer detail → Payment sheet 的层级，将 Adjustment、statement、export 从超长页分离。
8. **P1** 确认用户面向的 Settlement/Payment 词汇：Preview、Final、Paid、Waiting for confirmation、Received、Disputed、Adjusted、Settled。
9. **P2** 确认 Analysis 的 period selector、Time 默认排序和所需维度；不在未批准前新增图表。

### C. Performance/technical

1. **P1** Search 输入增加短 debounce/cancellation；filter options/Journey metadata 每页只读一次。
2. **P1** Search 和 Review 改为 virtualized list，保留现有 repository pagination；不引入新依赖。
3. **P2** 用 React Profiler/Release signpost 测量 first local render、warm tab return、Journey switch、Search keystroke-to-commit、Analysis switch、Settlement cached/remote preview；当前 Simulator accessibility 时间不足以作优化基准。
4. **P2** 记忆每 Journey 的 Spending scroll、Mine/Group、Search/filter、Analysis period/dimension；先使用现有 route/state 能力，不新增状态框架。
5. **P2** Search/Analysis/Settlement refresh 时保留已有 SQLite 内容，仅显示局部 progress，避免空白/全页 spinner。
6. **No change** 当前 SQLite reporting indexes/聚合：10k 代表查询 62 ms，没有证据支持 FTS、materialized analytics 或新 cache 层。

### D. Debug cleanup

1. **P1** 正常 Journey chooser/My Ledger 隐藏 Acceptance、Blocker、Simulator、Synthetic Journey；仅 Dev/Diagnostics Mode 显示。
2. **P1** 从 Expense detail 移除 UUID、revision、sync/business raw enum、fixture reason 和 raw valuation policy。
3. **P1** Review 移除 evidence fingerprint/code、layer/raw status/revision 和常驻 support diagnostics；保留人类可读的“为何需要看”。
4. **P1** Settlement/statement 移除 canonical server、root settlement、input digest、raw lineage/rounding integer、Expense UUID。
5. **P1** Receipt 移除 durable storage、raw upload/OCR 枚举和永久 Retry；只在失败时给用户恢复动作。
6. **P2** 将 support diagnostics 集中到一个默认关闭的 Developer/Diagnostics Mode，保留红化后支持能力，不污染主流产品 UI。

---

本报告仅提出方向与 backlog。在人工评审 B 类的语义、IA 和工作流程决策之前，不应开始 Ledger Polish 实现。
