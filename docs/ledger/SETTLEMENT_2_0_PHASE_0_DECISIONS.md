# Settlement 2.0 Phase 0 — Hosted Dev 核验与架构建议

日期：2026-09-18。产品依据：`SETTLEMENT_2_0_PRODUCT_UX_SPEC_v0.3.md`；代码审计依据：`SETTLEMENT_2_0_TECHNICAL_AUDIT.md`。本文件只作部署端只读核验与实施前决策建议，不是实施计划，也未改动数据、API、schema、应用或测试。

## Executive summary

**FINAL PROTECTION MISSING（Phase 0 修复前结论）。** 已连接仓库所链接的 Hosted Dev `tuqigdxrvrerfewsxqgm`，核对了远端迁移列表及实际部署的 `public` schema。当时 `ledger_mutate_expense_4b` 调用链没有“Expense 已纳入 final input”检查；Expense trigger、约束与 RLS 也没有替它执行该检查。直接费用估值 RPC 有独立的 final 保护，但不能覆盖普通 update/delete/restore。没有对真实 Expense 做试写；这是部署端定义的结论，不是一次事务性行为探针。下文记录了 2026-09-18 的 Phase 0.5 修复及 Hosted Dev 验证。

个人付款建议选 **Option B：新建 Settlement 2.0 个人记录模型**，保留 `settlement_payments` / `settlement_payment_discharges` 的旧确认语义与不可变历史。权威结算、个人记录、个人方便查看的进度必须为三套明确分开的值。Phase 0 确认的服务端保护缺口已通过独立的 Phase 0.5 修复与核验清除。

## Hosted Dev final protection verification

### 核验方法与范围

- 链接目标 `supabase/.temp/project-ref` 与预期 Hosted Dev ref 一致。`supabase migration list --linked` 通过只读连接返回本地/远端逐项相同，最新均为 `20260918000600`；包括 `20260913000100`、`20260913000600`、`20260917000200`、`20260918000100` 与 `20260918000200`。
- `supabase db dump --linked --schema public` 只导出部署端 schema 到 `/private/tmp/otr-settlement-phase0-hosted-dev-schema.sql`，未导出数据。该快照 SHA-256 为 `24a10f5bd02f72f26f9505a019a458fde5fef3f75670a62e600aa01116903f8d`。**校验时以本文件中的部署端符号与下面的证据为准；临时转储不入库。**
- 实际函数：`ledger_mutate_expense_4b` → `ledger_mutate_expense_4b_without_economic_date` → `ledger_mutate_expense_4b_pre_settlement_participation`。前两者只设置本事务的 economic date / settlement participation 上下文并转发；底层验证 actor 是原 creator 或 owner、理由和 base revision，随后更新 `public.expenses`、participants、splits、active valuation 与 audit/idempotency。三层均无对 `public.settlement_inputs`/final 状态的查询或 `FINALIZED_SETTLEMENT_PROTECTED` 抛错。
- 部署端 `expenses_adjustment_lineage_lock_7_2b` → `ledger_lock_adjustment_lineage_7_2b` 在有 root 时只取得 advisory lock，随后返回行；它是串行化，不是禁止变更。其他 `expenses_*` trigger 处理 change feed、货币序列化、economic date、participation、`RATE_REQUIRED`/Expense 一致性、修正请求变 stale 与 revision。`ledger_validate_expense` 只检查成员、分摊和 active valuation 一致性，不比较 final `settlement_inputs.expense_revision`。`settlement_inputs` 自身不可变，但没有与当前 Expense revision 的强制等值约束。
- `public.expenses` 启用并强制 RLS，只向 `service_role` 授予该业务表权限；未见允许 authenticated 直接改此表的 policy。此边界阻止客户端绕过 Backend，却不阻止 Backend 以 service role 调用上述无 final 守卫 RPC。`backend/src/supabaseGateway.ts` 的 `mutateLedgerExpenseAggregate` 仅将可能的 `FINALIZED_SETTLEMENT_PROTECTED` 异常映射成 409，没有调用前的独立锁。
- 对照：部署端 `ledger_apply_valuation_5_1`（来自 `20260918000100/00200`）确实查询 active final `settlement_inputs` 并抛 `FINALIZED_SETTLEMENT_PROTECTED`，已完成命令仍可幂等重放。它不能保护 `ledger_mutate_expense_4b` 的 update/delete/restore 路径。

