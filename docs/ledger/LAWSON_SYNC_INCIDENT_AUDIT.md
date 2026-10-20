# LAWSON 本地／服务器一致性审计

日期：2026-09-28。状态：只读审计完成，方案待 Owner 确认；未实施修复。

## 结论

LAWSON 不是一个靠刷新就能恢复的缓存问题。服务器自动估值已经推进版本，
手机仍以旧版本提交接受汇率和删除命令；两次命令均被拒绝。本地保护未同步
意图是正确的，但冲突后的收敛、操作结果反馈、删除意图表达和正式处理入口
没有形成闭环，最终留下“本地已隐藏，服务器仍有效，结算持续阻塞”的状态。

版本检查与禁止静默覆盖财务变更应保留。修复目标是保存用户意图并使状态
可解释、可处理、可收敛，而非绕过结算保护或把冲突当成网络错误重试。

## 范围与证据

- 当前共享 HEAD：`797e789`。保留该 Journey 路由修补，未改应用代码。
- Dev Journey：`Settlement Final Versions Acceptance 2bb2624c`。
- LAWSON 服务器 Expense：`d09fd165-409b-48de-a7f8-9beb01c8f02e`。
- 只读检查 Dev Expense、审计事件、该 Expense 的幂等命令结果、汇率快照、
  冲突解决记录及结算／调整预览；未调用财务写入／确认／冲突解决接口。
- 追踪 repository → durable queue → worker → Backend → SQL → pull → UI。
- 现有六组相关测试 32 项通过；临时隔离审计三组六项通过，其中四项确认
  下文的当前缺陷行为，另两项是沿用的汇率接受基线检查。
- 未导出手机数据库。不能据此断言手机当前每条队列记录的精确状态；
  本地行为以源码、隔离 SQLite 复现和已提供截图为证。

## 实际时间线

下表是 Dev 持久化事件时间，不是截图时间；本地为 Pacific/Auckland（UTC+13）。

| 时间（9 月 28 日） | 事件与结果                                         | 版本／后果                                                            |
| ------------------ | -------------------------------------------------- | --------------------------------------------------------------------- |
| 17:30:34.659       | CREATE_EXPENSE，201                                | 服务器 revision 1                                                     |
| 17:30:41.260       | 自动 APPLY_VALUATION，200                          | 服务器 revision 2，REFERENCE_RATE，ACCEPTED                           |
| 19:53:40.329       | 用户接受缓存汇率，APPLY_VALUATION，409             | baseRevision 1／currentRevision 2；FINANCIAL_CORE 冲突                |
| 21:26:41.189       | 用户删除，DELETE_EXPENSE，409                      | 仍以 baseRevision 1 请求；服务器未删除                                |
| 审计时             | Expense 仍为 ACCEPTED、revision 2、deleted_at=null | 两条服务器冲突均无 resolution；两个预览均因 LAWSON OPEN_CONFLICT 阻塞 |

服务器已经使用 2026-09-25 的 ECB 参考汇率处理 2026-09-27 的交易，金额
JPY 644 → NZD 7.21，provenance 标明 automatic=true。因此“服务器一直没取到
汇率”不符合这笔 Expense 的实际记录。手机显示等待／近似值，反映本地没有
采用已生效的服务器版本。手动接受与自动参考估值虽然四舍五入金额相同，
政策与来源仍不同，不应仅按金额相同自动抹掉用户选择。

对之前“自动汇率与接受动作竞争”的表述作修正：本笔自动估值早于接受动作
两个多小时。并发更新是该路径的一般风险，本次已证实的直接原因是旧版本
长期未收敛。之前已确诊的 receipt INSERT 22 列／23 值错误能够让 pull 事务
整体失败；是否是最初到接受前所有失败的唯一原因，缺少手机历史日志，不能
作绝对断言。进入财务冲突后，正常 pull 也不会强行覆盖本地意图。

## 已确认的断点

### 1. 拉取失败扩大为整条 Journey 的旧版本停留（已修复）

`ledgerReadRepository.applyReceipt` 的占位符错误导致 SQLite 事务回滚；同批
Expense 更新与 cursor 都不能提交。收据问题因此阻止财务版本进入本地。
已有真实 SQLite 回归、签名安装及手机拉取恢复证据。

改正 SQL 是必要修复，但已经持久化的冲突不会因此自动消失。不得跳过坏记录
后直接推进 cursor，否则变成静默漏数据。后续应提供失败阶段／实体类型／
安全错误码，并保留完整事务重试与适用的作用域隔离。

