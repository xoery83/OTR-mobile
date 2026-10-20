# Settlement 2.0 技术审计

日期：2026-09-18。范围：仓库源码、SQLite 迁移、Supabase 迁移与相关测试的**只读核对**。产品依据为 [`SETTLEMENT_2_0_PRODUCT_UX_SPEC_v0.3.md`](SETTLEMENT_2_0_PRODUCT_UX_SPEC_v0.3.md)。未连接 Hosted Dev 数据库、运行中的 Backend 或真机；下文“已确认”指仓库实现，部署状态与真实数据分布均为 **NOT VERIFIED**。未修改产品、代码、数据库、测试或环境。

## A. Executive summary

现有 Expense→估值→分摊→零和余额→贪心转账的计算核心与 Settlement 2.0 相容；本地预览和不可变 final/adjustment 历史也可复用。最大冲突在 Payment：当前 `settlement_payments` 是绑定**已最终确认** transfer 的单一共享事件，付款人报告、收款人确认后生成 discharge，并改变 transfer/settlement 的付款状态；它不是双方可独立记录的个人账。其次，没有 “Make corrections” 版本流程，且已 final Expense 的保护在后续 SQL 重定义中出现缺口（详见 E）；Review 缺用户主动提出 Finding 和个人结算复核点。支付币种及本地汇率缓存已有基础，但 Payment UI 没有即时缓存参考选择。需要 UI、应用/Backend、SQLite 和 Supabase schema 一起改。

## B. Current architecture

实际主链：`LedgerExpenseEntryScreen`/`LedgerExpenseDetailScreen` → `ledgerExpenseRepository`（SQLite `ledger_expenses`, `ledger_expense_participants`, `ledger_expense_splits`, `ledger_valuation_snapshots`, `ledger_payment_records`；最后一个是**费用付款成本证据**）→ durable `sync_operations`/`ledgerExpenseSyncWorker` → `backend/src/app.ts` Expense 路由 → `supabaseGateway.ts` → `public.expenses`, `expense_participants`, `expense_splits`, `settlement_valuation_snapshots`。`ledger_settlement_source_7_1` 读取 Journey 设置、成员、Expense、active 估值及 split，`buildSettlementPreview` 计算余额和 transfer；Backend 计算、摘要校验后调用 `ledger_finalize_settlement_7_1`。Mobile `useStage7Settlement`、`SettlementReadinessScreen` 同时读 SQLite final/adjustment 和 `loadEstimatedSettlement` 本地信息性预览。参见 `src/domain/ledger/settlement.ts`, `src/data/sync/ledgerSettlementCoordinator.ts`, `backend/src/supabaseGateway.ts` 的 `calculateSettlementPreview`/`finalizeLedgerSettlement`，以及 `supabase/migrations/20260912000700_ledger_2_stage_7_1_settlements.sql`。

计算细节：每个 `ACCEPTED`、`INCLUDED`、已估值且无冲突的 Expense，将 Journey 币种 `valuation.settlement.minor` 加到 payer 的 `paidMinor`，各 `split.settlementMinor` 加到成员 `owedMinor`，`netMinor=paid−owed`；split 必须与估值总额一致，净额合计为零。债务人与债权人按金额降序、member ID 打破并列，逐对取较小值生成 `ledger-settlement-greedy-v1` transfer。这是确定性贪心，并非有数学保证的最少笔数算法。缺有效估值或 `RATE_REQUIRED`、开放冲突会阻止权威 final；草稿、删除、明确 `EXCLUDED` 则排除。本地估计可展示近日报价，标记约值，不成为 final 输入。证据：`buildSettlementPreview`、`calculateMemberBalances`、`buildTransferPlan`，`src/features/ledger/estimatedSettlement.ts`，`src/domain/ledger/settlementStage7.test.ts`。

**Payment 不进入上述核心 `paidMinor/owedMinor/netMinor` 计算。** `buildSettlementPreview` 构造的 aggregate 甚至将 `paymentRecords: []`，`ledger_settlement_source_7_1` 无 `settlement_payments` join。可是另一路 `buildOutstandingBalanceVector` 会用已确认 discharge 减少“尚欠”向量，`ledger_refresh_transfer_7_2a` 会更新 transfer/settlement 状态；`TransferDetailScreen` 突出 Paid/Remaining。因此“原始结算净额不变”已满足，“当前应付额和建议转账不受 Payment 重定义”在现有付款/adjustment 呈现中有冲突，未来须明确把记录进度与权威计算隔离。证据：`src/domain/ledger/settlement.ts`，`src/domain/ledger/paymentLifecycle.ts`，`supabase/migrations/20260912000900_ledger_2_stage_7_2a_payments.sql`。

