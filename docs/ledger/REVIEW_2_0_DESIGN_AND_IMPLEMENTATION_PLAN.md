# Ledger Review 2.0：现状审计、设计与实施计划

日期：2026-09-16。范围：当前仓库静态、只读审计；本文不是实施授权，不修改数据库、运行时或 Hosted Dev/Production。规则真相以所列代码为准。Review 指面向用户的财务注意事项收件箱；确定性财务校验仍是不可绕过的校验，不因改名而变成可确认的提醒。

实施进展（同日）：Phase 1 引擎基础已按单独的 `REVIEW_2_0_PHASE_1_ENGINE_FOUNDATION.md` 在源代码中实现；本文第 2–8 节仍是实施前 v1 基线，不将它误写成当前 v2 行为。新迁移尚未在 PostgreSQL 验证/部署，后续逐用户与授权阶段未实施。

## 1. Executive Summary

- 现有 **5 条启发式规则**，统一 `ledger-review-v1`，另有 `ledger-validation-v1` 的 **13 种确定性校验代码**；后者不允许 Acknowledge/Dismiss。规则见第 3 节。
- Finding 的 `status` 是全局共享的 `OPEN/ACKNOWLEDGED/DISMISSED/RESOLVED/STALE`。行动历史记录 actor，但不是个人当前状态；一个人行动会改变所有人的共享状态。可见范围是整个有读权的 Journey，不是目标的 Owner/Creator/Payer/非零 Split 人群。
- Expense 修改仅更新 Expense；不会即时评估 Review。进入 Review 时线上 `POST .../ledger/review/refresh` 才重算，把不再匹配的旧 Finding 标为 `STALE`，为新 revision 插入 Finding；离线不能重算。列表在返回时既不订阅 SQLite，也不按焦点重载，且混列所有状态、把 `ACKNOWLEDGED` 也计作待办。
- **先建授权的个人投影和生命周期/身份协议，再改 UI**。现有表可以增量迁移并保留历史；不能仅重解释旧全局状态为任何人的个人决策。旧历史归属按 actor 精确迁移，其余人不得继承其决定。

## 2. Current Review Architecture

`src/domain/ledger/review.ts` 纯函数 → `backend/src/supabaseGateway.ts:refreshLedgerReview` 读取 Journey 全量 Expense 聚合、运行启发式及 `validateExpenseAggregate` → service-role 写 `ledger_review_findings` → read/refresh/bootstrap/change feed 经 Backend 返回 → Mobile `ledgerReadRepository`/`ledgerReviewRepository` 落 SQLite → `useLedgerReview` 读本地列表。操作：详情 hook → 本地 action + 全局 status + durable `LEDGER_REVIEW_ACTION` 一事务 → worker → Backend action route → service-role RPC → action history + 全局 status → Mobile 回写。普通 Expense push/pull 不调用规则引擎。依据：`backend/src/app.ts:495-525,1028-1031`、`backend/src/supabaseGateway.ts:350-442,3091,3170-3340`、`src/data/sync/ledgerReviewCoordinator.ts`、`src/data/repositories/ledgerReadRepository.ts:35-120`。

## 3. Current Review Rules

共同前提：启发式仅取 `status === 'ACCEPTED'` 的 Expense；`settlementParticipation=EXCLUDED` 不排除；每一条均保存 `expenseId`、当前 `entityRevision`、`ledger-review-v1`、固定 severity/confidence、规则字符串及 `CONTEXT_FINGERPRINT:<8位FNV-1a>`。上下文哈希来自排序后的**所有 ACCEPTED Expense 的 `id:revision`**，不是规则专属输入；没有数值证据、对比对象 ID 或快照。规则均在显式线上 refresh 时运行，不在 Expense create/edit/pull 时运行。下表的“现有证据”均另附该上下文码。依据：`src/domain/ledger/review.ts:3-100`。

