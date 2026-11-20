# MCP Beta Server-to-iOS Sync Contract v1.0

状态 **FROZEN v1.0**；合同版本 `otr.mcp-beta.contract/1.0.0`。2026-11-16，Pacific/Auckland。正式基线Main `41de43927fd9869673c1ca929e911f58d1f6f96d`；修订起点 `eaaf88aafe080f86a944a1f6219b2d798f405230`。Owner本聊天“Final Revision & Freeze”已批准OD01–OD06及本轮合同冻结；不构成实现、部署或Mutation授权。

最新Owner范围覆盖原附件中的Settlement写入清单。MCP可新增/修改Expense，Settlement只读。保留原附件的Expense Delete/Restore范围与原Ledger权限，Settlement及其Payment/Personal Review写动作退出本Beta。Personal Payments按保守边界仅读，独立身份/付款声称仍遵循Ledger原模型。以上范围决定在本包统一应用。

六文档互相引用同一Registry和Schema，单项标CONTRACT_NEW表示已冻结、尚待实现的正式端口/overload，不能认定当前已实现。已有接口不据QA白名单、短窗口或临时Runtime重新设计。

## 1. 唯一数据路径和验收等级

Layer 1最终交付是 `HTTP → Core/正式Ledger Authority → PostgreSQL → 正式Reader → iOS Sync → SQLite → UI → Cold Restore`。Server mutation回执与下行安装分别记录。模拟器必须走正常登录、Repository/Reader与App生命周期；不能直接写SQLite、注入accepted snapshot/UI fixture或手动改显示值替代同步。

五个独立结果为 `SERVER_API_PASS`、`DOWNSTREAM_PASS`、`SIMULATOR_UI_PASS`、`FOREGROUND_AUTO_REFRESH_PASS`、`OFFLINE_COLD_RECOVERY_PASS`。部分层级通过保留其实际证据，全链总出口须对应能力应有的五层完成。只读API没有人为创建Revision的步骤，使用原已存在服务器数据与正常读取证明。

## 2. 实际Main触发覆盖

| 现有组件 | Main实际行为 | 合同采用 / Layer 1缺口 |
| --- | --- | --- |
| tripDownstreamCoordinator.ts / refreshCoreDownstream | 正常Discovery，Core完整认证collection，epoch/revision/accessRevision/roster/binding/order比较；不变不重写SQLite；Account generation fencing，串行/合并读，失败backoff15/30/60秒 | 继续复用。new remote-only Trip、metadata及lifecycle是否进入缓存/UI需逐项证明 |
| nativeCoordinator composition | 只有general cloud sync enabled、active App、已提交正式Account/Session及online才调度；Discovery读Trip缓存，pull通过Core transport/Repo refresh；当前deps未装version函数 | Layer1在正常产品配置接入，不能以固定QA cutoff/whitelist作产品资格。实际挂载与醒来路径须证明 |
| account/foreground refresh | refreshAccountTripReads、refreshForegroundTripReads区分全账号发现与当前Trip；现有operational/App调用必须在实际签名App证明 | 外部服务器写入不会产生本机outbox wake，不能只测本机Mutation后的notify |
| tripAuthorizedVersionTransport / authorizedTripVersion | 有4096byte限制、Actor/Trip绑定和可见状态token，源码明确未挂载；由collection算出的version不是廉价原生版本服务已激活 | 可以用完整读方案满足Beta；选择version优化需正式Reader资格。不把token当权限证书 |
| tripRealtimeTrigger.ts | 没有subscribe时关闭，订阅资格依赖Owning授权；仅invalidate触发既有pull；Account切换stop | 不要求新Realtime技术方案，不能报告其已开启。无私有channel Port时继续普通触发 |
| ledgerActiveSync / ledgerReportingCoordinator | 可见在线时8/15/30/60秒自适应；先读Personal Payments/Review，辅助失败标incomplete，然后Bootstrap/Changes；409 Review blocked和503区别 | 503不得阻止Expense已收到的数据安装；完整状态incomplete须保留。Settlement读refresh不写Checkpoint |
| ledgerOperationalSync / Repository notifications | 本地Queue wake/foreground等已有入口，Upload/Retry仍归原Sync Engine | 服务器外部改动自动发现需独立Timer/恢复证据，不能把本地wake当外部信号 |

