# Functional Restriction Audit

2026-11-14 · Product `888a1b4b` · Main Merge/Push HOLD.

## 方法与覆盖

在已完成四线对象盘点上检查当前 tracked Mobile、Backend、MCP、Native configuration 和 Supabase SQL。自动扫描得到 2,974 个匹配位置、620 个文件，见 `restriction-scan.json`；匹配是待核对线索，不是 2,974 个缺陷，也不代表全部逐行审完。保留原四线交付矩阵、Deferred 清单和 owning 验收，未恢复旧快照。逐组源码/历史证据见 ACCEPTED_FEATURE_BASELINE。

A = 正式业务/安全限制；B = 临时开发配置；C = 非预期功能回退；D = 证据不足。A 保留；C 修复并复测；D 不默认合理、不擅自扩权。历史未完成能力不伪装为功能回退。

## 已固定发现

|ID|分类 / 原因|代码与修复|实际证据 / 当前状态|
|---|---|---|---|
|R01|C：DEV Apple Native plugin/entitlement 未生成|app.config.ts；DEV 同样启用现有 Apple plugin，保留 Bundle/Google 身份|8297ab8e；完整 Native build + 系统授权弹窗 PASS；完整登录 BLOCKED，Simulator 未登录 Apple Account|
|R02|C：已资格读取后，点 Trip 编辑再做一次网络读取|LocalTripWorkspace.openTripEditor 复用同 generation/trip 的 remoteMetadataReady|101 项组件检查；实际编辑入口约 835ms（单次工具计时，非 p95）|
|R03|C：remote editor 把 Currency/Cover 按本地 Trip 存在与否关闭|同 owning editor 接 CurrencySettingsScreen / Personal Cover；Cover-only 不创建 Parent update|正常 Account picker 打开；独立 Guest 币种 USD、Coast Cover 持久化；Member/Finalized checks 保留|
|R04|C：Ledger 空状态重复 Add Expense，与 shell + 冲突|LedgerStage6Screen 删除重复空状态 CTA|完整 App 空/有支出状态只保留正常 +；并未删除 Expense Create|
|R05|C：Day Feed 按自然前一天而非实际上一条显示日计算渐变|dayFeedAppearance.dayFeedPreviousColor；TripScreen 传真实日期列表|首日、日期间隔定向测试与实际截图；未声称所有字号/滚动帧性能通过|
|R06|C：cached summary 文案错误暗示所有详细内容不可用|catalogs / LocalTripWorkspace 改为具体 metadata 编辑资格提示|真实 Details 可读；资格网络请求未完成时仍不制造权限；稍后同一 Trip 正常出现编辑|
|R07|C：Account bootstrap 提前导入 Guest 原生 workspace|defaultBootstrapDependencies 的既有 Guest port 延迟 import|bootstrap 157 项关联复测，完整 Account/Guest 冷启动均可进入|
|R08|C：AI Usage / Invite preview ScrollView 缺 keyboardShouldPersistTaps|两处补回 canonical handled 策略|keyboardTapPolicy 定向 PASS；未将 Invite preview 宣称正常 Claim E2E|
|R09|C：FX classification 注入 now 后，子判断仍用实时时钟|eligibleExpenseQuote 复用调用方 now|保持金额/报价权限，定向时间分类测试 PASS|
|R10|A/D：Guest 账本拒绝 Account-only reporting 身份|LedgerStage6Screen.loadContext / defaultLedgerReportingRepository.requireActiveUserId|独立 Guest 实际显示 context unavailable；Guest P1/P3 有本地合法实现，不能据此把 Guest 冒充 Account。完整 Guest Ledger 历史验收依据尚缺，BLOCKED 而非移除 Auth|
|R11|A：Guest 手工类型仅 P1/P3；Flexible 未正式启用|ManualItineraryContent.localOnly；manualItineraryTypes|实际 Guest 菜单 P2/P4/P5/P6 disabled；正常 Account 菜单 P1–P6 全部可进入。两者不是同一个权限声明|
|R12|A/B：旧 QA scope 与 formal P2 显式 opt-in 仍留库|nativeTripQaScope.readConfiguration / nativeTripQaFormalManualFlightScope|普通 DEV normal 配置优先生成当前 Account + 1970 cutoff，不依赖固定 QA ID；当前 Native 未注入旧 QA_SCOPE；formal P2 新协议与普通 Flight 表单分开记录|
|R13|A：MCP 默认关闭、受限 ports；Realtime/Version optional 未接入|MCP phase4b / tripDownstreamRuntime|MCP 384 本地检查通过，不代表 Hosted OAuth Consumer 或 Realtime 已启用；保持原限制|
|R14|D：Trip 改名后 Ledger title 仍旧|tripMetadataRepository.retainMetadataSnapshot / ledgerReadRepository.applyJourney / LedgerReporting.listJourneys|新合成 Trip 的 UPDATE_TRIP_METADATA 已完成，local_trip_containers 新名，ledger_journeys 旧名；Root2独立PG证明服务端新名；888a1b4b在已资格metadata snapshot读回时更新Ledger显示字段。仓库拒旧快照测试及完整Native冷启动Ledger新名PASS，不改金额/币种|
|R15|D：正常 Expense 实际 Backend 503|原操作 ledger-operation_mwfnz7vm_g0z2dtlug3；request 1984cc0a-d2b0-4cfb-ad66-de31c3325e64|本地 NZD100 minor 保存，远端 RETRYABLE / BACKEND_UNAVAILABLE。不重建 Operation；Root2已独立PG证明该Expense无回执/无行（仅快照，不据此重试）；原异常被旧Backend丢弃。888a1b4b补最小脱敏stage/code日志，本轮未部署此Backend补丁|

## 尚未消除的验证差额

- `architectureBoundary.test.ts` 的两个失败保留。扫描首先命中测试文本，但生产源码也确有直接 data/api / data/sync imports，详见 `evidence/boundary-import-findings.json`。不能将全部归为误报，更不能删掉边界断言；需逐项按既有 Repository/operation 归属处理。
- 旧 `render.test.ts` 的 32 项仍失败：手写共享 hook/ScrollView harness 未实现当前 FlatList 的真实 ref、layout、anchor 生命周期。未保留无效的“补一个 FlatList”实验，也没有删除这些断言。实际完整 App 与 WindowedDayList owning tests 单独记录。
- 遗留 Source/QA 工具的原生端口、绝对路径夹具、条件 PostgreSQL fixture 与普通产品运行分开；不自动开启受保护能力来让测试变绿。
- Account switch 多身份、Member/Owner、Apple 完整登录等缺当前实际环境证据，矩阵明确 BLOCKED。

未改 SQL/RLS/ACL/Role/Grant；未新增 Gate、权限框架或通用测试平台。当前 audit 不构成 100% 功能恢复证明。