| ID / 类别                            | 算法、阈值、比较总体和输入/排除                                                                                                                                                         | 现有证据；身份材料                                                                   | 性质、误报、目前展示                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `POSSIBLE_DUPLICATE` / Duplicate     | 任一同 Journey ACCEPTED、`other.id < expense.id`、payer ID、原始 minor、currency 相同且 `title.trim().toLowerCase()` 相同的另一笔；**不比较日期、participants**。较小 ID 不报此规则。   | `SAME_PAYER_AMOUNT_CURRENCY_TITLE`；通用身份加此码，未存另一笔 ID。                  | 确定性匹配、启发式结论；同名同额合法交易误报。UI “Possible duplicate Expense” + 泛化说明。WARNING/.9。                               |
| `AMOUNT_OUTLIER` / Amount            | ACCEPTED 笔数 `>=5`；把**各货币原始 minor 混合**升序，取 `amounts[Math.floor(n/2)]`（偶数取上中位）；median `>0` 且当前 minor `>= median * 10`。不分币种、scale、分类；不使用结算估值。 | `TEN_TIMES_JOURNEY_MEDIAN`；通用身份加此码，未存中位数/样本量。                      | 数值确定，判断是启发式；跨币种/量纲、极端总体误报。UI “Unusually large amount” + 泛化说明。WARNING/.75。                             |
| `RATE_OUTLIER` / Exchange rate       | `valuation.decimalRate` 真值时 `Number(decimalRate)`；否则有 valuation 且原始 minor `>0` 时 `settlement.minor / original.minor`；无率不报。`!Number.isFinite(rate)                      |                                                                                      | rate <= 0                                                                                                                            |     | rate > 1000`，**不是市场参考价偏差**；不校验日期/货币对的正常范围。 | `RATE_OUTSIDE_V1_BOUNDS`；通用身份加此码，未存率/来源/币种对。 | 数值确定、异常解释启发式；小货币单位/比例和错误快照误报漏报。UI “Exchange rate looks unusual” + 泛化说明。WARNING/.95。 |
| `EVIDENCE_MISMATCH` / Evidence       | 取**第一条** `paymentRecords.find(record => record.posted)?.posted`；posted currency 和 scale 与 original 相同且 minor 不等；无 posted、异币种/scale 不报。**不是收据 OCR 比对**。      | `POSTED_AMOUNT_DIFFERS_FROM_MERCHANT_AMOUNT`；通用身份加此码，未存记录 ID/两个金额。 | 精确不等、业务解释启发式；手续费/部分扣款/多笔 posted 误报漏报。UI “Receipt and Expense differ” 实为 payment evidence。WARNING/.95。 |
| `PARTICIPANT_ANOMALY` / Participants | `!participants.some(memberId === payerMemberId)`；不看 split 金额、household、权重。                                                                                                    | `PAYER_NOT_PARTICIPATING`；通用身份加此码，未存成员快照。                            | 条件确定、问题判断启发式；代付本来合法。UI “Payer is not included” + 泛化说明。INFO/.7。                                             |

额外的确定性层：`validateExpenseAggregate` 在每次 refresh 对读出的聚合（不限 ACCEPTED）检查 `INVALID_SETTLEMENT_PARTICIPATION`、`INVALID_ORIGINAL_MONEY`、`AMOUNT_NOT_POSITIVE`、`INVALID_PAYER`、`INVALID_PARTICIPANTS`、`PARTICIPANT_OUTSIDE_JOURNEY`、`SPLIT_PARTICIPANT_MISMATCH`、`ORIGINAL_SPLIT_MISMATCH`、`VALUATION_CURRENCY_MISMATCH`、`VALUATION_ORIGINAL_MISMATCH`、`SETTLEMENT_SPLIT_MISMATCH`、`VALUATION_REQUIRED`、`RATE_REQUIRED_HAS_VALUATION`：**实际是 13 种**，以此清单为准。各自条件/字段在 `src/domain/ledger/validation.ts:25-104`；无数值阈值、比较总体或置信度，证据仅 `[issue.code, FIELD:<field>]`，`BLOCKING`，`ledger-validation-v1`，不可做个人处理。当前 UI 走未知规则 ID 的通用标题/文案，动作按钮不显示；不应纳入 Review 2.0 的五种可处理类别/待办计数，应保留独立校验/修复入口。以上 13 种不是 13 条启发式 Review 规则。