规范性源码均固定于Server合同Main，包括 `src/data/sync/tripDownstreamCoordinator.ts`、`tripRealtimeTrigger.ts`、`ledgerActiveSync.ts`、`ledgerReportingCoordinator.ts`、`ledgerOperationalSync.ts`、`src/data/api/tripAuthorizedVersionTransport.ts` 和 `docs/OFFLINE_SYNC.md`。

## 3. 逐领域Mutation / Reader / Repository / SQLite / UI矩阵

| Sync Group / 能力 | 服务器对象和版本效果 | 正式Reader | iOS消费者 | SQLite实体/投影 | UI与完成定义 |
| --- | --- | --- | --- | --- | --- |
| TRIP / create | 新Trip、ownerPerson、Core epoch/revision/access；TripCreate operation | Discovery + TripCreate receipt + Metadata snapshot + Core collection | tripDiscoveryTransport/Repository、tripDownstreamCoordinator、localTripWorkspace/正常Trip打开路径 | trip_discovery_snapshots/summaries；已有local_trip_containers仅按原owner语义，不虚构本机Create；Core scopes/certificates/person bindings | MyTrips自动出现可打开的新云Trip、名称/日期/目的地正确，Day空状态合法；Cold仍同ID |
| TRIP / metadata update | metadataRevision按原合同比较+1/NO_CHANGE不变；不改Item semantic revisions | GET metadata + 原metadata receipt + Discovery | tripMetadataCoordinator/Repository用于本地pending，远端metadata refresh复用tripDiscoveryRepository与正式metadata Reader，不能重放本地Update | Account-scoped discovery/cache与原metadata/revision、pending与server shadow分开 | Trip Home/编辑打开/标题日期/目的地刷新；旧pending本地值不被旧读覆盖 |
| TRIP / archive/unarchive/delete | OD01既有Trip aggregate revision与lifecycle状态；财务/receipt/历史保留 | 带明确lifecycle状态/授权tombstone的Discovery/metadata | Discovery Repository + workspace access/lifecycle gate，需要Layer1补消费 | 原Trip scoped缓存标记归档/恢复ACTIVE/逻辑删除，不把分页漏项当delete；保留pending/UNKNOWN及受保护证据 | 默认MyTrips/搜索适当筛选，深链有明确状态，Unarchive自动回到MyTrips且可打开；Cold只按当前正式状态恢复，Delete不被Unarchive复活；删除不抹财务历史 |
| CORE / P1 | Item semantic_revision、Core collection/read revision/证书 | Core collection/ItemSnapshot +原CoreReceipt | tripCoreV2Repository.refresh → P1/P3 DayFeed Repository、DayRead builder | trip_core_itinerary_events、participants/visibility、certificate、trip_day_projections/events/boundaries | P1 Day/Details显示全部计划/日期/地点/类别；相同Revision不重复写 |
| CORE / P2 | sparse intent/flight endpoints/services及annotations的必要子行，Item revision；authored title联动 | 同上，保留完整已授权record/field_state | tripCoreV2Repository + P2相关DayFeed/read/render，ManualFlight fields仅编辑draft | trip_core_trip_flight_intents、transport_endpoints、endpoint_details、transport_services、root及Day | 独立segment日期/时区/terminal/literal一致，Local Clock精度不漂移，Cold不产生伪instant |
| CORE / P3 | Stay details/rooms/Place/temporal受影响叶子，Item revision；NO_CHANGE不增 | collection+original receipt+独立PG当前Room集合 | tripCoreV2Repository + P1P3DayFeedRepository/p3DetailRead | trip_core_trip_stay_details/stay_rooms、root、相关Day projection | 房型/quantity/capacity、nights、到离时间/政策、Notes和Place一致，未改Room ID/证据不变 |
| CORE / P4 | Rental details + pickup/return分role子行，仅指定叶子改变 | collection/Item+original receipt | tripCoreV2Repository / P4DayFeedRepository/p4DetailRead | trip_core_trip_rental_details/rental_places及root | 两端地点/时区、五标量/false/null、Opposite role保持，Cold一致 |
| CORE / P5 | Service/Endpoints/annotations/operational按角色稀疏改变 | collection/Item+original receipt | tripCoreV2Repository / P5DayFeedRepository/p5DetailRead | transport_services/endpoints/endpoint_details/transport_operational_facts、root | Meeting/Checkin/BoardingCutoff分别显示，未改role/Source字段完整 |
| CORE / P6 | Activity details/Entry Place/Category/root及Day revision | collection/Item+original receipt | tripCoreV2Repository / P6DayFeedRepository/p6DetailRead | trip_core_trip_activity_details/activity_entry_places、root、Day | session/admission note/entry地点保真，省略Entry不清，Cold保持 |
| CORE / participation/visibility/hide/restore/delete | Item semantic revision和授权可见状态/访问版本；删除按OD02 | 当前授权collection；失去可见性需正式revoke/tombstone/完整投影证明 | tripCoreV2Repository、memberAccessLossAdapter、Day/Detail可见性投影 | participants/visibility rows、read certificates、Day，受权缓存撤可见性与pending隔离 | 已Hide在默认Day不显示但可管理列表可恢复；失权不再打开正文；无权结果不泄漏对象存在性 |
| ROSTER / read | 无业务Mutation；现有Auth变化会改变证书/角色/参与revision | 本Beta只读Roster，底层原Bootstrap完整证书 | ledgerReadRepository.applyBootstrap + Core person bindings / People view | ledger_members/households、actor_context、roster certificate、Core person bindings | Item选人和Expense Split使用同一稳定Person/Member映射；同名不合并，Account不推断 |
| LEDGER / Expense create/edit/delete/restore/valuation/payment record/resolution | Expense canonical revision/原operationReceipt，participants/splits/valuation/audit按正式命令更新，final保护不破 | ledger/bootstrap、ledger/changes、Expense detail、原Ledger operation；Currency另查settings | ledgerReportingCoordinator → ledgerReadRepository；本机pending通过既有causal conflict/shadow合并 | ledger_expenses、participants/splits、valuation snapshots、payment records、audit/conflicts/causal/outbox/cursors | Spending/Expense Detail和Current计算一致；已删行正确隐藏/可恢复，原final不变；不能用MCP端结果直接灌SQLite |
| LEDGER / Currency | settingsRevision/changeId、未final的合法重估/待处理状态；immutable final不变 | Currency receipt + Bootstrap/changes | ledgerCurrencyRepository、ledgerReadRepository + reporting refresh | ledger_journeys/settings、Expense估值依赖及相关缓存 | 结算币标识/current values更新，旧Final历史金额和币种保持 |
| LEDGER / Item Expense Link | Core expense_links/root revision按正式Receipt，无Expense金额写入 | Core relation+Expense detail/授权link projection | tripCoreV2Repository + Item detail/ledger relation投影需要补验证 | trip_core_expense_links与Item/Expense展示关系，原Expense主记录不复制 | 两端同一Expense ID可打开；link失败Expense仍存在；unlinked后关系消失但Expense不删 |
| SETTLEMENT / 全部只读 | MCP不写任何Final、Transfer、Payment或Review状态；Expense写可能改变Current计算 | Bootstrap中settlements、settlements/version/history/preview、existing payments read | ledgerReadRepository.applyBootstrap/applyChanges、ledgerSettlementRepository.applyFinalized、Ledger reporting hook | ledger_settlements/inputs/member_balances/transfers/audit；read cache | Summary/Paid/Shares/History使用同一head/digest/comparison身份；不能混Current与Final版本，Cold能看历史 |
| PERSONAL / 只读Payment | MCP无个人付款写入 | 原personal-payments/changes、read projection | ledgerPersonalPaymentCoordinator/Repository，reporting辅助读 | ledger_personal_payment_records、fx_projections、sync_cursors | 本人/对端合法可见投影，个人声称与confirmed transfer分开 |
| REVIEW / 只读Personal Review | MCP不POST checkpoint | GET settlement-review | personalSettlementReviewCoordinator.refreshPersonalSettlementReview / Repository.applyRemote | ledger_personal_settlement_review_state | Review当前fingerprint/status正确；503保留已存数据并显示未刷新，不能自动Mark Reviewed |
| Export / History只读 | 无对象/Revision改变 | 授权数据page/immutable version | 可直接读取Server数据导出；App既有exportRepository/Coordinator独立本地artifact | 原export manifest仅在Native自行生成时记录；MCP JSON不新建本机同步任务 | App数据保持不变；导出行权限/币种/时间/版本一致，无云文件副作用 |

