# OTR Mobile 2.0 货币 / FX / 估值收敛实施计划

日期：2026-09-17。状态：**Phase A、B1 与 B2 候选缓存已获准；C/D/E/F 未授权**。依据 `CURRENCY_FX_DOMAIN_AUDIT.md`、Ledger 2.0 领域/API 契约和当前实现。未批准的建议仍需产品确认；迁移仅指 Dev，不涉及 Production。保持原始 Money、PaymentRecord、结算估值、还款估值四种事实分立，并复用 Stage 4B/4C/5/7、持久队列和 Review 2.0，不创建平行估值系统。

2026-09-17 更新：Phase A 与 B1 已完成；B2 获准只获取、校验、缓存历史日候选，固定 ECB 来源的 Dev-only 核查见 `CURRENCY_FX_PHASE_B2_PROVIDER_REVIEW.md`，实现边界见 `CURRENCY_FX_PHASE_B2_HISTORICAL_RATES.md`。ECB 参考率是否可用于后续结算接受仍是 Phase C 门槛。暂隐 Preferred Currency、未来最多回看 7 个日历日、未来 Phase D 的 Journey Currency A–D 规则（finalized 后永久锁定、无 epochs）、Backend 拥有可替换 provider、Expense Detail 为主要来源说明均已获产品批准。Phase A 日期证据见 `CURRENCY_FX_PHASE_A_DATE_FINDING.md`；B1 的零历史回填政策见 `CURRENCY_FX_PHASE_B1_ECONOMIC_DATE.md`。**C/D/E/F 均未获实施授权。**

## 明确语义与现有实现冲突

- 原始交易 `Expense.original = {minor,currency,scale}` 是商户金额；更正 `100 NZD → 100 EUR` 保留**显示的数字 100**，按 EUR 的 ISO 小数位重新解析为 minor（并非保留旧 minor，也非换算）。零/二/三位币种切换时，若原数字有目标币种不允许的小数位，阻止保存并要求用户明确修订，绝不偷偷四舍五入。已有审计修订链允许更正；当前表单清空 `amount` 与此产品决定冲突，应更改。EXACT 输入若精度/合计不合法，也须明确重新分配。更正后不兼容活动估值失效，旧快照保留审计；同币种身份估值可重建，跨币种进 `RATE_REQUIRED`，待规范 Stage 5 流程接受报价。
- Journey 对外叫 **Journey Currency / 旅行结算货币**；说明分别为“Currency used for Journey totals, balances and settlement.” / “用于本次旅行的汇总、成员余额和结算。”；唯一内部事实仍是 `ledger_settings.settlement_currency/settlement_scale`，Mobile 镜像为 `ledger_journeys`。FX 报价字段 `base_currency` 是汇率方向的目标币，不另造 Journey base 字段。
- 账号本地 `account_local_state.default_currency` 是未来 **Preferred Currency / 偏好货币**，与 Journey Currency 无关。目前不改变任何报表显示，因此 **Phase A 已从普通 Settings 隐藏**，保留已有数据和读取兼容性；待可验证的只读展示换算上线再恢复。新 Expense 默认币种继续从 Journey Currency 取，不能受隐藏偏好影响。
- 权威经济日期是 Expense 的**旅行当地日历日**，而不是记录或估值时间。B1 在 canonical Dev Expense 和 Mobile 镜像中增加独立可空 `economic_date`，新表单保存所选 `YYYY-MM-DD`；历史歧义值保持 `NULL`，不从 `occurred_at` 猜测或转换。更正这一日期使不兼容活动估值失效并保留历史证据。B2 必须以显式日期为报价键，未知日期先让用户确认。
- 重要技术冲突：现有 `previewValuation` 只检查报价币种方向，尚未检查经济日/实际参考日；`insertRateSnapshot` 在无 quote 时以**估值当天**填 `effective_date`（手动/同币种证据也如此）。历史日估值不能靠 UI 约定，需 Backend 权威校验，Mobile 同步预检，并区分经济日、实际参考日和观测/接受时间。

