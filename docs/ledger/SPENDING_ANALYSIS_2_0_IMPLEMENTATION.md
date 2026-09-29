# Spending Analysis 2.0 implementation

Owner-approved scope: 2026-09-29, including Performance / Database Guardrails.

## Audit and execution

Formal route: `/expenses/analysis`, native Ledger Stack inside root Tabs. Existing
Category presentation uses rounded white grouped surfaces, teal progress bars,
amount/percentage. Repository has five dimensions and exact share/full-value rules.
Search/Detail navigation is retained. No shared blur component exists; use native
iOS Stack material and Android elevated near-opaque fallback, isolated to Analysis.

Implement one local read → pure aggregation → shared section presentation → local
chrome → exact Search filters/focus refresh → domain/repository/UI/performance checks
→ Simulator acceptance. No Backend, Hosted Dev, Production, settlement command,
new dependency or financial/schema mutation is needed.

## Rules

- Mine is personal consumption share, Group total is each accepted Expense once.
  Traveller aggregates shares; Who paid aggregates full valued Expense amounts.
- Keep existing accepted active valuation/no-open-conflict/current-leaf/account
  boundaries; settlement-excluded spending remains included. Do not promote estimates.
- Entire trip retains existing no-date-filter Journey semantics. Timeline bounds use
  Journey dates extended to include stored Expense dates; missing dates fall back to
  Expense dates (today only for an empty undated Journey). Average/day uses elapsed
  calendar days through today, never spending-day count or future planned days.
- Long-trip range availability uses inclusive Journey duration; undated Journeys use
  known Expense extent. Explicit ranges apply `[from,to)` before materializing rows.
  Last 30 includes today and 29 prior days; month/year are current calendar periods.
- Daily ≤90 days (scrollable), weekly 91–365 (7-day blocks anchored to range start),
  calendar monthly >365; fill every zero period. Highest day always uses daily values.
- Equal spending uses competition rank (1, 1, 3). Include zero-spending members in the
  rank denominator. No free-text category guesses: omit meal/transport semantic metrics
  until a trusted mapping is supplied. At most four deterministic insight tiles.
- > 6 categories collapse as Top 5 + Other categories with a distinct synthetic key;
  > drilldown uses the union of exact categories, not the real `other` category.
- Completeness partitions eligible current nondeleted scoped Expenses into included
  and incomplete. Mine relevance requires a stored member split, including null/zero.
  Incomplete means not accepted, missing active value/share, or open conflict. Count
  each Expense once. All incomplete means unavailable, never a fabricated zero.
- Analysis Search filters explicitly preserve included/incomplete and zero-share
  identities. Search’s old default list behavior remains unchanged.
- Scope, expansion, category filters and scroll survive Detail/back; focus refresh is
  one consolidated local read, preserving the last committed dashboard on failure.

## Performance / Database Guardrails

**Dashboard complexity may increase CPU-side aggregation, but must not increase
network/database request fan-out.**

One `loadSpendingAnalysisProjection` repository entry uses one Journey/account-scoped
SQLite statement for Journey, members, Expense values/splits and range-presence
metadata. Sections never read independently. Range filters are applied in SQL;
scope/filter/expansion/chart interactions compute in memory. Focus return refreshes
once. No timers, polling, remote analysis/FX/Review/Settlement calls, redundant tables,
history backfill or automatic valuation work. Existing indexed keys are reused.
Add an index only after query-plan/timing evidence demonstrates need.

Validate repository call counts and SQL plans with a long Journey/large fixture.
Record first entry, toggle, expansion/filter, range, focus return, render and idle
behavior. Linear query growth, idle polling or any interaction-driven remote request
is HOLD. Simulator verification uses existing local Dev cache; no Hosted stress test.

## Acceptance

Implementation, targeted regression and iOS Simulator core acceptance PASS.
Small-screen, empty-state and three-minute native idle checks completed after the
Mac was unlocked. The lock-related HOLD is cleared. No financial rule changed.

## 交付报告（2026-09-29）

### 1. 最终信息架构

页面顶部只有 Back、Spending Analysis 标题，以及符合时长条件的日历 icon。
Journey 名称/日期是可滚走的单行说明。Mine / Group 是页面级 segmented control。