Canonical Core SQLite表名见 `src/data/db/migrations/tripCoreV2.ts`。Reader `validateCoreReadCollection`先校完整性/Actor/Trip/证书/hash，再在Account apply gate内安装，构建Day投影不能改写canonical。Ledger列举以各Repository现有表为准，Migration沿Layer1唯一Writer统一分配编号，禁止在合同硬编码未来SQLite编号。

## 4. 生命周期与发现

| 条件 | 合同必须达到的行为 | 验证方式 |
| --- | --- | --- |
| 前台同Trip，外部Server修改 | 通过当前正式Reader自动发现，避免依赖本机outbox wake；coalesce，未变不重写；正式Commit→对应可见UI≤15秒，按§6计时 | HTTP保存后保持App原页面，不手动pull/refresh；记录commit/Reader/UI三个时间 |
| 当前Trip之外的新Trip/其他Trip变化 | Discovery在原账号生命周期正常触发；进入该Trip时读当前collection | 外部Create→MyTrips正常触发→打开；不得通过创建本地Trip伪入口 |
| App后台恢复 | 同一正常Session前台校验/refresh，网络失败仍可进入缓存；正常读后更新 | 真正background→foreground，外部只执行一次Mutation |
| 冷启动 | SQLite合法缓存立即可用，silent session refresh/正常读补新Revision；不再执行MCP Mutation | 完全终止/重启同一App数据，验证新旧修订及Queue不增加 |
| 离线→重连 | 保留原缓存、draft/pending/UNKNOWN；不显示新Server值为已同步；联网后正式pull | 断开网络→外部Server一次写→离线读旧缓存→重连自动发现 |
| Account/Trip切换 | generation fence取消旧read/订阅/通知安装；仅当前actor缓存展示 | 在Reader响应途中切换，late结果不能写入新Account可见投影 |
| 失权/403/404 | 正式readAccessLoss才能标ACCESS_REVOKED；普通失败或分页遗漏不删数据/不授予新权限 | 原Authority撤权负例用现有合成账号，不能以修改RLS假造 |
| Hide/Delete | 需要明确可见状态或tombstone；从快照消失不足以区分隐藏/删除/失权 | 按OD01/02最终语义在管理列表/默认Day/冷恢复分别验证 |
| 本地pending与远端并发修改 | accepted snapshot与pending/causal shadow分开，旧读不覆盖新本地意图；冲突不LWW | 普通App本地draft/pending与HTTP一次写并发，保留两个事实并显式冲突 |
| Server UNKNOWN | App独立pull可以合法发现已提交事实，但不能将其当MCP原Receipt恢复证明 | 同时核原operation状态和accepted snapshot，绝不从App再提交原请求 |