### 2. 冲突保护有入口，没有正常产品的出口（P1）

`ledgerReadRepository` 对 PENDING_CREATE／UPDATE／DELETE、SYNCING、CONFLICT、
FAILED 暂存服务器 Expense，保护本地意图；cursor 可在暂存成功后推进。
这不是数据遗失，服务器 revision 2 在 deferred 表等待处理。

但正式 Expense Detail／Settlement 页面仅显示冲突文字；现有
`queueConflictResolution` 只接入阶段验收／Smoke 工具，没有正式产品操作。
`drainDeferredExpenseChanges` 遇到受保护状态继续跳过。因此重进页面、刷新、
重装保留数据，都不会自动解除真实财务冲突。

### 3. 汇率“本地已保存”被当成“处理完成”（P1）

`acceptSettlementRates` 写入 MANUAL_AGREED 后等待 `runLedgerOperationalSync()`。
后者是后台运行完成信号，内部 `Promise.allSettled` 和 SyncEngine 记录失败／
冲突后正常返回；返回不代表指定命令被服务器接受。

接受流程没有读取每项操作的最终确认结果。`SettlementRateAcceptance`
在 finally 调用 onAccepted 刷新；候选过滤又排除已经本地有 valuation 的
Expense。结果是卡片消失，用户却只在其他页面遇到冲突。多项接受逐笔保存，
可能部分成功，也没有逐项结果清单。

本地 revision／金额校验已有，但它不能证明服务器版本没变，更不能替代
服务器确认。离线时本地接受仍应允许，只能明确显示等待同步。

### 4. 删除绕过冲突状态，隐藏了需要处理的项目（P1）

`tombstoneExpense` 检查权限／已结算保护，未处理已有冲突；直接写 DELETED、
deleted_at 和 PENDING_DELETE，覆盖原 CONFLICT sync_status，再用旧
serverRevision 入队。worker 的冲突门禁仅检查 Expense sync_status，不能
阻止这类状态覆盖后的删除请求。版本 CAS 在服务器正确拒绝本次删除。

列表默认按 deleted_at 过滤，所以项目立即消失。Entry 页面随本地事务成功
退出，只 kick 后台同步，没有“本机待删除／删除冲突”的可见操作入口。
本地优先删除可保留，但不能把它展示成已经完成服务器删除。

### 5. 删除冲突合同丢失删除意图（P1）

Backend 生成 DELETE 的候选 entity 时正确设为 DELETED，但构造 409 时调用
`editableExpense(entity)`，该函数把 DELETED 强制转为 ACCEPTED，并且不包含
deletedAt。实际 Dev 删除冲突的 submittedStatus 与 currentStatus 都是
ACCEPTED，changedGroups=[]。

`Stage4EditableExpense`／resolution schema 排除 DELETED，`mutationResponse`
固定 deletedAt=null，现有 KEEP_MINE 路径最终执行 UPDATE_EXPENSE。
所以不能把现有“保留我的版本”直接当成“保留我的删除”，否则可能保留／
恢复 Expense。命令类型仍在幂等记录中，但通用冲突快照没有完整表达它。

### 6. 本地与服务器的多冲突生命周期不同（P1）

`recordConflict` 将同 Expense 的旧 OPEN 本地记录设为 SUPERSEDED；正式入口
即使补上，目前也只会取最新 OPEN。服务器则按每条 409 幂等记录是否有
`expense_conflict_resolutions` 判断 OPEN；resolution SQL 只关闭指定 conflictId。

LAWSON 服务器确有两条未解决记录。只解决最新删除冲突，早先汇率冲突仍可能
阻塞。这里的“本地取代”不等于“服务器解决”，需要一个双方一致、可审计的
链处理规则，不能靠本地标记掩盖服务器未处理的用户意图。

## 同链路额外风险（不等于本次已发生）

1. **旧响应覆盖后续本地操作（P1，隔离复现）。**
   `reconcileCanonicalExpense` 无条件替换聚合并置 SYNCED，未检查请求开始后
   是否有新本地 revision／待处理命令。隔离 SQLite 检查中，返回 revision 2
   覆盖 revision 3 的 PENDING_DELETE，删除状态丢失。未证明本笔发生此覆盖。
   同类风险涉及估值、冲突解决、correction 返回；应共享修复。
2. **队列快照与 CAS 基线脱节（审计风险）。**
   worker 用 durable payload 保存的意图，但更新／删除／估值的 baseRevision
   取执行时 Expense.serverRevision，而非总是原始观察基线。CREATE 依赖已有
   因果处理；其他命令应证明前序完成或字段未变，不能仅替换最新 revision。