## 历史日汇率与缓存契约

查询键为 `(economicDate, original/quote ISO, settlement/base ISO, ratePolicyVersion)`；同 Journey 的同一天同币对复用候选，跨 Journey 可在 Backend 共享获取结果但返回仍经 Journey 授权。已有 `ledger_rate_quotes` 同时有 `journey_id, quote_currency, base_currency, effective_date, observed_at, provider, reference, expires_at`，可以保存候选和下发到 Mobile；**没有**经济日与实际参考日两个独立日期、唯一请求键或查不到/重试状态。不能把 `effective_date` 同时当两者。优先以它表示**实际发布参考日**，另在服务端需求/映射层保留请求经济日；如要稳定复用周末请求、持久去重及缺失/重试，应向 Dev 添加最小请求映射/状态（或等价受约束字段），而不是复制每个 Expense 的报价。SQLite 是否加经济日映射取决于离线同日查询和验真需要，倾向加轻量键/元数据，不复制市场汇率到 Expense 根。已接受的 Expense rate snapshot 继续冻结实际参考日、provider/reference、source/staleness；可扩展可读元数据记录经济日、周末回退规则版本。不能悄悄修改已接受快照。

周末/假日：查找 `referenceDate ≤ economicDate` 的最近**真实可用**日汇率，并设置有限回看窗口（已批准的 7 个日历日）；无数据则 `RATE_REQUIRED`，不能无限期沿用旧价。UI 分别显示“消费 7 月 12 日 / 参考汇率 7 月 10 日”。同一天稍后新来源修订只影响**未接受**候选，既有估值不漂移；重新估值需新修订/原因。未来经济日不能使用尚未发布的“最近”值伪装历史完成：保持待报价，或明确经过批准的临时策略，此计划不启用临时估值。`expires_at` 是缓存/观测新鲜度，不应让旧历史日的准确报价只因今天晚于过期时间就被判定为“不能使用”；Stage 5 的 stale 规则需区分历史参考有效性与供应商数据过期。月度/季度数据不能伪装成日参考报价。

### 候选服务商（实施前再核条款）