## 4. Current Finding Data Model

服务端 `ledger_review_findings`：UUID、Journey、可空 Expense/Settlement（二者至少其一）、layer、type、severity、confidence、`evidence_codes text[]`、**全局 status**、ruleset、entity revision、可空 `acted_by/action_reason`、独立 `revision`、时间。后两 action 字段目前 RPC 不写。revision 由 `ledger_touch_revision` 更新触发器递增。无 rule ID 独立版本、依赖字段快照、结构化 observation、解决原因/时间、明确 eligibility。SQLite v16 镜像删除了 `acted_by/action_reason`，仅 `evidence_codes_json`。依据：`supabase/migrations/20260911000100_ledger_2_domain.sql:337-359,443`、`src/data/db/migrations.ts:750-795`、`src/data/api/ledgerReviewContracts.ts`。

身份：Backend `stableReviewId(SHA256(...))` 生成稳定 UUID 形状，输入精确为 `journey:layer:expenseId:entityRevision:rulesetVersion:findingType:evidenceCodes.join(',')`；`evidenceCodes` 包含以上全 Journey revision 上下文 FNV 码。`upsert(...,{onConflict:'id',ignoreDuplicates:true})` 防止同一快照重复插入，但**任一已接受 Expense revision 改动可让全 Journey 的五种规则身份变动**。每次 refresh 取 status `!=STALE` 的行，与新观测 key 比较，旧行设 `STALE`，再插入/忽略新 ID。已 ACK/DISMISS 的同 ID 保持共享状态；旧 ID 若曾标 `STALE` 且后来条件复现，`ignoreDuplicates` 不会重新激活它——这是身份/生命周期缺陷。旧状态 `RESOLVED` 被当作待失效比较，但当前 refresh 只写 `STALE`，未写 `RESOLVED`。依据：`backend/src/supabaseGateway.ts:162-170,382-441`。

## 5. Current Action / Decision Model

服务端 action 表 append-only，`unique(actor_user_id,operation_id)`，保留 actor member/role、原因、Finding/Expense revision、ruleset、时间；trigger 禁止 update/delete。RPC 首先幂等回放，锁 Finding，要求 HEURISTIC、相同 Finding revision、status 为 OPEN/ACKNOWLEDGED/DISMISSED、1–2000 字原因，再插 action 并更新**全局** status；已处理 Finding 可以再次被其他授权者处理，最后一次状态胜出。无每人 current decision 表，action history 不能直接当实时投影。Mobile action `PENDING/SYNCED/FAILED`，本地先改共享 Finding.status；服务端失败时无自动回滚的个人决策语义。依据：`supabase/migrations/20260913000300_ledger_2_stage_8_review_actions.sql`、`src/data/repositories/ledgerReviewRepository.ts:55-170`。

## 6. Current Authorization Model