3. **状态统计不完整。** `hasPendingFinancialOperations` 不包含 FAILED／CONFLICT。
   服务器 blocker 暂时守住本笔 finalization，但该布尔值不能用来表示“本地
   没有未解决财务意图”。需要单独的待同步／失败／冲突状态。
4. **Data Health 的本地冲突关闭未闭合服务器状态（静态风险）。**
   `STALE_EXPENSE_CONFLICT_ACTION` 对等价证据可在本地把 OPEN 标 RESOLVED，
   但该分支没有服务器 conflict resolution 确认。对本筆真实删除／汇率差异
   不满足自动修复条件，不能用它消除 LAWSON；对等价冲突也需验证服务器不再
   阻塞后才能称恢复一致。

## 已修复但应区分的问题

- Receipt SQL 拉取失败：已修复；不负责自动解决既有财务冲突。
- PostgreSQL numeric → JS 精度往返造成 Looks good 误判：Dev 精确字符串函数
  已部署，Owner 已验证状态保持；不是本次删除拒绝的原因。
- 在线状态与同步错误分离、权威 blocker 展示：已改善；显示真实 blocker
  不等于处理了 blocker。
- Stage 4B guard digest 过滤：已修复，但当前 Journey 无该 fixture，不能把
  它当作本笔的根因。

## 建议的完整修复方案

### A. 先把状态与用户意图表达完整

- 保留现有本地事务／队列；操作结果按每笔命令返回：本地保存、等待同步、
  服务器已确认、需要处理。后台循环结束不能充当财务成功。
- 删除需保存完整 DELETE intent、观察到的服务器版本及受影响冲突链；
  本地待删除／失败项目在 Review／同步问题入口仍可访问，提供继续删除或
  取消本地删除。普通列表可隐藏，但不隐藏待处理入口。
- 汇率批量接受显示逐项结果，允许重试失败项；未确认不宣称已经锁定到服务器。

### B. 让每笔 Expense 有一条可收敛的命令链

- 复用 durable queue 的依赖、租约和幂等机制，补齐同 Expense 的因果顺序；
  不引入新的同步框架。发生真实冲突时停止普通后续命令，保留后续意图。
- Canonical response 按所确认的 operation／本地 revision 应用；存在更晚
  本地操作时更新服务器基线／暂存 canonical，重算本地投影，不能覆盖后续
  tombstone 或标成整体 SYNCED。pull 和 mutation receipt 应遵守同一保护规则。
- 网络／5xx 可重试；真实冲突可处理；仅版本过期但用户观察的相关字段未变的
  情况，使用有证明的重基线规则。修改已尝试 payload 时生成新幂等命令，
  不复用旧 409 的 key，也不修改既有幂等回执。

### C. 补齐命令类型明确的冲突解决合同与正式 UI

- 用现有 collaboration repository／worker／Backend 为基础，支持 UPDATE、
  APPLY_VALUATION、DELETE、RESTORE 各自的意图；不要把 DELETE 转成普通 UPDATE。
- Detail 与结算 blocker 都链接到同一个处理入口，包括本地已删除项目。
  展示“你的操作／服务器变更／采用结果”，汇率用日期、政策、金额解释。
- resolution 必须带 currentRevision 和明确的 conflictIds；服务器在同一
  事务中验证权限、冻结保护及冲突链，应用选定操作并记录每条关闭／取代原因。
  不能无条件关闭同 Expense 所有冲突。
- 选择删除后，相关早期估值意图可按明确的后续删除选择被取代并审计；最终
  保留 tombstone。已删除的旧冲突 resolution 不得复活项目；恢复另走 RESTORE。
- Data Health 仅自动处理被证明完全等价的情况，关闭状态须与服务器一致；
  财务差异／删除选择始终留给用户。

### D. 防止旧服务器版本被推荐为新的接受候选

- 在线接受前通过现有协调层收敛相关 Expense 的已完成命令／最新 canonical；
  候选绑定 revision、原币金额、交易日期、Journey currency 和展示汇率。
- 服务器若已有自动参考估值，展示当前值；仍允许用户明确接受展示的约定汇率，
  但需要基于最新版本验证同一确认意图。新金额／日期／币种／展示汇率变化需
  重新确认，不能盲目重试或静默自动合并。
- preflight 与后台自动估值不能取代用户已经有效接受的 MANUAL_AGREED；
  同一服务器事务 CAS 继续防止并发篡改。