**判定：`FINAL PROTECTION MISSING`，范围是经 Backend Expense mutation RPC 修改已经纳入 final 的源 Expense。** 静态部署定义已足以发现该控制缺口，故没有对真实财务记录做破坏性试验。尚未验证某条具体 Dev 请求是否会因其他业务校验偶然失败；这种偶然失败不能作为 final 保护。Stage 4B 原始守卫见 `supabase/migrations/20260912000200_ledger_2_stage_4b_mutations.sql`；Stage 7.2B 覆盖与后继包装见 `20260913000100_ledger_2_stage_7_2b_adjustments.sql`、`20260913000600_ledger_2_settlement_participation.sql`、`20260917000200_ledger_economic_date.sql`。此问题应作为独立、优先的完整性修复处理；Phase 0 未修改 schema。

### Phase 0.5 修复记录（2026-09-18）

上述 `FINAL PROTECTION MISSING` 是修复前的核验结论。迁移 `20260918000700_ledger_finalized_expense_mutation_guard.sql` 已仅部署至 Hosted Dev `tuqigdxrvrerfewsxqgm`：`public.expenses` 的 `BEFORE UPDATE OR DELETE` 触发器统一调用 `public.ledger_guard_finalized_expense_mutation()`，当 Expense 已在状态为 `FINALIZED`、`PARTIALLY_PAID` 或 `SETTLED` 的 settlement input 中时抛出 `FINALIZED_SETTLEMENT_PROTECTED`。未新增 Settlement 2.0 Payment、Review、UI 或更正流程；Production 未触及。

本地重置并应用迁移后，5 个相关 Ledger pgTAP 文件、99 项断言通过，包括 finalized update/delete/restore、split/participant 更改、owner correction 拒绝，未 finalized update、valuation final 保护及已完成操作的幂等重放。Hosted Dev schema 导出确认守卫函数及 `expenses_finalized_input_guard` 触发器真实存在；在 Hosted Dev 执行同一 Expense mutation 测试的事务回滚副本，20 项断言通过，涵盖保护与未 finalized 正常变更。副本仅提前设置 `service_role` 以访问远端 `extensions.plan()`；测试数据随 `ROLLBACK` 撤销。**Phase 0.5 final Expense mutation 保护阻断已清除。**

## Personal Payment architecture options

| 评估项 | Option A：扩展 `settlement_payments` | Option B：新个人记录，旧表保留 | Option C：仅用客户端 SQLite/文档存储 |
| --- | --- | --- | --- |
| 审计与旧历史 | 同表混合“确认付款”与“个人声称”，旧 discharge/status 难解释 | 旧确认/出账/审计原样可读；新语义可明确定义 | 本地历史难被对方可信看到或跨设备恢复 |
| 迁移、兼容 | 列/约束/RPC/触发器大量条件分支，旧客户端可能把新行当确认状态 | 加表与读写端点、显式 legacy 只读投影；迁移清晰 | schema 少，但违背跨设备和 counterparty 可见需求 |
| SQLite / 离线 | 同一本地表需两种互斥生命周期与队列语义 | 新 `ledger_personal_payment_records` + 现有 owner 队列模式；旧缓存继续独立 | 本地可写但无可靠跨设备同步 |
| Supabase / API | 旧 `transfer_id NOT NULL`、过额约束、recipient confirmation、discharge 逻辑均须拆除或按类型绕过 | Journey+两端成员+所有者独立持久化；新 `/ledger/personal-payments` API | 需另造同步/共享渠道，最终仍等同 B |
| 安全与可见 | 旧 `reported_by` 不能表示双方分别拥有的记录；共享 revision 冲突 | owner 仅改本人记录；两端与 organizer 按授权读；Backend service role 校验 | 客户端无法可靠证明对方可读授权 |
| 附件/币种 | 旧 `evidence_asset_id`、付款币种可复用字段，但跨币强制 discharge/rate | 金额与币种独立，参考和用户记录等值均可选；附件绑定 owner 的记录 | 附件跨设备/授权生命周期仍需服务器 |
| 幂等/同步 | 旧 transfer revision 和过额检查阻碍预付/双方独立值 | 每条个人 record 自己的 revision/idempotency；按 Journey/账户 pull | 无标准对方可见 feed |

Option C 只有在产品明确取消对方可见与跨设备同步时才成立；现产品规则不允许。**推荐 Option B。** 它的新增 schema/API 工作比 A 明显，但可直接保住旧历史和新语义，不把条件分支散入旧付款状态机。