本合同不选Realtime实现。可用现有完整Reader+受控前台触发满足要求，廉价Version Reader/私有channel仅在正式资格和实测后启用。OD04是刷新体验要求，Timer/Publisher的工程选择由Layer1独立决定，不能让Layer2依赖其细节。

## 5. Layer1验收制品

每个写能力保留 `capabilityId/sourceCommit/serverBuild/schemaHash/account/trip/target/operation/beforeRevision/afterRevision/receiptHash/readbackHash`。各字段保留before/after与允许变化集合，完整Room/端点/来源状态比对。每个Sync组记录Reader请求、Repository安装结果/证书、SQLite只读检查、原页面截图/AX、进程冷恢复和网络恢复结果。

独立PG读回是验证手段，不是业务写入手段。可使用独立Backend、独立PG和专用Simulator，但数据必须经正常Auth/HTTP/Core/Reader进入App。fixture可验证错误路径，不能替代正式链路的PASS。测试开启Sync要用正常产品组合，不携QA账号/Trip白名单、任意cutoff进正式接口。

只有所有范围内Server能力、相应Sync组和选定体验验收满足后才称Layer1完成。生命周期Decision已确认，真实接口缺口只阻塞对应操作，其余接口可独立实现；实施时不得擅自降低已批准总完成范围。