final 数据：`public.settlements`, `settlement_inputs`, `settlement_member_balances`, `settlement_transfers`, `settlement_audit_events`, `settlement_adjustment_deltas`；本地同名 `ledger_*` 表见 `src/data/db/migrations.ts` 迁移 12–14。root 持有 `input_digest`、`settings_revision`、算法版本、cutoff；adjustment 持有 root/parent/sequence/prior digest/理由，输入及 delta 不可变。`public.ledger_idempotency_keys` 管理服务端重放。业务表在 `supabase/migrations/20260911000200_ledger_2_security.sql` 配置 RLS，写入经 Backend service role/RPC；迁移中的 immutable trigger 防改历史。此处仅核对源码，实际 RLS 部署状态 **NOT VERIFIED**。

## C. Product requirement compatibility matrix

| Settlement 2.0 要求 | 当前支持 | 状态 | 依据/差距 |
| --- | --- | --- | --- |
| 旅途中当前个人余额、payer/份额解释 | 本地估计与权威 preview 均有余额 | Partial | `useStage7Settlement`, `SettlementReadinessScreen`；无完整 `Paid for group/Your share` Summary |
| 付款不改权威 Expense 结算 | core 预览无 transfer payment 输入 | Partial | `buildSettlementPreview` 满足；discharge/outstanding 与 UI Remaining 混入当前义务呈现 |
| 可在 final 前付款/预付款 | 付款必须有 finalized transfer ID | Conflict | `recordPayment`, `/transfers/:id/payments` |
| 个人 “I paid”/“I received”、双方独立金额 | 仅共享 payer 提案、recipient 确认 | Conflict | `ledger_record_settlement_payment_7_2a`, `ledger_act_on_settlement_payment_7_2a` |
| 可见对方记录、无需确认或自动争议 | 同一付款可见且有 confirm/reject/dispute | Conflict | `TransferDetailScreen`, `settlement_payments.status` |
| 多笔/部分付款、不同付款币种 | 多条 Payment、`payment_currency` 和估值快照 | Partial | 上限绑定 obligation；跨币必须给强制可复现 discharge |
| 双方自有可选凭证 | `evidence_asset_id` 存在 | Partial | PaymentSheet 固定传 `null`；无“收款方自有记录”附件路径 |
| 立即显示本地 FX 参考，允许无参考手填 | Journey 维度汇率缓存存在 | Partial | `listRateQuotes` 可读；PaymentSheet 未查询它，跨币 `rate`/reason 必填 |
| 可选个人复核、Looks good 与受影响 delta | Review 个人决定仅针对 Finding | Missing | 无 settlement statement checkpoint/受影响成员差异投影 |
| Something looks wrong 进入同一 Review | 系统 Finding 与个人决定基础可复用 | Partial | 没有用户创建 Finding 的 API/本地队列/UI |
| Organizer 可不等全员复核而确认 | 仅 owner 可 final；无复核门槛 | Supported | `ledger_finalize_settlement_7_1`；目前也不展示覆盖情况 |
| final 历史、后续更正 | root/adjustment lineage 历史保留 | Partial | 原 final 输入 Expense 仍锁；没有 `Make corrections` 开门/版本流程 |
| 无单笔 Expense 人工 finalize | 无该操作 | Supported | `settlement_inputs` 派生保护，见 `isExpenseFinalized` |
| Summary/Spending/Shares/Payments 连续页面 | 当前独立 readiness、transfer、statement、prototype | Missing | `app/(tabs)/expenses/settlement.tsx`, `SettlementReadinessScreen` |

## D. Payment model audit

`src/data/db/migrations.ts` 迁移 13 的 `ledger_settlement_payments` 与服务端 `public.settlement_payments` 对应；`src/data/api/ledgerSettlementContracts.ts`、`src/domain/ledger/paymentLifecycle.ts` 定义状态和 `RepaymentProposition`。每笔属于一个 `settlement_transfer`，payer 报告后为 `AWAITING_CONFIRMATION`；recipient 或特定 organizer override 可确认并写唯一 `settlement_payment_discharges`，或拒绝；双方/owner 可争议。付款更正仅 owner 有理由地 supersede 未确认项。actor、authority、审计均记录，但没有独立的 receiver-owned “I received” 行。`payment_amount_minor/currency/scale`、`asserted_discharge_amount_minor`、`repayment_valuation_snapshot_id`、`paid_at`、`evidence_asset_id` 已存在；支付参考日可在 `repayment_valuation_snapshots.effective_at` 记录。服务端函数对 confirmed+awaiting 强制不超过原 obligation，故多笔部分付款可行，任意超额/预付不可行。`public.settlement_payment_discharges` 属于系统确认真相，与产品规则冲突。`ledger_payment_records`/`public.payment_records` 是 Expense 的银行卡授权/实际付款成本证据，不能当作人际还款记录迁移。