## Recommended Payment architecture

推荐最小持久模型 `personal_settlement_payment_records`，移动端镜像 `ledger_personal_payment_records`：

| 字段组 | 建议字段与规则 |
| --- | --- |
| 身份/范围 | `id`（客户端稳定 UUID）、`journey_id`、`owner_user_id`、`owner_member_id`、`counterparty_member_id`、`direction`=`PAID`/`RECEIVED`；owner 必须是 Journey linked member，counterparty 是同 Journey 不同成员。`PAID` 表示 owner→counterparty，`RECEIVED` 表示 counterparty→owner。无需 final `transfer_id`，从而支持预付和后续建议关系改变。 |
| 事实声称 | `amount_minor > 0`、`currency`、`scale`、`occurred_at`、可选 `notes`；这是 owner 所声称的实际支付/到账金额，绝非 Backend 对真实银行到账的认证。不得由另一方记录自动覆盖。 |
| 可选换算 | `recorded_equivalent_minor/currency/scale`（用户记录的 Journey 等值，可空）；另存可空的 `reference_rate_decimal`、`reference_rate_date`、`reference_source`（创建/编辑时实际显示给用户的参考）。当无报价时允许原币记录；引用的历史报价不自动改写已存记录。Journey 结算币改变时保留旧等值币种，进度在不匹配时不跨币硬加。 |
| 生命周期 | `revision`、`created_at`、`updated_at`、`deleted_at`（软删）、`created_by/updated_by` 或不可变 owner；本人编辑/删除有 base revision，旧内容通过审计事件或版本历史保留。SQLite 有 `sync_status`、server ID/修订版及本地时间。 |
| 可选证据 | 记录至附件的 link 表，引用现有受保护 asset/upload 体系；每条附件也验 owner/Journey。不要把文件二进制或短期签名 URL 存在 Payment 行。首版若只允许一份证据，可退化为可空 `evidence_asset_id`，但应由同一权限检查保护。 |

新 API 建议：`POST /v2/trips/:journeyId/ledger/personal-payments`、`PATCH/DELETE /.../:recordId`、`GET /...` 按当前 actor/授权关系返回，且进入 Ledger bootstrap/增量 pull。请求带 local ID、operation id/幂等键、base revision（更新）；响应带 canonical record。不要在旧 `/transfers/:id/payments`/`/transfer-payments/:id/confirm` 上实现新语义。后端检查账号与 owner member、counterparty 属同 Journey；owner 不得由客户端自报冒充，方向与两端匹配。新记录不调用 `ledger_refresh_transfer_7_2a`，不写 `settlement_payment_discharges`，不写 settlement balance/transfer status，不自动创建 Review Finding。上述是架构建议，非已获批准的最终字段/API 合同。

## Canonical settlement vs personal payment vs convenience progress

| 概念 | 所有者/来源 | 权威性与变更 | 离线行为 |
| --- | --- | --- | --- |
| **A. Canonical settlement amount** | Expense 原金额/付款人、accepted valuation、shares 经 `buildSettlementPreview` 得 `paidMinor/owedMinor/netMinor` 与建议 transfers；final 时 `settlements`/`settlement_inputs`/`settlement_member_balances` 固化 | 对费用结算计算有权威性；只有经服务器确认的 final/后续版本可成为稳定历史。个人 Payment 的增删改不得重算此值 | SQLite 可显示明确标记的暂定当前预览/既有 final；离线 Expense 更改可更新本地暂定值，不能自行宣布新 final |
| **B. Personal payment record** | `personal_settlement_payment_records` 每行由 owner 声称 `PAID` 或 `RECEIVED`；对方另行输入不会合并 | 仅对“这个用户记录了什么”有权威性，不证明银行事实或另一方同意。可独立编辑/软删并保留历史；服务器只认证作者/关系/合法格式 | owner 通过 repository 本地写入并排队；对方只能看到上次授权同步的投影；重连后服务器确认与同步 |
| **C. Convenience progress / remaining** | 只用当前用户本人记录、当前对应方向的 canonical 金额和可比的本人 recorded equivalent 计算 | 信息性近似数字，标为“根据你的记录”；不存为结算事实，也不用于 final、转账建议或另一方进度。无可靠同币等值时不显示单一剩余额。负数/超额也只作提示，不产生争议 | 可从本地已保存/待同步的本人记录即时重算并标明待同步；服务端不必存该派生值 |