RLS：两张 Review 表 `ENABLE/FORCE RLS`；`anon/authenticated` 无表权、service role 可读写；RPC 只授 service role。**RLS 没有 per-Finding 用户投影策略**，实际隔离依靠 Backend，不是客户端直连。`authorizeRead`/`canReadTrip` 接受 Journey 创建者、legacy `trip_members` 或 linked `journey_members`；`readLedgerReview`/`refreshLedgerReview` 不用传入 user ID 过滤，按 Journey 返回所有 Finding **及全体 actor action history**；bootstrap 同样含全部，pull 返回 Journey 的全部 REVIEW_FINDING。Mobile `list` 只验证该用户在本地 `ledger_actor_context` 有 Journey 行；不看 owner/creator/payer/split；SQLite 同设备共享 canonical Review 行，账号切换不会产生个人状态。行动本地要求 actor context 且 owner 或当前 Expense creator；RPC 要求 linked member 且 owner 或 creator；payer/非零 split 若非 creator/owner 只能看到，不能行动；本地缺 Expense 时也拒绝非 owner。旧 trip member 可通过读端点，未 linked member 在 RPC 被拒绝。Organizer(owner) 可以对该 Journey 任何 Expense 行动；Settlement 行仅 owner。依据：`backend/src/app.ts:495-525,1028-1031`、`backend/src/supabaseGateway.ts:210-225,268-345,350-353,3091`、上述 RPC、`src/data/repositories/ledgerReviewRepository.ts:27-103`。当前一个成员的决定确实影响其他成员的共享 status/计数。

## 7. Current Expense Edit / Re-evaluation Behavior

Create、update、delete、restore 经 `createLedgerExpenseAggregate`/`mutateLedgerExpenseAggregate` 校验并落财务事实、revision/audit/change feed；update 更改 title、payer、amount/currency、participants/splits、valuation 等，支付证据、收据、汇率等有独立命令/队列。上述路径及 Mobile remote pull 不调用 `reviewExpenses` 或 `refreshLedgerReview`；收据 OCR 从未进入当前 Review 规则。Review 页面 hook 初次 mount 先本地 load、再 `refreshJourneyLedger`、review action worker、`POST refresh` 并 apply 后 load。远端其他用户 Expense 变更仅 pull Expense，不生成 Review change feed；只有以后运行显式 refresh 才发 Finding 更新。离线 Expense edit 后旧 Finding 仍可出现/处理，待线上 refresh 才可能 STALE；revision 改动及总体 context 改动即使字段无关也会换 ID；新 ID 不继承旧决定。若新观察与既有 STALE ID 完全相同，忽略冲突不会恢复。重复 sync 同 ID 不重复行，不同全局 context 可能制造额外历史行；旧行保留。依据：`backend/src/supabaseGateway.ts:355-441,601-745,1260-1365`、`src/hooks/useLedgerReview.ts:20-80`、`src/data/sync/ledgerReportingCoordinator.ts`、`src/data/repositories/ledgerReadRepository.ts`。

## 8. Current UI State and Known Problems

Review `FlatList` 直接展示所有 statuses，无 OPEN/Reviewed 分区或类型筛选；标题计数 `OPEN || ACKNOWLEDGED`，故确认后仍计待办；Dismiss 不计但仍混列。详情只显示通用 why 和关联 Expense title，没有规则实际值。`canActOnFinding` 只看 heuristic/非 STALE/RESOLVED，最终授权在 repository/RPC。`LedgerStage6Screen` 横幅也取 `OPEN || ACKNOWLEDGED` 的 Journey 列表，非个人待办，非零显示，零隐藏；独立 `summary.openConflictCount` 是冲突提示，不应混称 Review Finding 数。详情与列表各自创建 hook 实例；`act()` 只 `load()` **详情自己的 state**，不通知列表，列表重新出现不保证 remount；列表 hook 只在 `[journeyId,refresh]` effect 装载/刷新，没有 focus effect/SQLite 观察；父页投影也无动作通知。因此本地数据库虽立即更新，返回时列表和横幅可保持旧 React state；即使重载，ACK 仍被计数和展示。依据：`src/features/ledger/LedgerReview{,Finding}Screen.tsx`、`src/hooks/useLedgerReview.ts`、`src/features/ledger/LedgerStage6Screen.tsx:215-266,509-523`。

## 9. Review 2.0 Product Model