本地 `recordPayment` 同事务写 Payment 与 `sync_operations`，`ledgerSettlementPaymentSyncWorker` 依 operation ID 调相应 Backend 路由并回填 canonical aggregate；confirm/reject/dispute 另排队。共享 transfer revision、单条 Payment 状态和 server 过额约束与双方独立记账不兼容。当前 SQLite/服务端列可保存不同币种和证据 ID，但需要新增个人方向/拥有者语义、对方可读授权及不改变核心 balance 的记录投影；具体新表还是兼容扩展留给实施设计。旧确认/出账历史不能当成双方分别自报的数。

## E. Finalize / locking / correction audit

入口 `SettlementReadinessScreen.confirmFinalize` → `useStage7Settlement.finalize` → `ledgerSettlementCoordinator.finalizeSettlement` → Backend `POST /v2/trips/:id/settlements` → `ledger_finalize_settlement_7_1`。Local 检查待同步财务操作和 `canFinalize`；Backend/SQL 均限 owner，校验 source 与 digest，事务内写 root、inputs、balances、transfers、`FINALIZED` audit。不是单笔 Expense final。本地 `isExpenseFinalized` 据 `ledger_settlement_inputs` 提供 UI 锁；费用 create、valuation 等 RPC 各有 final 守卫。**但不能确认 Expense update/delete/restore 在当前 SQL 被保护：**早期 `20260912000200_ledger_2_stage_4b_mutations.sql` 的 `ledger_mutate_expense_4b` 有 `FINALIZED_SETTLEMENT_PROTECTED` 检查，后续 `20260913000100_ledger_2_stage_7_2b_adjustments.sql` 重定义同名函数时没有此检查；`20260913000600_ledger_2_settlement_participation.sql` 与 `20260917000200_ledger_economic_date.sql` 的后继包装函数仅转发，也没有补上。`backend/src/supabaseGateway.ts` 只翻译可能的异常，未自行阻断。静态迁移链表明服务端经该 RPC 改动已 final Expense 可能被接受；真实 Dev 行为 **NOT VERIFIED**。这是现行历史完整性风险，应在实施前单独验证/修复，而非当成 Settlement 2.0 正常更正入口。

现行 `/settlements/:id/reopen` 明确返回 `SETTLEMENT_REOPEN_NOT_ALLOWED`（`backend/src/app.ts`）；无 owner “Make corrections” 操作。`ledger_finalize_adjustment_7_2b` 能在 root 后为新录/可变源创建不可变差量版本，保留原 root 与支付行；但没有授权的、受控的原 final 输入更正流程。`SettlementAdjustmentScreen` 只提供 “Settlement update”。已记录 Payment 关联旧 transfer，历史保留；更正后如何在新的关系/金额下展示和关联个人付款记录尚未实现。UI 对已 final Expense 整条锁定，非财务描述也无法经正常界面改；服务端 mutation 缺口则与 UI 保护不一致。历史审计表存在，受保护更正的完整流程缺失。

## F. Review / member review audit

`reviewExpensesV2` 产生重复、金额/汇率异常、证据及参与者规则的系统观察；`public.ledger_review_findings` 有 `expense_id` 或 `settlement_id`，无 share/payment 目标列。`reconcile_ledger_review_v2` 管理 active/superseded/resolved 生命周期；`ledger_review_decisions` 是 `(finding_id,user_id)` 个人 acknowledge/dismiss，`ledger_review_finding_actions` 为 append-only 历史，visibility/eligible 表限制读取。Mobile `LedgerReviewScreen`/`LedgerReviewFindingScreen`、`ledgerReviewRepository` 和 durable action worker 可离线呈现/操作。依据 `supabase/migrations/20260916000100_review_v2_engine_foundation.sql`, `20260917000100_review_v2_personal_decisions.sql`, `src/domain/ledger/reviewV2.ts`。

经核对现有路由 `backend/src/app.ts` 和 Review repository，只发现 refresh、读取与对现有 Finding 的 action；**未找到 human mark 创建函数、API、SQLite operation 或 UI**。所以 “Something looks wrong” 应复用 Finding/visibility/action 基座，但不能声称现有 human mark 已可直接调用；具体创建权、关联 share/payment、creator/owner actionable 投影都要补。个人 Finding 决定也不是“我已看过当前结算报表”时间戳；无 settlement review checkpoint、金融变化 diff/受影响成员精准通知。`expense_audit_events.changed_groups` 与 settlement snapshots 提供变化证据，但当前无按个人 payer/share delta 生成摘要的实现。当前 final 不要求全员 approve；Review Finding 并未作为 `buildSettlementPreview` blocker 输入，只有 open financial conflict/缺估值阻断。