### E. 本笔恢复与全链验收

本笔用户最新意图是删除 LAWSON。修复后应显示“删除未同步：服务器曾更新
汇率”，通过审计后的 DELETE resolution 在最新版本上完成删除并处理其
相关两条冲突；不需要让用户先接受一个已不打算保留的汇率。审计本身不执行
该操作，也不确认 Settlement。

验收必须覆盖：

1. 创建后服务器自动估值，本地随后接受／删除；没有永久版本分叉。
2. Offline 接受／删除 → 退出／重启 → reconnect；意图保存且结果逐项明确。
3. 一个 pull batch 的 receipt 应用失败不推进 cursor，修复后整批正确重放。
4. 同 Expense 两条以上冲突；一次选择处理明确覆盖的链，双方 OPEN 数量一致。
5. 删除 conflict response 表达 DELETE，解决后不被 UPDATE／旧 response 复活。
6. 旧估值／correction／resolution 响应晚于新的本地删除；不覆盖新意图。
7. 多项汇率部分成功、409、5xx、响应丢失、跨账户中断；不虚报整体成功、不重复写。
8. 真正金额／payer／split／日期变更仍须确认；已结算记录仍禁止普通删除。
9. 等价冲突 Data Health 修复后服务器 preview 同时恢复；不同财务意图不能自动修复。
10. 本笔恢复后重新拉取，双方 LAWSON 为 tombstone、相关命令／冲突终态一致，
    canonical 与 adjustment preview 不再报 LAWSON；Confirm 仅在所有其他门禁
    满足后可用，实际结算确认仍由用户执行。

实施建议按 A+B+C 的闭环作为一个一致性修复切片，再接 D，最后用 E 验收。
发布顺序为向后兼容 Backend 合同／Dev migration → 客户端 → 已有冲突恢复。
需要更新 API／Offline Sync 与 ADR；若正式冲突入口超出现有批准范围，先确认
Product 增补。本次只提出方案，无依赖新增、部署、业务数据修复、Git 提交。

## 未提交 Settlement 补丁对照复核（Owner 要求记录）

2026-09-28 已逐项核对 tracked diff 及 untracked 文件；不把“未提交”等同于
“未部署”，精度函数与部分 Backend 修复已在获准 Dev 生效。

| 补丁                                                                 | 结论／后续要求                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Receipt INSERT 占位符修复                                            | 与审计一致，保留；不宣称能消除既有冲突                                            |
| Online／Offline 与同步失败分离、分阶段安全诊断                       | 与审计一致，保留；继续补充失败／冲突的操作级结果                                  |
| 精确字符串 financial source migration                                | 与审计一致，保留；保持真正财务变更的 CAS 拒绝                                     |
| 审核旧回执不能清除更新的 pending choice                              | 与审计一致，保留；保护仅在审核 repository，不能代替 Expense 聚合的晚响应保护      |
| 未就绪时仍可 Looks good，指纹包含个人相关未解决输入                  | 与审计一致，保留；审核不是 FX 接受或最终确认                                      |
| 展示权威 OPEN_CONFLICT blocker，blocked preview 不强制本地 hash 修复 | 与审计一致，保留；仅允许显示，两个 finalizer 仍要求 READY，READY 来源验证继续保留 |
| 显式接受缓存汇率、展示精确率与来源                                   | 产品意图保留，但实现未完成；不能以同步循环结束代替逐项服务器确认                  |
| applyValuation 的 expectedRevision／expectedSettlement 本地检查      | 必要但不充分，保留并补最新 canonical 检查／冲突结果反馈                           |
| 自动估值后的接受候选、部分成功、卡片消失                             | 接受流程需要复核和修正；ADR 0054 已要求失败／部分同步可见，当前实现未达到该要求   |
| DELETE intent、正式 conflict UI、多冲突终态、Expense 旧响应保护      | 之前补丁未修复这些底层断点，进入本审计的闭环切片                                  |

不得整体回退有效补丁，也不得把整批改动标为“Settlement 同步已解决”。后续
提交分开可独立验证的基础修复与完成后的接受／冲突闭环；保留 Journey 路由
及附件修补提交，不整文件还原。此表是 review 待办记录，不是代码修改授权。

第二笔复核见 [ce SHi22 补充审计](CE_SHI22_SYNC_INCIDENT_AUDIT.md)：确认普通
无业务差异 Save 也会制造 UPDATE 冲突，并发现等价时间字符串误分类。