| Mine                                              | Group                                                      |
| ------------------------------------------------- | ---------------------------------------------------------- |
| Summary + completeness                            | Summary + completeness                                     |
| Spending by category                              | Spending by traveller + category filter + inline breakdown |
| Spending over time                                | Who paid + category filter                                 |
| Biggest expenses（最多 5 笔，可按 category 筛选） | Spending by category                                       |
| Your trip in numbers（最多 4 项）                 | Spending over time + Trip in numbers                       |

Category 保留白色分组卡片、青绿色细进度条、金额、百分比和笔数。
不超过 6 类全部展示；超过 6 类展示 Top 5 + 独立的 Other categories 合并项。
每类展开 Top 3，View all 打开原 Search。Mine 的排序/金额采用 personal share，
行内分别标明 Total 和 My share，避免把消费份额当成付款总额。

### 2. 实际修改文件

- `src/features/ledger/LedgerAnalysisScreen.tsx`：页面组合、范围、状态、chrome。
- `src/features/ledger/SpendingAnalysisSections.tsx`：Category、Timeline、Top Expenses、people、insights、skeleton。
- `src/domain/ledger/spendingAnalysis.ts`：纯分析计算与日期规则。
- `src/data/repositories/ledgerReportingRepository.ts`：一次性 projection、精确下钻过滤。
- `src/domain/ledger/reporting.ts`：categories union 和 Analysis completeness filter 类型。
- `src/features/ledger/LedgerSearchScreen.tsx`、`searchFilters.ts`：解析并显示 Analysis 下钻条件。
- 对应 domain/repository/UI/search filter 测试。
- `scripts/dev/seed-analysis-local-fixture.py`：仅用于隔离 QA Simulator 的合成数据。
- `docs/PRODUCT.md`、本文件、ADR 0057、current-state handoff。
- `SPENDING_ANALYSIS_CURRENT_FUNCTIONS_ZH.md`：本轮开始时整理的旧版能力文档，保留作为对照。

### 3. 新增 repository / domain 能力

`loadSpendingAnalysisProjection(journeyId, memberId, range)` 返回 Journey、成员、
范围内当前 Expense、active valuation、所有 split、当前成员 share、conflict 标记，
以及 Journey 是否已有 Expense 的元数据。只有一个 SQLite statement / read snapshot。
用户身份从已有本地 SecureStore session 获取。

`buildSpendingAnalysis` 从这一份 dataset 派生所有模块；排序后的 Expense 列表复用于
Top 5、各类 Top 3 和类别过滤。`aggregateAnalysisPeople` 派生成员份额与付款总额。
Scope、筛选、展开和 chart interaction 不重新读取数据库。

### 4–5. 复用能力及移除的旧 UI

复用原正式路由、Ledger native Stack、Search / Expense Detail、金额/日期格式、
账号和 Journey 边界、active valuation 与 conflict/correction 排除规则。
移除了 Category / Time / Payer / Participant / Currency 五个维度 tabs，
repository 原 `analyze` 和 Currency grouping 仍然保留。没有改写 Settlement 规则。

### 6. Range icon 和规则

Journey inclusive duration ≤30 天不显示 action；31–90 为 Entire / Last 30 / Custom；
91–365 增加 This month；>365 为 Entire / This month / This year / Custom。
使用纯日历 icon，44pt 点击区，accessibility label 为 Change analysis date range。
显式范围用 icon 颜色和小圆点提示。Custom 使用现有日期输入习惯，校验 YYYY-MM-DD，
把 inclusive 日期转换成 `[from,to)`；SQL 先应用范围，再生成 dataset。
重新打开 Custom 保留选中范围的起止日期。

### 7. sticky Mine / Group

ScrollView 测量 segmented control 的位置，越过 native header 底部时显示页面内
material overlay，原位置保留空间并从 accessibility tree 隐藏。
只有跨过阈值时更新 React state；Summary / Journey context 随内容滚走。
没有新导航容器或滚动轮询。

### 8. Analysis 隐藏 bottom tabs

Analysis 的 `useFocusEffect` 仅在自己 focused 时设置父 Tabs `display:none`。
失焦 cleanup 恢复原默认样式。Search / Expense Detail 仍用原导航，回 Analysis 后再次隐藏。
没有修改 root Tab Bar 或其他页面 chrome。

### 9. translucent header 和 fallback

iOS 使用 native Stack 的 transparent header + systemMaterial。
Sticky overlay 使用已安装、已在 Podfile.lock 中的 expo-glass-effect；不可用时回退
近乎不透明表面。Android 使用 near-opaque 背景和 elevation。
没有安装新依赖。iOS native material 已验收；Android fallback 尚未在设备上验收。