Finding 是“某个 Expense 的某次规则相关输入状态引出的观察”，**共享且证据快照不可变**。Review 行动只记录个人判断，不变更 Expense、split、付款、收款、Settlement。只有 HEURISTIC 构成可处理 inbox；确定性校验保留不可绕过的修复路径。设计待产品确认后更新 `docs/PRODUCT.md` 和 ADR，再实现。

## 10. Review 2.0 Visibility Rules

授权资格（相同规则用于服务端 fetch/action/pull/bootstrap、本地列表/详情/计数）：linked Journey owner，或该 Expense 的 creator、payer、**有效非零分摊**的 member 对应用户。以 canonical split 的 `originalMinor != 0`（必要时含合法 settlement-only allocation，待第 26 节确认）为准，而非只看 participants；成员必须真实绑定 authenticated user，拒绝未关联成员/无关 Journey 用户。多角色取并集。对历史 Finding 冻结观察时的相关 Expense/member/分摊身份作授权快照，再与当前 Journey linked 权限相交；移出 Journey 即不能继续同步该用户的私人投影。改 split 后旧 active 被 supersede，新的资格随新 observation 计算。owner 无直接财务参与仍可见。不能把全量 action history 发给任一 Journey member；action history 默认本人，owner 审计权限需单独确认且不得暴露其他人的个人决定给普通参与者。

## 11. Review 2.0 Per-user Decision Model

共享 Finding 无 ACK/DISMISS。每个 eligible `(finding_id,user_id)` 的个人状态为 `NEEDS_REVIEW`（可由无 decision 行隐含）、`ACKNOWLEDGED`、`DISMISSED`，附时间/最后 action ID；服务端 append-only action history 是依据，个人当前投影须幂等且原子更新。Mary ACK 后只有 Mary 的待办减一，Leon/Alex 不变。重复同 operation ID 返回相同响应；同用户再次改决定应有明确定义（建议允许新 action 覆盖其个人投影，保留全部历史；不改变他人），并采用每用户决策版本避免并发逆序。历史中的原因是行动审计，不要求 REVIEW 页面直接改 Expense。

## 12. Review 2.0 Finding Lifecycle

Finding-level `ACTIVE → RESOLVED_BY_EXPENSE_UPDATE | SUPERSEDED`；可保留旧 `RESOLVED/STALE` 读写兼容枚举、增加 `resolution_reason/at/superseded_by`，不把 ACK/DISMISS 当生命周期。存储 observation 行不可变；生命周期元数据单独可变（或独立 resolution 表），action 表继续 append-only。比较同规则身份：条件消失 → resolved；相关输入改变但条件仍成立 → 旧 superseded、新 ACTIVE；无关编辑且规则输入不变 → 保持同一 ACTIVE/个人决定。旧 STALE 历史只在历史页，不回到 active。将 settled/removed Expense 的 active findings 同批关闭。状态更新与新 Finding 插入必须事务原子且可幂等重试，避免暂时双 active。

## 13. Review 2.0 Expense Revision / Re-evaluation Model

每条规则显式定义依赖/输入规范化：duplicate = 同一 payer、原金额+currency+scale、标准化 title、与匹配总体的相关字段（现行不含时间/参与者）；amount = 原金额+currency+scale、**同口径比较总体及其数值**（先修跨币种问题才可宣称有意义的 median）；rate = decimal rate 或计算所需 valuation/original、币种/scale；evidence = 首条 posted 记录及原金额/币种/scale（建议确定性选择顺序）；participants = payer + participant member IDs。规则版本变化产生新观察；无关 cosmetic edit 不重开。Expense 的全局 revision 作为 provenance 保存，但**身份以规则相关输入 fingerprint 加比较总体 fingerprint 为主**，否则 cosmetic edit 仍会重开。金额/币种/分摊/支付证据/状态变化通过同一服务端聚合变化事件调度评估；跨 Expense 依赖（duplicate/median）需要重算受影响 cohort，不能只重算编辑 Expense。离线本地编辑后标注 Review 为“待重新验证”，禁止旧结果被误认为当前；服务端确认后重算并同步 resolution/新观察。服务器比较旧/新 canonical 状态，避免对被拒绝或冲突的 edit 误重算。