[Frankfurter 官方文档](https://frankfurter.dev/)提供历史指定日期、币对和 provider 筛选；官方 FAQ 表示公开 API 可商用、无需 key，但限流防滥用，且明确要求核对**底层来源各自条款**。其默认多来源 blended 值可能随来源调整末位，因此必须锁定选定 provider/算法版本与实际参考日并冻结接受结果；覆盖并非所有 Picker 支持的 ISO 码。仓库代码为 [MIT](https://github.com/lineofflight/frankfurter/blob/main/LICENSE)，这**不等于**所有底层报价资料自动可商用。ECB 的[统计复用政策](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html)允许有条件商业复用、要求注明来源，并排除未获授权的第三方资料。候选：Backend 通过现有 `RateQuoteProvider` 包装 Frankfurter 的选定官方来源，先验证 ISK/NZD/EUR 等真实覆盖、周末返回日期、精度、归属和条款；不满足则换源，不能暗中混合或自动降级到不明来源。Provider 选择/合同/来源许可/归属、速率限制和故障切换属上线前独立审批。Mobile 不直接请求公开源，也不请求全球所有货币；Backend 只为需求键获取并缓存。外部 JSON 的小数用原始文本/受控十进制解析，不能通过 JS float 计算财务结果。来源返回日必须可核验且不晚于经济日。

## Journey Currency 变更：四类状态与推荐规则

| 状态                                               | 推荐可见行为                                                                                                                                                                                                                                                                                                                                                | 服务端不可分割的边界                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A 没有 Expenses                                    | 有权限成员预览新货币/scale、确认后更新 Journey 设置；不生成虚构估值。                                                                                                                                                                                                                                                                                       | settings 基准 revision + idempotency，原子更新/审计/change feed；离线本地可保存待处理**意图**，不得冒充已经生效的服务器财务设置。                                                                                                                                                                                                                                           |
| B 有 Expenses、从未 finalized                      | 预览全部受影响 Expense：同币种身份、可用历史日 rate、缺失 rate、现有手工/ACTUAL_PAYER_COST/导入估值、排除/草稿、冲突和余额变化。确认后原始 Money 不变；旧估值/快照留历史；按各自经济日创建**新** valuation/rate snapshot，`supersedes*` 串联，新 settlement split、报表/Review 重算；缺失则 `RATE_REQUIRED`。不能把付款实际成本的比例机械换算成新市场报价。 | 一条 Journey 级、授权、基于 settings revision 和 Expense revision 集合的事务性命令；报价不足可明示为未估值并由后续 Stage 5 补齐，不能半批量切换出混合货币“活动”估值。旧 `LEGACY_IMPORTED`/手动协定需明确保留为历史证据并按批准的市场/手动例外策略重新接受；不得静默覆盖成员约定。若事务规模超限，**先**设计原子生效屏障/分批方案，不假装多次普通 Expense 更新等价原子切换。 |
| C 有未 finalized 的预览/进行中的结算               | **阻止确认**，先让发起人明确退出/废弃预览，再重新预览货币变更；无需为短暂预览造持久取消状态。                                                                                                                                                                                                                                                               | 当前 Stage 7 preview 依 settings revision/input digest；确认时再次检查无活跃流程、revision 未变，旧预览不能 finalize。若“open”其实已有服务端持久事实，先查状态机并显式关闭，绝不删除历史。                                                                                                                                                                                  |
| D 存在任一 FINALIZED settlement（含后续支付/调整） | **推荐 Option 1：该 Journey 永久锁定其结算货币。** 提示既有结算已形成可审计债务，后续 Expense 仍能有不同原始币种并按旧 Journey Currency 估值。需要全新结算币种时创建新 Journey（不是复制旧 Expense 或转移历史债务）。                                                                                                                                       | 后端在最终提交时检查任何 finalized 历史，包括 SUPERSEDED/ADJUSTED/PAID；客户端缓存仅用于提前提示，离线不得先承诺切换。历史 final input、余额、transfer、payment、discharge 和导出字节语义均不变。                                                                                                                                                                           |

Option 1 最少新状态、最易理解，且不会让旧币种的未清偿转账与新币种的新增 Expense 混算。Option 2（只影响未来）必须定义切点、跨期债务/Adjustment/报表及旧货币未偿支付；Option 3（显式 epochs）更可审计但要多币种余额、跨期导出、冲突与离线队列版本，超出旅行 Ledger 当前需要。两者均可作为另行批准的未来产品，不在本计划实施。**Option 1 已获未来 Phase D 产品批准，命令尚未实现。** “新 Journey”建议不替用户自动创建、迁移或克隆事实。

## 所有货币输入/控制的归属

| 控件                                                      | 域含义 / 持久化 / 估值影响                                                                                     | Shared Picker 决策                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `LedgerExpenseEntryScreen` Currency（new/edit）           | 原始商户 Money；Save → `ledger_expenses`、splits、修订/队列/审计；影响活动估值与 Review。金融事实。            | **使用现有 Picker**；更正数字不清空，需明确“更正，非换算”及不可表示精度。                              |
| `app/(tabs)/expenses/settings.tsx` Default Currency       | `account_local_state.default_currency`，账号本地偏好；不更改财务事实或现有显示换算。                           | **Phase A 暂时隐藏**普通入口，数据保留；Phase F 有真实转换才以 Preferred Currency 恢复 Picker。        |
| 未来 Journey 设置                                         | `ledger_settings.settlement_currency` 经专门命令 + SQLite 镜像/队列；全 Journey 估值/结算影响。金融规则。      | **使用 Picker**，但先预览、授权和 A–D 守卫，不调用个人偏好 setter。                                    |
| `TransferDetailScreen` Payment currency 文本框            | Stage 7 还款 Money + 独立 repayment valuation/双方确认；不编辑 Expense 原始货币。金融事实。                    | **推荐 Picker** 以防错码，并保留其 payment/discharge 金额、rate/原因字段；不能让 Picker 自行换算数值。 |
| `LedgerSearchScreen` Currency filter                      | 仅 `original_currency` 筛选，临时 UI/query，不是写入。                                                         | **保留现有“本 Journey 有过的币种”受限选择**，比完整全球 Picker 更快、更少空结果。                      |
| Exchange Rates route / rate detail                        | 当前 route 是占位，无普通市场汇率编辑；未来 Expense provenance 是只读，手工协定 rate 是显式 Stage 5 金融证据。 | 不做常规市场币种 Picker；高级/历史视图按当前 Expense 币对固定，手动 rate 不允许靠切币对改变原交易。    |
| Receipt OCR suggestion、Stage 5 acceptance/debug fixtures | OCR 币种建议需人工确认后才成为 Expense；验收 hook 不是产品操作。                                               | OCR 复用 Expense Picker；debug 不作为正常导航。                                                        |

## 分阶段交付（每一阶段独立验收；不得跳过安全闸）

### A — 语义、更正表单、术语

- 行为/文件：`LedgerExpenseEntryScreen.tsx` 保持可表示的数字字符串；改变币种或经济日时判定估值失效，不能将原数值按旧 minor 继续使用；重算/阻止不匹配 EXACT splits，解释保存后 `RATE_REQUIRED`。Journey 文案使用上述双语；隐藏 `app/(tabs)/expenses/settings.tsx` 未生效的偏好，保留数据。`src/features/ledger/expenseDraft.ts`、`src/domain/ledger/money.ts`、本地化文案为最近依赖。保留 Stage 4B 修订、Stage 4C 冲突及快照历史。
- 层级：SQLite **无迁移**；Backend/Dev **无新增端点/迁移**，但需验现有编辑能保留旧快照并按原始日期变更消除不兼容 valuation；队列沿用 `LEDGER_UPDATE_EXPENSE`。Audit `FINANCIAL_CORE` 标记金额/币种/日期；Review 2.0 重新生成并保留旧代次。报告从活动估值刷新，未估值不入金额合计；已有 finalized guard 仍阻止不允许的更正。
- 离线/检查：Save 本地成功无需网络。单测 100 NZD→100 EUR、JPY/ISK 零位和 KWD 三位、无法表示的小数/EXACT、日期更正失效、相同原始 Money 保留；仓储/worker 幂等与冲突。签名 Simulator 测 new/edit/取消/重启/Review；实体设备测离线 Save→恢复同步、原始 Money 与报表/历史，不清数据。回滚仅 UI/行为；已发生更正不可通过回退构建“恢复”财务数据。范围外：自动 FX、Journey 变更、显示换算。

### B — 历史日 provider、Backend/SQLite 候选缓存

- 行为/文件：在 `backend/src/rateQuoteProvider.ts` 背后实现需求驱动历史日查询；服务端校验请求经济日、参考日、方向/ISO/精度/来源，持久共享/授权候选及缺失/限流重试；扩展现有 `GET /v2/trips/:id/ledger/rate-quotes`、`backend/src/supabaseGateway.ts`、`src/data/api/ledgerReadContracts.ts`、`src/data/repositories/ledgerReadRepository.ts`、`ledgerExpenseRepository.ts`，不让 UI 或 Mobile 调公开 provider。只获取已出现/待估值的键，单飞并发/短暂负缓存，后台补齐，限制回看窗口；后端不向外泄露 Expense 私有详情。
- 层级：Dev `ledger_rate_quotes` 复用，但为经济日→参考日映射、确定性唯一/状态和可追溯来源**预计需要前向迁移**；SQLite 很可能需要日期映射/索引（待 v21 数据/日期核查后定），不可重写旧缓存及快照；Backend 需要适配器和安全超时/退避，无新大依赖。`RATE_QUOTE` change feed/bootstrap 复用，缓存更新无 Expense 审计/revision；Review、报表、settlement 都不因**仅候选变化**而改值。
- 离线/检查：有历史候选可离线读取，缺少候选只登记需要/后续重试，不阻塞 Save；服务端恢复后下发。单测周末/假日、经济日≠参考日、未来日、无覆盖币种、反方向、数字精度、source 条款/错误/重试、同日多笔去重和恶意响应；Dev 契约、迁移与 pull 测试。Simulator 离线缓存/缺失/重连；实体设备验证弱网、重启/多账号不泄露 quote/Expense。回滚保留缓存，旧 Mobile 忽略可选元数据；上线前确认来源许可/覆盖及 provider 可用性。范围外：自动接受估值、全球预抓、实时报价。

### C — 自动、安全的 REFERENCE_RATE 估值闭环

- 行为/文件：Expense Save 始终先提交 canonical Money。随后由**已有持久 sync/operation 协调层**（非 screen）在匹配本地历史候选时调用 `LedgerExpenseRepository.applyValuation`；无报价保留 `RATE_REQUIRED`，持久“需要汇率”可由现存 `RATE_REQUIRED` + Journey/经济日/币对重建（若扫描/唤醒不可靠，再加最小队列元数据）。远端 Expense create 必须先同步，才推 `LEDGER_APPLY_VALUATION`；回连取 quote 后幂等重试，服务器重新校验 `occurred_at`、参考日、报价来源、baseRevision、preview 与 stale 策略，绝不接受过时/不匹配报价。现有 `ledgerExpenseSyncWorker.ts`、`ledgerOperationalSync.ts`、`valuation.ts`、`supabaseGateway.ts`、Stage 5 RPC 是实现点。
- 层级：优先复用 SQLite v21 `RATE_REQUIRED` 和操作队列，无新表；Dev Stage 5 原子 RPC/审计/immutable snapshots 可复用，但**需补服务器日期/来源校验**，若 provenance 存不下双日期则加小迁移。活动 valuation/new splits 经 change feed、冲突/Review 重算和报表重新查询；已 finalized 输入永不因候选刷新重估。默认仅自动 REFERENCE_RATE；已有 MANUAL_AGREED、ACTUAL_PAYER_COST、LEGACY_IMPORTED/已接受快照不自动替换。并发同一 Expense 以 base revision 幂等序列化，冲突显式处理。
- 离线/检查：缓存命中可本地完成并排队（需证明本地候选可信/未过期且服务器验证一致）；否则待网恢复。测试离线创建重启、先 create 后 valuation、重复唤醒单一活动快照/单一修订、历史日有效与缺失、服务器另源冲突、Review 代次/类别总计、Settlement readiness。签名 Simulator 和实体设备均跑缓存命中/缺失→回连/两设备竞争及断网冷启动。回滚关闭自动调度而不删除已接受快照；旧客户端仍能读已有估值。范围外：未请求的历史批量重估、手动/付款成本自动覆盖。

### D — Journey Currency 专用变更命令

- 前置：A–C 验收，**另行批准 A–D 状态规则和手动/导入估值迁移策略**。只允许有权限的 Journey 成员，先取 Preview（每笔经济日、参考来源、差额、缺失、人工例外、开放冲突/结算状态），用户明确确认。实现 `ledger_settings` revision + 冻结受影响 Expense revisions/digest 的单一幂等命令；原子更新设置、逐笔 superseding valuation/settlement splits 或 `RATE_REQUIRED`、审计/settings change feed。任何 finalized 历史拒绝；open 预览先废弃；命令时再验成员权限、状态、digest、同币种 identity、rate 日期。不能用逐个 `PATCH Expense` 来模拟 Journey 原子事务。
- 层级：Mobile `ledger_journeys` 需要 pending/intention、服务器 settings revision/冲突投影（**前向 SQLite 迁移**）；Backend 新 Preview/Commit 授权端点；Dev `ledger_settings`、Journey audit/idempotency/change feed/原子 RPC 与可能的 revision/digest 索引（**前向迁移**）。跨 Journey 无影响，原始 Money/历史快照不变。Review 对新 revision 重算，旧 findings 历史保留；Mine/Group/Analysis/My Ledger 按新 active currency 原子刷新；结算 preview digest 失效、重新预览，finalized 不触碰。
- 离线/检查：可离线保存*待提交请求*并显示“尚未生效”，但若需要服务器最新 revision、报价和 finalized guard，**不能离线展示新货币已生效的余额**；重连重新 Preview+确认（过期/冲突需要再次用户确认，不自动执行旧确认）。测试 A/B/C/D、报价缺失、事务全失败回滚、两设备竞争、重放、权限/撤销、10k 行性能/原子可行性、Review/导出/支付证据指纹不变。Simulator/实体设备测离线 pending→重连重新确认、预览切换、跨账号隔离及历史冻结。回滚必须保持前向 schema 与既有快照；不作反向批量改币种。范围外：epochs、旧结算跨币迁移、Production。

### E — 估值来源详情与例外路径 UI

- 行为/文件：`LedgerExpenseDetailScreen.tsx` 首屏只显示原始 Money、Journey Money（不可用则明确状态）和简短实际 rate/经济日；点开才看 provider/reference、实际参考日与经济日、观测/接受时间、政策/rounding、历史 supersession。`app/(tabs)/expenses/exchange-rates.tsx` 不做常规入口，必要时改为高级历史/诊断视图，否则隐藏。为有权限者提供**显式** MANUAL_AGREED（rate + 必填原因、先预览）和 ACTUAL_PAYER_COST（选择非 superseded posted evidence）流程，复用 Stage 5 命令，不能随市场 quote 刷新覆盖它们。
- 层级：如详情当前 DTO 缺完整 snapshot provenance，扩展 `backend/src/supabaseGateway.ts` 的授权只读投影、`ledgerReadContracts.ts`、SQLite repository 查询，可能小型 SQLite/Dev 前向迁移仅限双日期/旧数据标记；财务写入继续 Stage 5 既有端点/队列/audit，Review 观察修订并重算，报表/settlement 仅采用新活动估值。离线可看已缓存来源、可提交手工/付款证据待同步；不把缺少来源显示为“市场价”。
- 检查：测试来源/许可归属、手工理由、付款币种与 Journey 匹配、审计 supersession、权限/冲突、动态文字/VoiceOver。Simulator/实体设备核对示例 `ISK 10,000 ≈ NZ$...` 的小数/真实参考日、离线详情/手动提交→回连、已有 finalized guard。回滚 UI 不删除来源历史；旧客户端忽略扩展只读 DTO。范围外：把付款差额推为市场汇率、实时图表、交易所行情。

### F — Preferred Currency，只在独立价值验收后选择实施

- 行为/文件：若用户确需跨 Journey 阅读同一展示币种，再恢复 `settings.tsx` 的 Picker 并标注仅显示；`ledgerReportingRepository.ts`/Backend reporting DTO 增添**只读派生**换算及独立展示报价来源/日期，原 Journey 金额、跨 Journey 债务、结算与导出仍按各自 Journey Currency。不适合汇总的缺率部分必须分开显示，不得把不同币种裸加或假设 1:1。没有真实用户需求则**不实施 F**，保留本地偏好数据。
- 层级：优先复用账号本地 `default_currency`，SQLite/Dev/Backend 金融模型无迁移；若跨设备同步偏好经产品确认另定，不顺手扩范围。只读展示缓存不入 financial operation/change feed/audit，Review、Settlement 与 canonical reporting inputs 完全不变。离线缺展示率则回退明确标注的逐 Journey 原币值，非错误换算。测试币种混合/缺率、缓存/账号切换、显示与导出不改；Simulator/实体设备校验文案和离线可读。回滚隐藏 UI 即可，不删偏好。范围外：统一跨 Journey 结算、实际 cash exchange。

## 发布闸与审批

每阶段先自动检查，再在隔离 Dev/签名 Simulator 和获准的实体设备上验收；新 Backend/Dev schema 先做兼容迁移和旧客户端读取检查，保持可停用新写入的 feature gate。任何 Hosted Dev 部署、设备安装、Production 访问/迁移按各自审批另行执行；本文不授权。每阶段只更新相关契约、当前状态和必要 ADR，不重写已批准历史设计。实际现金/银行兑换（NZD 500 → ISK 41,000）为**另行延期的产品域**，绝不可伪装为 Expense 货币更正、市场估值或转账还款。

## 最终决策表

| #   | 决策                                                                                                              | 归类                              |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Expense 改币种是原始金额更正；`100 NZD → 100 EUR`，保持数字、重新按目标精度解析，不自动换算。                     | APPROVED PRODUCT DECISION         |
| 2   | Journey Currency 是既有 `settlement_currency`，用于 Journey 汇总、余额、结算，不增第二字段。                      | APPROVED PRODUCT DECISION         |
| 3   | Preferred Currency 是账号本地展示偏好，不改 Journey 财务事实；暂隐无效 Settings UI，保留数据。                    | APPROVED PRODUCT DECISION         |
| 4   | 权威估值经济日期来自 Expense 经济日，现有字段为 `occurred_at`；当地日期/时区歧义先核实。                          | APPROVED PRODUCT DECISION         |
| 5   | 市场报价只取日参考/历史汇率，不用盘中或实时交易价。                                                               | APPROVED PRODUCT DECISION         |
| 6   | 按经济日 + 原币 + Journey Currency 查历史日；接受后快照冻结。                                                     | APPROVED PRODUCT DECISION         |
| 7   | 非营业日取不晚于经济日的最近真实日参考，分别记录两日；最多回看 7 个日历日。                                       | APPROVED PRODUCT DECISION         |
| 8   | Provider 访问归 Backend，保持可替换；Frankfurter 仅候选，正式来源另审。                                           | APPROVED PRODUCT DECISION         |
| 9   | Backend 按需求键获取与缓存，Mobile SQLite 缓存被授权候选；复用 `ledger_rate_quotes`。                             | APPROVED PRODUCT DECISION         |
| 10  | 有安全的历史候选时由现有 Stage 5 路径自动接受 `REFERENCE_RATE`，幂等并校验修订。                                  | APPROVED PRODUCT DECISION         |
| 11  | 缺率不挡离线 Expense；保持 `RATE_REQUIRED`，重连补率，不造 1:1。                                                  | APPROVED PRODUCT DECISION         |
| 12  | 明确选择的 MANUAL_AGREED 是独立历史证据，市场自动流程不可静默覆盖；原因必填。                                     | EXISTING ARCHITECTURAL INVARIANT  |
| 13  | ACTUAL_PAYER_COST 仅显式选择合格 posted PaymentRecord；与原始和市场值分立，非市场汇率。                           | EXISTING ARCHITECTURAL INVARIANT  |
| 14  | 无 Expense 可预览、授权和按 settings revision 幂等变更 Journey Currency。                                         | APPROVED PRODUCT DECISION         |
| 15  | 有 Expense、无 finalized：专门事务按每笔经济日 supersede 活动估值，保留原始及旧证据；未解决率为 `RATE_REQUIRED`。 | APPROVED PRODUCT DECISION         |
| 16  | 有 open 未 finalized 结算，必须先显式退出/废弃预览、重新预览；确认时再检查。                                      | APPROVED PRODUCT DECISION         |
| 17  | 存在任一 finalized 历史即永久禁止该 Journey 改结算币种；新币种开新 Journey。                                      | APPROVED PRODUCT DECISION         |
| 18  | finalized inputs/balances/transfers/payments/discharges/exports 不被币种变更重写或重估。                          | EXISTING ARCHITECTURAL INVARIANT  |
| 19  | Expense detail 展示简要 FX，可展开来源；Exchange Rates 独立页仅高级历史/诊断，普通用户无需管理市场报价。          | RECOMMENDATION REQUIRING APPROVAL |
| 20  | 实际现金/银行兑换为不同经济事件，当前收敛阶段不建模。                                                             | APPROVED PRODUCT DECISION         |