### 10. completeness 定义和 query

候选集合限定当前账号可见、当前 Journey、当前 correction leaf、未删除及选中日期。
Mine 只考虑有当前成员 split 的 Expense，包括 0 / null share。
Included 必须 ACCEPTED、有 active valued total、无 OPEN expense conflict；Mine 还必须
有 valued personal share。其余相关 Expense 每笔计入 incomplete 一次。
Settlement participation EXCLUDED 不排除 spending；estimate 不作为 authoritative 值。
全部 incomplete 显示 Spending total unavailable；笔数明确写 included expenses。
Completeness 展开可下钻到 Search 的 Not included yet 精确集合。
无 Expense、范围内无消费、全部不可分析分别有独立空状态。

### 11. 图表 / 统计 aggregation

- Mine = personal share；Group = 每笔 full valued amount 一次。
- Traveller = participant shares；Who paid = payer full valued amount，未扣 repayment。
- ≤90 日每日；91–365 每 7 天、从范围起点分桶；>365 按自然月；补齐 0 消费桶。
- 单日显示 Spent today / Spent this day，不画无意义的单点图。
- 最高消费日始终来自 daily aggregation，不把最高月/周称作最高日。
- Entire 的平均每天从 Journey start 到今天/已结束日期，计入零消费日，排除未来计划日。
  未开始 Journey 平均值 unavailable。显式范围按选中范围已过去的日历天数计算。
- Entire 保留已有 Journey 全部 Expense 语义；Timeline 必要时扩展至储存 Expense 日期。
- 成员平手采用 1、1、3；无消费成员仍计入排名人数。最多 4 个确定性 Insights。
  没有可靠 category semantic mapping 的餐饮/交通指标不通过自由文本猜测。

### 12. 测试结果

8 个相关 suite / 59 tests PASS，包括纯 reporting、spendingAnalysis、repository、
UI event/hook harness、Search filters、format、homepage presentation、latest request。
TypeScript PASS；修改文件 scoped ESLint、Prettier、git diff --check PASS。
UI harness 验证状态和调用数量，不宣称替代 native layout 验收。

全项目 architecture boundary 4 tests 中 3 PASS / 1 既有 FAIL：
`LedgerStage6Screen.tsx` 的 `@/data/api/client` 导入。HEAD 中已存在该导入，
本轮未修改这个文件；没有扩大到无关架构清理。

### 13. Simulator 验收

- iOS 26.5 Release build 成功；从已有 Spending 的 See analysis 进入。
- 普通字号：白色 Category 分组/青绿色进度条、单行 context、icon Range、短 Journey
  无 Range、sticky Scope、Summary/context 滚走、底部 tabs 隐藏均通过。
- 独立 QA clone：2,003 Expense、7 成员、10 categories、1,007 天 Journey。
  Mine NZ$5,721.43；Group NZ$39,990.00；当前成员 Who paid NZ$5,712.85。
  Top 5 + Other categories 区分真实 other；monthly stacked Timeline 补齐空月。
- Traveller inline breakdown、Traveller / Who paid 独立类别筛选、Timeline 月份展开通过。
- This month 无数据时显示 No spending in this period；单日显示 Spent today。
- 全部未估值显示 unavailable；Completeness 下钻 Search 只找到 3 笔未纳入记录。
- 仅编辑合成 fixture：NZ$10 → NZ$14，使用原 Sharing 等额分摊流程；返回后
  Mine NZ$2.86 → NZ$3.43，Category / Timeline / Biggest 一起刷新。
  Detail/back 保留滚动位置与展开状态；Biggest 的 hotel filter 工作正常。
- 最大辅助字号 cold mount：scope 可操作，内容纵向增长，Insights 单列；长标题换行。
  Simulator 动态修改字体后旧 native text measurement 曾短暂不匹配，重新挂载恢复；
  不将此观察表述为“任意运行中字号变化已完整通过”。
- 375pt iPhone SE small-screen QA：使用同一 loopback-only build 与已有本地 QA 缓存。
  普通字号 Summary、Category 金额/百分比、长标题换行、Total/My share、View all、
  sticky Scope、短 Journey 无 Range、长 Journey 日历 icon 和隐藏底部 tabs 均通过。
  空 Journey 明确显示 No spending yet；2,003 Expense 长 Journey 在小屏正常打开。