## 14. Review 2.0 List / Filter UX

顶部显示个人 ACTIVE+NEEDS_REVIEW 总数；`All/Amount/Duplicate/Exchange rate/Participants/Evidence` 分类筛选（五规则一一映射，未来多规则归同类别）。OPEN 仅显示待办；`Reviewed N` 默认折叠，只列本人 ACK/DISMISS 的仍 ACTIVE 项；已解决/被取代的历史另由 Ledger Review history 访问，不污染待办。分类 chip 数量均以可见 active pending 为准，Reviewed 折叠遵循分类但不影响总数。确定性校验不混入可处理分类。

## 15. Review 2.0 Finding Detail UX

每条需 immutable `observation_context`，含受影响 Expense ID、revision、title、发生日、原金额 minor/currency/scale、规则/版本、计算口径、必要的成员显示快照与具体对比数。以下均**当前未保存**，必须增量 schema/DTO；仅有 evidence code 不足以渲染。详情使用快照而不是读取已更改 Expense 的当前值冒充历史证据。

| 规则         | 解释及应存的 observed → reference / 差异；渲染字段                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate    | 当前 Expense 标题、payer、原金额/币种/时间 → 匹配 Expense ID、标题、金额/币种/时间；说明当前仅同 payer+同额+同币种+标准化标题，没有日期容差。显示两项并可打开 Expense；不捏造概率。                           |
| Amount       | 原金额 minor/currency/scale → 实际比较集合的 median minor、样本量、币种/scale/cohort 定义、阈值 10；存倍数/阈值比较（计算用整数/安全有界方式），显示 ratio 和差值；不能把当前混币种 median 伪装成同币种参考。 |
| Rate         | 存 rate 字符串/计算来源、原始和结算金额/币种/scale、下界 `>0` 上界 `<=1000`、超界方向/偏差；当前没有市场 reference，不得显示市场偏离百分比。                                                                  |
| Evidence     | 选中 posted PaymentRecord ID、posted minor/currency/scale、Expense original minor/currency/scale、差额；明确是支付证据而非 OCR 收据。                                                                         |
| Participants | payer member ID/展示名、参与 member ID/展示名列表；解释“payer 不在参与者中”，不虚构金额容差或必然错误。                                                                                                       |

## 16. Review 2.0 Badge / Pending Count Semantics

统一定义 `COUNT(DISTINCT finding.id) WHERE eligible(current_user,finding) AND finding.lifecycle=ACTIVE AND personal_state=NEEDS_REVIEW AND layer=HEURISTIC`，限定选中 Journey。`>0` 显示 Review attention/badge，`0` 完全隐藏；Ledger 导航始终可访问 Review history。所有 entry point 共用同一 repository 查询/失效信号；冲突数单列，不混入 Review badge。离线 action 在同一事务更新个人投影及队列后立刻减数；同步失败保留明确待同步提示，终态拒绝必须撤销/冲突化个人乐观决策并提示用户。

## 17. Data Model Changes Required

增量迁移，不删老 action/旧 Finding：Finding 加 rule ID/version（旧 `finding_type`/`ruleset_version` 可映射）、规则 input hash、稳定 context fingerprint、结构化只增不改 evidence JSON、lifecycle 与 resolution/superseded metadata、source revision。新增 `(finding_id,user_id)` personal decision 投影（或用 append-only actions + 索引构建，但离线/并发和计数更适合物化），唯一键、decision version/last action ID。独立 eligibility 关系/版本快照供读授权，不把全 Journey 表当授权边界。索引 `(journey_id,lifecycle,rule_category)`、`(user_id,finding_id)`；唯一 `(journey,expense,rule,version,input_fingerprint)`。明确不要复用全局 `status` 给个人状态。

