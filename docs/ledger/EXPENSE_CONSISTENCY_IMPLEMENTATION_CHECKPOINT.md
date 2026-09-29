# Expense consistency closure — implementation design checkpoint

2026-09-29。状态：Phase 1／Phase 2 已获 Owner 接受（SQLite v40）；Phase 3 Backend／SQL 本地及已授权 Hosted Dev gate PASS；Phase 4 正式 UI／真实 Hosted Dev 原生验收 PASS（SQLite v41）；Phase 5 latest-state rate acceptance automated／已授权 Hosted Dev gate PASS；Phase 6 正式事故恢复／完整验收 PASS，Expense Consistency Closure PASS（Hosted Dev only）。

Phase 3 gate：`docs/ledger/EXPENSE_CONSISTENCY_PHASE_3_BACKEND_SQL_GATE.md`。
Phase 4 gate：`docs/ledger/EXPENSE_CONSISTENCY_PHASE_4_FORMAL_UI_GATE.md`。
Phase 5 gate：`docs/ledger/EXPENSE_CONSISTENCY_PHASE_5_LATEST_STATE_RATE_ACCEPTANCE_GATE.md`；Owner 已单独授权 Phase 6 及其 Hosted equivalent admission 补丁。
Phase 6 gate：`docs/ledger/EXPENSE_CONSISTENCY_PHASE_6_REAL_RECOVERY_GATE.md`；停在 Phase 6 gate，不执行 Settlement Confirm。

范围：LAWSON 审计 A+B+C 为不可拆开的交付切片，随后 D，以 E 完整验收；
包含 ce SHi22 的 N1、N2、R1。同一机制处理两个真实 fixture，无名称／ID 特例。
复用 repository、SQLite、durable queue、worker、Backend、现有审计与附件管线。

## 1. Expense operation result contract

CREATE／UPDATE／APPLY_VALUATION／DELETE／RESTORE 统一返回并可按 operationId 查询：

`{ expenseId, operationId, commandType, intentSequence, state,
   disposition, confirmedServerRevision?, error?, blockingOperationId? }`

| state                    | 判定证据                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- |
| LOCAL_SAVED              | 本地事务已提交；不证明远程写入。业务 no-op 为 operationId=null、changed=false |
| PENDING_SYNC             | 已有 durable command，等待网络／auth／前序命令或正在执行                      |
| SERVER_CONFIRMED         | 匹配该 command 的服务器回执，且回执、本地结果与 reconciliation 原子提交       |
| CONFLICT_REQUIRES_ACTION | 服务器真实 conflict 或被该 Expense 未处理冲突链阻塞                           |
| RETRYABLE_FAILURE        | 已记录可重试的网络／5xx／未知等失败，保留原意图与 retry 元数据                |
| TERMINAL_FAILURE         | 明确 allow-listed validation／permission 等拒绝，需用户修正                   |

状态从操作记录投影，不从 sync cycle Promise 或 Expense 总体 syncStatus 推断。
已被用户选择放弃／取代的旧 command 由服务器 closure receipt 证明终结，
disposition 区分 APPLIED／KEPT_SERVER／SUPERSEDED；不得把后两者称为“汇率已采用”。
依赖终结规则也读取 disposition，不能仅凭队列 COMPLETED 推断前序意图已应用。
若新意图在事务提交后已被调度，查询可以直接返回其当前状态；不虚构 LOCAL_SAVED
与 PENDING_SYNC 之间的非持久化窗口。

批量汇率接受返回 `results[]`，每项绑定其 operationId；已完成、等待、409、
retryable、terminal 分开显示，允许部分成功。重试指向已有 command，明确修改
意图才产生新 command。业务 no-op 不制造 operation；已有未同步意图仍单独可见。

## 2. Per-Expense causal command model

每个新 command 保存版本化 intent envelope：

`{ commandId, intentVersion, intentSequence, predecessorOperationId?,
   observedServerRevision, observedBase, patchOrIntent, causalBaseReceipt?,
   boundExecutionRevision?, idempotencyKey }`

- 在同一 SQLite 事务提交 user intent、projection 和 command；intentSequence
  按 account＋Expense 单调递增，与 server revision、local revision 分开。
- observedBase 是已知 server baseline，不能把包含更早待处理修改的 local aggregate
  冒充服务器基线。后续 patch 相对用户当时看到的 projection 计算，并保存因果前序。
- 扩展现有 dependency／lease／claim 到同 Expense 的全部命令；每次只执行因果
  可运行的一条。真实冲突阻止普通后续命令，用户仍能保存后续意图；显式 resolution
  是有 covered-chain 证明的恢复命令，不因其要解决的冲突而永远阻塞。
- 未尝试命令可按已有 coalescing 规则规范化；网络尝试前持久化绑定的 CAS 基线。
  仅能由被证明的前序回执绑定，不能盲目用 latest serverRevision 替换 observed base。
  已尝试 payload／key 不变；不同请求生成新命令并保留关联。
- command 回执与 pull 均走同一个共享 repository reconciliation 边界：
  单调更新 canonical baseline；确认指定 operation；基于更晚未终结 intent 重算
  projection；保留 pending／conflict／tombstone。未更晚意图时才能整体 SYNCED。