- 小屏大数据页面前台持续观察 191 秒：金额 NZ$5,721.43、笔数、内容和 accessibility
  tree 不变；未出现重复 loading、错误或视觉刷新。这是 native 稳定性观察，
  不是 native SQL request trace，调用次数由下方独立测试支持。

### 14. 限制与 readiness

本次实现、针对性回归及 iOS Simulator 核心视觉/交互验收已通过；锁屏阻断已解除，
小屏与正常字号空 Journey 检查完成。Android native fallback 未实机验证。
没有可信语义映射的 category Insights 暂不展示。Custom 日期暂为经过验证的文本输入。
这些状态不应被宣传为全平台、全部视觉验收完成。

### 15–16. Schema 与远端安全

无 SQLite migration、无冗余表、无新 package、无 Backend/API 改动或部署。
**Production 未访问；未执行 Settlement Confirm。**
本轮没有执行 Hosted Dev 数据验证、回填或压力请求。首次小 fixture 使用已有 Dev
Simulator 正常配置；大 fixture / 编辑 / 小屏使用 Backend endpoint 指向
`http://127.0.0.1:1` 的隔离 acceptance build，Analysis 本身没有 remote read 路径。
此 build 仅用于本地验收，不应作为正常 Dev/手机发布包安装。

### 真机更新（用户请求）

2026-09-29 已向用户现有 iPhone 16 Pro 安装并成功启动签名 Release。
编译包校验正常 `https://api-dev.xoery.art` endpoint 和新版 Analysis projection 存在，
loopback QA endpoint 不存在。使用同 bundle ID 覆盖安装；未卸载、清空本地数据或
向真机注入合成 fixture。用户可从 Ledger → Spending → See analysis 开始真机测试。

## Performance / Database Guardrails — measured gate

| 操作                        | Analysis local projection reads | Analysis remote reads | 证据                                            |
| --------------------------- | ------------------------------: | --------------------: | ----------------------------------------------- |
| 首次进入                    |                               1 |                     0 | UI harness + repository SQL counter             |
| Mine → Group                |                         0 extra |                     0 | UI handler test + native interaction            |
| Category expand/collapse    |                         0 extra |                     0 | section event test                              |
| Biggest category filter     |                         0 extra |                     0 | screen event test + native interaction          |
| Traveller / Who paid filter |                         0 extra |                     0 | domain calculation + native interaction         |
| Timeline point expand       |                         0 extra |                     0 | section event test + native interaction         |
| Range 改变                  |                               1 |                     0 | screen event test + scoped SQL counter          |
| Detail 返回                 |                  1 consolidated |                     0 | focus event test + native edit return           |
| 连续 15 次 React renders    |                         0 extra |                     0 | UI hook harness                                 |
| 前台 idle 180 秒            |                         0 extra |                     0 | fake clock + screen/section timer/source guards |

Idle 计数来自可运行 hook harness；native 大数据页面 191 秒稳定性观察也通过。
没有安装 native DB 计数 profiler，因此不虚构“Simulator runtime SQL trace 为 0”的结果。

10,003 Expense 本地 SQLite fixture：一次 projection 39ms，CPU aggregation 15ms，
range 查询仍一次。时长为本次开发机器测试记录，不代表用户手机保证。
Query plan 使用 `ledger_expenses_journey_occurred` 的 Journey/date index；
member、valuation、split、conflict 使用现有索引；scoped/predecessor CTE materialized。
没有无条件扫描所有 Journey，split/conflict 只对 scoped expense 做 indexed probe。
没有 per-row application query；SQL 内的 indexed joins 不产生 network/request fan-out。
查询计划未证明需要新 index，因此未加 migration。

必须持续保持：component/card/chart mount 不独立 query；participant/category 不
各发 query；禁止 Analysis polling、timer refresh、全历史 backfill、批量 valuation、
远端 FX/Settlement/Review 自动请求。Scope/展开/图表只操作已加载 projection。
如确需 Hosted Dev：先说明本地为何不足，仅做有界只读检查；不循环、不压力测试，
不查 Production。不得为 UI convenience 建冗余 authoritative 表。

以下任一情况必须 **HOLD**：模块/成员/类别数量让 request 数量线性增长、多个独立
remote analysis 请求、idle 重复数据库读取、toggle 同步扇出、chart 发 Backend 请求、
相关 Hosted Dev I/O/connection spike、或新增不必要后台 polling。
本轮针对性测试没有触发这些红线。