## 18. Backend / RLS Changes Required

继续 service-role-only RLS；Backend 以已认证用户检查 linked membership + per-Finding eligibility，所有 read/refresh/bootstrap/pull/action/history 同一检查，禁止越权读取别人的 action。不要以传入 userId 或客户端条件代替服务端授权。重算端点只返回调用者投影，写 Finding 与关闭旧项放单事务/RPC；让 Expense 接受变更后服务端自动调度重算，避免刷新依赖打开页面。变更 feed 目前只按 Journey，需提供权限安全的用户投影变更/版本 cursor 或按用户过滤 change，并处理成员失权时本地清退。owner 审计 API 与普通用户历史 API 分开。

## 19. Local SQLite Changes Required

SQLite v19 后新增迁移：保留旧 Finding/action，增 observation/lifecycle，个人 decision/eligibility 本地缓存按真实 auth user 隔离；查询用用户 ID + eligibility + active + decision，不能用当前 `ledger_actor_context` 的 Journey-only EXISTS 代替。为 action、count、列表提供同一事务的乐观投影和可重载/订阅变更通知；账号切换在投影读取前切换身份并清理失权/错误授权的私有缓存。历史 action 从旧表保留，但不把他人动作当本人状态。

## 20. Sync / Queue Changes Required

沿用现有 durable queue、owner_user_id、idempotency key、claim/retry/auth pause，不加新框架。action payload 绑定 finding ID、该用户预期 decision version/source identity；仅该用户 worker 推送。响应落个人 decision，不覆盖共享 Finding status；终态拒绝恢复正确服务端决策并显示失败。bootstrap/pull 必须同步 lifecycle、eligible projection、本人 decision/action，保证 offline count 和多账号切换不串；解决因 ACTION 不在当前 `REVIEW_FINDING` change-feed 内而无法靠 pull 同步本人决定的问题。全量 refresh 不可把服务器旧快照覆盖未提交的本地个人 action。

## 21. UI Changes Required

一个 repository-backed pending projection 供应 Review、导航 badge、Spending banner；在 action 事务提交后通知/失效，并在返回列表/焦点时重新查询，避免独立 hook state 陈旧。分类 chips、OPEN/折叠 Reviewed、历史入口；详情展示规则快照，展示同步/过期状态和 Expense deep link。所有按钮检查同一授权投影，终端服务端仍负责执行授权。

## 22. Migration Strategy

先扩展 Hosted Dev schema/后端双读写兼容、Mobile 新 SQLite/DTO，再切用户投影和精确授权，最后停用旧全局状态语义。旧 ACK/DISMISS action **仅归原 actor** 回填，按 finding + actor 的时间/稳定 ID 定序取最后 action；不能把旧 Finding.status 广播为其他人的决定。旧历史 Finding 保留其原 identity/evidence，标识 `legacy-v1/证据有限`，不伪造数值快照；已 STALE 行不重新开放。对每个仍存在的 Expense 做一次受控新版重算，新身份与新 evidence 并存，并批量结束旧 active，避免双计/丢数据；重算中若规则输入仍触发，新 Finding 默认各 eligible 用户待办，是否继承同规则相同输入的旧 actor 决策须在发布前明确裁决。迁移可重复、可回滚到只读兼容，保留旧列和 append-only action；禁止对 Production 执行，先 Dev shadow 对账。

## 23. Backward Compatibility

旧客户端看全局 status、拿 Journey 全量 Finding，会突破新可见性要求；**不能只上线 schema 后仍允许旧客户端请求敏感 Review**。发布 capability/min client version gate：旧客户端 Review 端点需安全拒绝并提示升级，财务核心 API 保持兼容。新客户端能读取 legacy history 的泛化说明，不假定旧 row 有数值 evidence。旧 `STALE/RESOLVED` 只读历史；旧 action 仍可审计，不重写。