Expense 权限：`backend/src/supabaseGateway.ts` 的 `capabilities` 把普通 linked member 的创建/自有编辑、owner 的任意纠正分开；最终授权在 `ledger_mutate_expense_4b`，当前创作者或 owner 可更新付款人、金额、参与者、split，并可删除/恢复，owner 改他人记录需理由（`20260913000100_ledger_2_stage_7_2b_adjustments.sql`）。普通参与者不能直接改他人的 Expense；可通过既有 correction request 机制提出修正（`ledger_propose_correction_4c`），但这不是 Review Finding，亦未串起 “Something looks wrong” 到 creator/owner 的行动通知。服务端结算后 mutation 保护缺口见 E；无按受影响成员精确通知的实施。Review v2 `ACKNOWLEDGED/DISMISSED` 为个人决定，不等同 owner 解决源数据的权限。

## G. FX / multi-currency audit

Journey `ledger_settings.settlement_currency/scale`、Expense 原币、active `settlement_valuation_snapshots` 分离；`REFERENCE_RATE` 接受的快照供权威计算，`ACTUAL_PAYER_COST`/`MANUAL_AGREED` 有来源证据。`ledger_rate_quotes` 同时存在于 Supabase 与 SQLite，后者 `ledgerExpenseRepository.listRateQuotes` 按 Journey/币种对读取并按观察时间排序；B2 增 `economic_date/reference_date/policy_version/source_reference`。Backend `acquirePendingRateQuotes` 使用历史 ECB/Frankfurter 候选，`backend/src/server.ts` 每 30 秒扫描；Settlement preflight 可主动 claim/retry，未发布仍阻止权威 final。`loadEstimatedSettlement` 仅将可信近日报价作为本地约值。

Payment 旧模型有付款币种、实际金额、声称结算币等值和可记录来源/时间的 `repayment_valuation_snapshots`，但 UI `PaymentSheet` 不查 `ledger_rate_quotes`，默认手动输入 rate/等值/reason，跨币缺 rate 无法保存。缓存结构足以支持同日→近期→历史→无参考的**显示查询**，但当前无此排序/过期策略的 Payment 实现；离线可手填则还需放松当前跨币必须有 valuation 的约束。绝不能把费用权威估值规则直接挪到可选个人 Payment 参考。`src/data/repositories/ledgerRateQuoteCache.test.ts`、`supabase/tests/ledger_b2_rate_demands.test.sql` 验证已有缓存/需求部分；支付侧四级选择未被测试。

## H. Offline / sync implications

已有 SQLite 本地缓存、Journey/用户隔离（`ledger_actor_context`）、持久队列、重试与幂等、增量 pull；`useStage7Settlement` 先读本地 final 与估算、网络失败保持缓存。Payment record 和 Review decision 的本地事务/队列模式可复用。个人付款需按 owner 身份入队和投影，不能继续按共享 transfer revision 独占同一付款；对方读取必须经 Backend 授权为该 transfer 两端，不应开放整 Journey 私人记录。凭证应沿用现有 receipt/asset 生命周期，记录同步与附件上传失败可独立恢复；现有 `evidence_asset_id` 仅列级支持，Payment UI 未接上传。人类 Finding 与 Looks good checkpoint 可本地先存/排队，但服务端必须校验成员、对象关系及并发版本。root final、解锁/更正版本、受影响成员权威 diff 必须由服务器事务确认；离线只展示暂定预览。现有 per-Journey cursor、actor scope 和 `sync_operations.owner_user_id` 是 A/B 隔离基础，新增投影须纳入 bootstrap/pull 并验证跨账户切换。

UI 架构：当前真实入口 `app/(tabs)/expenses/settlement.tsx` 只渲染 `SettlementReadinessScreen`；该屏有 `embedded` 与 `FlatList` 两种呈现，`TransferDetailScreen` 和 `SettlementStatementScreen` 各是独立页。`src/features/ledger-prototype/LedgerHomeScreen.tsx` 的 Spending/Settlement segmented control、Expense row 与 `SettlementScreen` 是 prototype，可借交互/组件经验，但其 fixtures/计算不能作为权威数据。四段 sticky strip、分类 accordion、Mine/Everyone、Summary Review deep-link 均无现成生产实现；RN 列表/既有 Expense detail 路由没有明显框架阻碍，需要重组数据查询与滚动容器，不需要另造财务算法。没有做像素级建议。