- 服务器已接受但 canonical 低于当前已知版本的迟到回执可确认该 operation，
  不倒退 baseline。较低版本 deferred 数据同样不能倒退；不回退 cursor。
- feed event revision 用于事件／游标进度，aggregate.revision 才是 canonical 版本；
  event envelope=1／aggregate=2 不能被解释为 canonical revision 1。
- 回执应用、操作确认和依赖唤醒在本地同一事务完成；account generation 改变时
  不在另一账号中应用结果或继续网络流程。恢复后仍用原 key 查询／重放。

UPDATE patch 分为 DESCRIPTIVE、FINANCIAL、PARTICIPANT_SPLIT；valuation 与
lifecycle 是独立命令。未出现的字段表示“未要求修改”，显式 null 表示清除。
业务 no-op 不推进 local revision、不产生 UPDATE；附件-only 只提交现有附件
事务／队列，仍校验 loaded revision／attachment set，不写财务聚合。

三方规则在共享 domain helper 中确定性执行，Backend 在持有 Expense 锁的事务
内复核：observed base 必须能由服务器不可变历史回执／审计快照验证，不能仅信
客户端提供的 base。新的写入把标准化 base/result 投影及 digest 写入现有审计
metadata；旧记录优先验证已有成功回执，证据不足禁止自动 merge。

允许保留同一 financial input 上服务器新增的自动派生估值，应用 title／note
patch；同字段不同目标、真实金额／currency／economicDate／payer／原币 split
变化、明确 valuation choice 分歧必须进入 conflict，不悄悄放宽财务检查。
已等于服务器结果的 patch 可审计为等价，无需制造新 Expense revision。
自动 merge 记录规则版本、base/current/result digest、保留字段与 patch。

occurredAt 验证合法后比较 UTC instant；economicDate 单独比较业务日。
split 比较用户输入方法／权重／百分比／原币分配，派生 settlementMinor 单列为
估值结果；不把它当成用户 split patch。金额继续 integer minor、汇率精确字符串。

## 3. Conflict-chain resolution contract

服务器冲突链返回每条的：command type、original command/key 引用、submitted
typed intent、observed/base revision、current canonical revision、差异来源与 lifecycle。
READ 支持 tombstone，不依赖普通列表。客户端不再自行 SUPERSEDE 服务器 OPEN。

resolution request：

`{ contractVersion: 2, commandId, intentType, submittedIntent,
   observedBaseRevision, currentServerRevision, coveredConflictIds,
   expectedChainDigest, choice, reason }`

choice 明确 KEEP_SERVER／APPLY_PATCH／APPLY_VALUATION／CONFIRM_DELETE／
CONFIRM_RESTORE／ACCEPT_EQUIVALENT；不能用 editable ACCEPTED＋UPDATE 模拟删除。

返回：`{ resolutionReceipt, canonical, openConflictIds,
   conflictOutcomes[{ conflictId, lifecycle, reason, supersededByCommandId? }] }`。
生命周期 OPEN → RESOLVED／SUPERSEDED 只由服务器事务决定，既有终结审计不可变。

服务器在一个事务内检查 membership、权限、frozen Settlement、当前 revision、
完整 chain digest、covered IDs 的 Expense／归属／关联与选择，执行真实 typed
command，并给每条 covered conflict 写不可变终结记录和回执；未 covered 的
冲突继续 OPEN。新冲突／版本变化返回需重新查看的结果，不盲目重试。

DELETE 可在用户明确确认后取代所覆盖的较早 valuation 保留意图；reason 与
supersededByCommandId 指明原因，不先要求接受将被删除项目的汇率。DELETE
调用真正生命周期写入；旧 resolution 不能复活 tombstone，恢复只能走 RESTORE。
相同 resolution key 丢响应后重放返回相同 receipt，不重复终结／增 revision。

正常产品提供统一的 “Review changes” 页面，入口来自 Detail、Review／
Sync issues、Settlement blocker；处理列表必须包含本地 tombstone。页面以
业务语言比较最新值与用户保存的变化，明确可选动作及被替代的变化。
Owner 后续明确：该 UI 仅为需要人为决定的安全网；正常自动合并、汇率更新、
重试及服务器确认保持静默，不展示内部链、revision 或 queue 概念。
用户主动选择后显示该决定实际的 pending／confirmed／failure；删除动作使用
“Continue deletion”，最新值使用 “Use latest value”。Rate details 保留溯源。
该正式 UI 是本 slice 必交项，Smoke／Debug 不能替代。

Data Health 保留等价证据检测，但撤销仅本地关闭 server-open conflict 的能力；
只能根据服务器 closure 证据收敛，或通过同一普通队列提交有完整证明的等价
处理命令，不能选择金融差异。明确更新 ADR 0040，不增加独立 health repair API。

## 4. 预计文件与迁移／API 范围