## 24. Test Strategy

锁定现行五规则/阈值、13 校验代码、全局身份及旧行为的基线测试，再新增最小纵向自动化：A/B 同一 Finding，A ACK、A Dismiss 后 B 仍 pending；A/B/C 对金额异常，改正常后全球不 active、历史保留；revision 改后仍异常，A 重新 pending，cosmetic edit 不重新打开；非零 split 用户可见/可操作，零 split 无其他资格者不可见，owner 总可见；离线 ACK 立即 OPEN/count/badge 下降并单次队列/重连幂等；分类和 Reviewed 不污染计数；五种规则的 immutable 数值/身份证据可独立渲染；并测并发、旧 STALE 复现、跨 Expense cohort、跨账号/失权、旧客户端拒绝、迁移重放与失败补偿。服务端授权/RLS pgTAP + API、SQLite repository、sync restart、UI focus/accessibility 各有最小回归。

## 25. Implementation Phases

0. 基线测试与 Dev 数据/授权形态盘点；冻结新 rule-version、migration/backfill 裁决，不动财务真相。
1. Finding 规则依赖 fingerprint、结构化 evidence、lifecycle 原子重算（先服务端/Dev）；解决当前全局上下文身份和 STALE 复活问题。
2. 个人 decision + action 原子事务、原有 action history 兼容；旧 actor 回填。
3. per-Finding visibility、所有 Backend read/action/pull/bootstrap 筛选与旧客户端 gate；RLS 保持 service-role-only。
4. SQLite 个人缓存、owner-bound queue、立即计数/列表投影及失败补偿，多用户离线验证。
5. Expense create/edit/delete/恢复、独立支付证据/估值更新触发同一服务端重算；跨 Expense cohort/同步原子性。
6. 分类收件箱/Reviewed 折叠、详情证据、导航 badge；不在授权协议完成前开放 UI。
7. Hosted Dev 幂等迁移/双读退场、两真实身份端到端与离线重连/失权检查；单独审批 Production 路径。

每阶段以该阶段 automated gate 通过、无财务事实变动为退出条件；不在本文件阶段实施。

## 26. Risks / Open Questions

1. 现有“跨币种原始 minor 中位数”不具有财务可比性：保持 v1 历史原貌，但新规则应按同币种+scale cohort 或统一可信估值，须决定样本小于五笔如何处理。
2. 非零 allocation 的定义：原币与结算币之一非零是否即合格；负数/household 分配、未绑定 member、关联账号变动，以及历史资格快照的保留期限需产品/安全裁决。
3. ACK/DISMISS 必须填写 reason 是现行要求；新 UX 是否继续必填、已处理再行动的语义、owner 能否看别人审计原因需确认。
4. 同一规则输入在旧 STALE 后复现应是新事件还是同一身份重新激活；推荐引入 observation generation/连续活跃周期，决不能隐式继承旧决定。比较总体变化引发的批量重算有并发/性能成本，需事务锁或可重试 job 与一致性水位。
5. 收据 OCR 不是现有 Evidence 规则，不能按 UI 文案冒充；若将来加入 OCR mismatch 属新增规则/产品审批。
6. 多用户旧客户端可见全量 Review/action history 是当前敏感数据问题，授权和版本门禁先于任何新 UI。历史数据已同步到旧设备的撤销/清理策略必须明确。

## 27. Recommended Final Architecture

`canonical Expense/Payment/Split change → Backend 同一权限边界的规则依赖重算 → immutable shared observation + lifecycle → per-user eligible personal decision/action append-only → user-scoped change projection → SQLite local source of truth + durable action queue → Review inbox/detail/badge`。服务端是资格与观察权威；设备只乐观写本人的决策并保持离线可用。先确认第 26 节中影响身份、资格和旧客户端安全的裁决，再更新 PRODUCT/ADR 并逐阶段实施；本次没有修改任何运行时行为。