## 6. OD04正式Commit→UI计时与覆盖（强制验收）

前置为同一合法账号、在线且Reader正常、App持续前台、当前Trip、对应UI可见。t0为正式Authority事务durable Commit的服务器时间/提交追踪事件，t1为同一对象ID、对应新Revision/值已安装并在当前iOS UI完成可观察渲染的时间；要求t1−t0≤15000ms。HTTP响应接收、pull启动、SQLite安装均不是终点；Preview/请求发出不是起点。记录operation/receipt/commit事件、Reader snapshot、Repository/SQLite安装、UI截图/AX/渲染trace的关联ID。

设备与服务器跨时钟须记录校准/offset及最大误差，使用可关联的单调trace；按误差上界计算仍≤15000ms才PASS。若无真实Commit事件或可靠时钟界限，结果NOT_PROVEN，不能用响应到达代替Commit或把createdAt当提交时间。只读API不会制造Commit；以其所反映的正式写事件验收。

覆盖本合同所有可写业务域：当前Trip metadata/currency/lifecycle（Archive、Unarchive、logical Delete）；P1–P6 Create/所有支持字段Update、Hide/Restore/Delete、participation/visibility；Expense Create/Edit/Delete/Restore、valuation/payment-record/resolution及Item–Expense link/unlink。每域证明同一正式Revision及允许变化集合，不能用Notes一例推断全部。Expense变化导致Current Settlement/Personal Review派生显示变化时，当前可见的相应视图也必须正常刷新；不执行Settlement/Personal Payment/Review写入，不改immutable Final。Roster本身只读，来自原Authority变化的当前可见人员/权限投影也受正常前台刷新和访问隔离约束。跨Trip Discovery、新Trip未打开页面、Export不承诺未展示页面的15秒渲染；选择/进入Trip立即正常读取，不得借此延迟当前可见Trip变化。

后台期间不计在线前台15秒SLA；前台恢复或网络重连时立即enqueue正常同步，不等待下一退避周期。记录恢复事件→调度→读回→UI时间，保持缓存/账号generation fence。网络/服务异常保留既有Backoff，记录异常与恢复，不能把失败样本当15秒PASS，也不能把离线期间原Commit到恢复的时间伪装为正常在线样本。

SY05必须确保最坏发现间隔+读取+校验/安装+渲染整体≤15秒；现有8/15/30/60秒自适应周期本身不满足保证，必须修复正常产品调度。允许轮询、Version或合法Realtime组合；不指定技术，不建立第二套Sync Engine。测最不利轮询相位、Reader延迟、前台恢复/重连和Account切换负例。Layer1逐领域提交FOREGROUND_AUTO_REFRESH_PASS的实际证据与最大时长；合同冻结不代表当前实现已达到SLA。