| 层                       | 主要范围                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared contracts／domain | `src/data/api/ledgerMutationContracts.ts`、`ledgerReadContracts.ts`；`src/domain/ledger/conflict.ts`，最小 intent／result helper 与对应测试                                                             |
| SQLite／repositories     | `src/data/db/migrations.ts`；`ledgerExpenseRepository.ts`、`ledgerReadRepository.ts`、`ledgerCollaborationRepository.ts`、`ledgerSettlementRepository.ts`、`ledgerReportingRepository.ts`               |
| Queue／worker／transport | 现有 `syncOperationRepository.ts`、`ledgerExpenseSyncWorker.ts`、`ledgerExpenseMutationTransport.ts`、coordinator／queue activity；局部扩展 engine 接口以事务确认回执                                   |
| Operations／Health       | `acceptSettlementRates.ts`、`expenseReceiptDraft.ts`；`staleExpenseConflict.ts`、`dataHealthCoordinator.ts` 与 policy／tests                                                                            |
| Backend                  | `backend/src/app.ts`、`supabaseGateway.ts`，对应路由／gateway／SQL 验证测试                                                                                                                             |
| 正式 UI                  | `LedgerExpenseEntryScreen.tsx`、`LedgerExpenseDetailScreen.tsx`、`ExpenseFxDetails.tsx`、Review／Ledger needs-attention、两个 Settlement screen 与 rate acceptance；新增一个普通 conflict screen／route |
| Documents                | PRODUCT、API_CONTRACT、DATA_MODEL、OFFLINE_SYNC、CURRENT_IMPLEMENTATION_STATE；新的 consistency ADR，更新 ADR 0033／0040／0054 的相关合同                                                               |

Local forward migration：intent sequence/head、account-scoped canonical baseline／
command receipt、版本化 conflict-chain metadata，复用 sync_operations 及 dependency
索引。老 payload 保留；未尝试命令可规范化，已尝试命令不迁移改写或删除。

Hosted Dev forward migrations：typed patch RPC＋可验证 base 审计；原子链 resolution
RPC＋现有 conflict resolution 表的生命周期／reason／command 关联扩展。复用
幂等表和终结表，不改写旧 409／历史结算。确切编号在 Phase 1 根据当时 migration
尾部确定，避免并行工作碰撞。

API：现有 PUT Expense 增加显式 version-2 patch 分支；现有 valuation／DELETE／
RESTORE 接口附带 typed intent 与 operation receipt；现有 POST conflict-resolution
增加 version-2 链合同。新增 GET Expense conflicts，现有 bootstrap／pull 附带
必要链状态以使另一设备／重启后 OPEN 数一致。既有成功 mutation DTO 保留 canonical
并增加 receipt；不新建通用同步系统。

旧 full-aggregate 请求只按旧严格 CAS 处理，不能猜测其 patch。旧 durable UPDATE
可用本地 base/submitted 生成恢复候选，再由服务器历史证据复核；旧 DELETE 从
原 command type／key 重建意图，不能信已丢失生命周期的 editable 快照。旧客户端
不能用单 conflictId 关闭 typed DELETE 链；必须返回明确 upgrade/action required。

## 5. Phase gates 与 recovery

1. Contracts＋共享 invariants：typed intent/result、no-op、timestamp/split 比较、
   three-way eligibility、旧命令适配测试；先更新相关 docs／ADR。
2. Causal queue／reconciliation：迟到回执、新 DELETE／RESTORE、低 canonical、
   dependency disposition、pull、restart、account interruption 与 SQLite 原子性测试。
3. Backend＋SQL：真实 DELETE round-trip、两个以上冲突的原子终结、frozen／权限、
   chain CAS、无证据不 merge、resolution 响应丢失幂等重放；隔离 fixture 验证。
4. 正式 UI＋结果反馈：三个普通入口含 tombstone、服务器估值只读显示、选择与结果；
   每笔 batch 409／5xx／pending 分类。A+B+C 未完成不得宣称可恢复或交付。
5. Latest-state rate acceptance：复用协调层取得最新 baseline／snapshot、绑定展示
   revision／Money／日期／currency／rate，保留离线 intent；变化重新确认，逐项返回。
6. 统一机制 recovery＋全验收：用户正式页面确认 LAWSON DELETE 与其 valuation
   supersession；ce SHi22 通过有服务器证据的等价 closure 保留参考估值。最终双方
   canonical／tombstone／OPEN 数一致，两个 preview 不再报对应 blocker，所有原有
   Confirm guard 保留。E 的10类、补充8类及 loss/replay／cross-account／Health
   场景一并验收。中间不手工修复这两笔；新 fixture 覆盖同样问题。

Compatibility 判断：与现有分层和 offline-first 模型兼容，但 PUT full aggregate、
CREATE-only dependency、无条件 canonical overwrite、local-only conflict close 四条
已有具体行为必须按本 checkpoint 扩展／收紧，不声称接口与 schema 完全不变。
保留已验证的 Receipt SQL、精度、审核、blocker、Journey／附件修补。部署顺序为
向后兼容 Backend／Dev schema → 客户端 → 正式机制 recovery；Hosted Dev 迁移／
部署单独经过现有检查和授权流程，留回滚。Production 不访问。