## I. Required future changes

- **UI-only：** 四段连续 Settlement、sticky 二级导航、Summary、分类内联 Spending/Shares、Mine/Everyone、个人报表入口与 Review deep-link；复用现有 Expense detail/row、`SettlementReadinessScreen` 的余额与 blocker 内容、`LedgerReviewScreen`，避免复制 prototype 财务数据。
- **应用逻辑：** 个人当前报表、个人付款视角与 FX 参考回退、金融变化影响成员/delta、旧 Payment 与新个人记录的展示隔离；核心 Expense 余额函数可保留。
- **SQLite：** 个人付款/收款所有权与同步状态、member review checkpoint、human Finding 关联/待同步投影；现有 final/history 表保留。
- **Supabase schema：** 自有付款记录及 counterparty 可读边界、可选证据关联、个人 review checkpoint、human Finding 的 share/payment 指向与 eligibility、受控 correction/version 元数据；旧 immutable 支付/结算历史不得重写。
- **API/Backend：** 本人创建/改正付款和收到记录、双方读取、Review raise、个人报表/变更摘要、owner Make corrections 与更新 final；废弃强制 confirm/discharge 对新记录的业务依赖。
- **Sync：** 新操作幂等、离线冲突/重放、附件上传、增量 feed/账户隔离；final 与 correction 保持 server authority。
- **Tests：** 独立双边金额、无记录不影响 balance、预付/多笔/跨币无 rate、受影响成员 delta、可选 review、human Finding、final 后更正历史、离线重放和 A/B 隔离。

## J. Risks and migration concerns

1. 已有 `settlement_payments`/`settlement_payment_discharges` 是确认过的共享财务事实；直接重标成两方个人记录会伪造“谁声称收到”的来源。保留 legacy 语义和审计，迁移映射须显式。
2. **当前 final 保护迁移漂移：** Stage 4B 的 `ledger_mutate_expense_4b` 有锁，Stage 7.2B 重定义遗漏，后继包装未恢复；需要核实 Dev 并补正确的服务器约束。旧 `settlement_inputs`、digest/报表不可变，任何受控更正都要 owner 授权、旧版本不变、新版本输入和清晰关联。
3. adjustment 的 `buildOutstandingBalanceVector` 把确认 discharge 用于尚欠向量，与新产品的 payment 非权威规则冲突；需分别定义历史 legacy outstanding 和新的权威建议转账。不可静默改写既有已付历史。
4. 当前仅付款人在 final transfer 上可报、同一 obligation 有上限；预付、超额、receiver 记录及双方差额可能不对应任何旧 transfer。同步标识/关联不能依赖旧 transfer revision。
5. human Finding 与个人 checkpoint 要有精细的 Journey/对象授权。旧 Review `expense_id|settlement_id` 无 share/payment 标识，不能用仅文本理由代替可信关联。
6. FX 当前“费用权威同日估值”和“支付屏参考报价”用途不同；Payment 参考可过期或缺失，仍需允许输入，不能污染权威 Expense 估值。
7. 源码与迁移已核对，但 Hosted Dev 实际迁移、触发器/RLS、现存付款数量及附件可用性 **NOT VERIFIED**；实施前做只读环境核对。当前产品规范文件未跟踪，审计以工作区现有 v0.3 为准。

## K. Recommended implementation slices

1. 固定结算核心与 legacy Payment 语义边界，补双方个人记录 schema/API/本地同步及历史兼容读取。
2. 接个人 Payment UI、可选证据和即时本地 FX 参考；验证离线/跨币/预付。
3. 在现有 Review 中增加 human Finding、对象关联及个人报表 checkpoint，随后做受影响成员 delta。
4. 建 owner “Make corrections” 与版本 final，保留原输入/付款/审计，验证旧新版本及同步。
5. 组装四段 Settlement 页面，做 Journey 双账户、真机和 Dev 端到端验收。

审计证据：`src/domain/ledger/settlementStage7.test.ts`, `paymentLifecycle.test.ts`, `src/data/repositories/ledgerSettlementRepository.test.ts`, `src/data/sync/ledgerSettlementPaymentSyncWorker.test.ts`, `supabase/tests/ledger7_1_settlements.test.sql`, `ledger7_2a_payments.test.sql`, `ledger7_2b_adjustments.test.sql`, `review_v2_engine.test.sql`, `review_v2_personal.test.sql`。这些测试覆盖当前行为，不等于 Settlement 2.0 新规则已经测试。