同一付款人记录 NZ$300、收款人记录 NZ$295 时，A 仍为原结算数；B 分别保留两个独立声称；C 对各自仅据自己的记录呈现。系统不得产生 `confirmed_paid` 聚合字段、自动差额 Finding 或默认提示对方确认。付款参考汇率只是用户方便录入的依据，不能作为权威 Expense 估值输入。

## Legacy payment migration/compatibility strategy

`public.settlement_payments`、`settlement_payment_discharges`、`repayment_valuation_snapshots`、`settlement_audit_events` 和本地 `ledger_settlement_*` 原样保留，继续按“旧版已确认转账历史”只读展示。`CONFIRMED`/discharge 代表过去旧流程的共识记录；不能拆成伪造的 payer-owned 与 receiver-owned 两行，也不能计入新个人记录总额。旧 transfer 的原 obligation、历史已确认出账和当时状态应可在历史详情查看，明确标“旧版确认记录”；新当前结算与新个人进度不引用旧 discharge。旧付款存在的 Journey 如需将其计入个人方便查看的进度，必须由用户自选并明确去重/来源标记；默认不迁入。老客户端仍只理解旧 API，需按当前 Backend 版本门槛阻止其把新记录误读为旧状态；保留旧只读历史和导出可追溯性。部署迁移应只加新对象/投影，不改写旧付款金额、owner、status 或已 final 输入。

## Security and ownership model

Mobile UI 只经 repository/Backend；Supabase 业务表继续强制 RLS、不给 authenticated 直接写权限。Backend 使用认证用户解析 `owner_user_id/member_id`，拒绝由请求体指定别人为 owner；同 Journey member、方向与 counterparty 一致性在服务器检查。写入/更正/软删只限 owner，所有操作记录 actor、幂等键与 revision；organizer 可看组内记录但不能冒充另一人的 “I paid/I received”。读取可给 owner、相应 counterparty、Journey organizer；附件访问沿同一记录和 Journey 权限，签名 URL 短期签发。离线可先写本人的记录，但同步权限丧失时保持本地未提交/冲突状态，不能以另一账号 token 代发。成员关系被移除后的历史可见性和留存期限属于待批准策略。

## Offline/sync implications

沿用 `sync_operations.owner_user_id`、本地事务、幂等键、重试/auth pause、Journey-scoped cursor 与 account isolation。新记录以 client UUID 建立，记录及 upload 操作各有稳定身份；附件可在记录创建前后独立排队，失败不丢文本金额。双方的两行互不争锁，冲突只发生在同 owner 的同一行 revision；服务端拒绝时保留本地待修复状态而不假装已同步。bootstrap/pull 只投影授权可见行与 tombstone，并在 A/B Journey、账号切换时清除旧用户的私有视图。权威 final、版本更正及成员授权由服务器决定；离线个人支付录入不应等待 30 秒 FX worker 或网络报价。

## Open questions

1. Final Expense mutation 守卫已在 Phase 0.5 单独修复并于 Hosted Dev 验证；后续更正/版本流程仍须单独设计与授权。
2. 个人 Payment 附件首版允许一份还是多份？产品允许可选证据，推荐链接表以支持多份；若首版限制一份须在 UX 明示。
3. Journey 成员退出/被移除后，自己和对方对历史个人记录及附件的读取/导出保留多久？实施前需定授权/留存规则。
4. 用户是否可以录入一个没有当前建议转账关系的 Journey 成员付款？为支持 advance，建议可以；UI 仍可从当前建议关系快捷带入 counterparty。

## Preconditions for implementation planning

- Phase 0.5 已完成 Hosted Dev final mutation 保护修复与验收；未来显式更正/版本流程需保留该保护边界。
- Owner 确认 Option B 的新旧付款语义、个人记录可读者和旧历史默认不计入新进度；之后才冻结 schema/API/SQLite 迁移设计。
- 确认附件数量与成员离开后的授权/留存策略；如决定延后，也需在实施计划中明确首版边界。
- 以 `SETTLEMENT_2_0_PRODUCT_UX_SPEC_v0.3.md` 逐条列测试，特别是余额不受付款影响、双方不同值、预付、离线、跨币无参考、旧历史隔离及 final 后更正；本阶段未写该实施计划。
