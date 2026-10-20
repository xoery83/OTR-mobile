# ce SHi22 同步冲突补充审计

日期：2026-09-28。只读审计；未修改 App、部署、队列或财务记录。

对应截图 Trip：`Settlement Final Versions Acceptance e6e0955d`。
Expense server ID：`8f8433db-0dd5-473c-8b64-3c7a9a111efb`。
本地 ID：`ledger-expense_mukxy8d1_7mbic4wgto`。
已只读核对 Dev 事件与该模拟器单笔 SQLite 状态，没有导出数据库或读取凭证、
附件内容、OCR。保留当前共享 HEAD `d7e3fff` 及 Journey 修补 `797e789`。

## 结论

基本收敛缺陷已被 [LAWSON 报告](LAWSON_SYNC_INCIDENT_AUDIT.md) 覆盖，但本笔
新增两个具体断点：**无业务变更也发送整个 Expense UPDATE**，以及
**等价 timestamp 编码被误判为 DESCRIPTIVE 差异**。服务器已经成功拿到汇率，
`NZD—` 是受保护的旧本地数据和冲突状态下不显示估算的结果，不是 provider
没有返回。不能用再次请求汇率或手填汇率解决这笔冲突。

## 时间线（Pacific/Auckland，9 月 28 日）

| 时间             | 事件                                                          | 结果                                                |
| ---------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| 20:45:36.785     | 本地保存新 Expense                                            | RATE_REQUIRED，无 valuation；CREATE 入队            |
| 20:45:39.556     | Dev CREATE 201                                                | 服务器 revision 1                                   |
| 20:45:45.178     | 自动 ECB APPLY_VALUATION 200                                  | 服务器 revision 2，ACCEPTED，NZD4056 minor          |
| 20:52:51.710     | 本地 Save／UPDATE 入队                                        | 本地 revision 2、server_revision 1，无 valuation    |
| 20:52:57.184     | Dev UPDATE 409                                                | base 1／current 2，未解决冲突                       |
| 21:04:59.319–321 | 最新服务器聚合进入本地 deferred                               | 已存在 ACCEPTED＋REFERENCE_RATE，但受保护状态不应用 |
| 审计时           | 本地 CONFLICT＋RATE_REQUIRED，服务器 ACCEPTED＋REFERENCE_RATE | 同时有本地 OPEN 和服务器未解决记录，无 resolution   |

当前服务器估值：US$23.00 → NZ$40.56；1 USD = 1.7634 NZD，ECB 日期
2026-09-25，transaction economicDate=2026-09-27，automatic=true。
相关 USD quote 已在本地缓存，expiry=2026-10-28；两份附件均在 20:46 左右
上传完成，早于 20:52 的 UPDATE。不能据此推定用户当时是只改附件还是单纯
点击 Save，但该 UPDATE 的 baseExpense 与 expense 业务快照完全相同。

## 本地证据解释

- CREATE=COMPLETED，UPDATE=CONFLICT；UPDATE base_version=1。
- Expense local revision=2、server_revision=1、sync_status=CONFLICT、
  business_status=RATE_REQUIRED，active valuation count=0。
- 冲突 canonical snapshot 已有 REFERENCE_RATE；submitted snapshot 无 valuation。
- deferred 中存在 revision 2 的 ACCEPTED／REFERENCE_RATE／NZD4056 数据。
- 页面给 `ExpenseFxDetails` 传入冲突状态，将估算设 null；本地 valuation 也为空，
  因而显示 NZD—。避免把争议金额当成有效结果是正确的，但应允许只读查看
  “服务器版本已有参考估值 NZ$40.56”，并提供处理入口。

## 已被 LAWSON 方案覆盖的部分

1. 旧 server_revision 提交、拉取数据在 CONFLICT 下暂存、不自动覆盖用户意图。
2. 正式页面只有提示，没有接入 queueConflictResolution 的处理出口。
3. 只有本地保存成功反馈，缺少指定 UPDATE 是否被服务器接受的结果。
4. financial source 与本地投影不一致时不能直接 finalization，仍需解决收敛。

本笔未走接受 MANUAL_AGREED／DELETE，不能套用 LAWSON 的“删除意图丢失”
或“两条服务器冲突”作为它的直接原因；也没有证据证明旧回执覆盖新操作。
CREATE 后、第一次 UPDATE 前本地未取得 revision 2 的所有历史原因仍缺少
逐次日志；deferred 后的持续阻塞则由当前数据库与保护代码直接证实。

## 新增问题与修复要求

### N1 — 无业务差异 Save 制造聚合 UPDATE（P1）

本地 durable UPDATE 的 baseExpense 与 expense 完全相等。repository 每次
updateExpense 都推进 revision 并入队完整聚合，没有 no-op 检测。
Entry 重新构造 status／valuation：旧本地无 valuation 时提交 RATE_REQUIRED／null。
服务器已自动产生的 valuation、settlement splits、ACCEPTED 状态因而与
这份完整旧聚合不同，CAS 正确拒绝，但用户并未提出对应财务修改。

应在共享 repository／命令生成边界检测业务 no-op；附件变更仍在同一事务
通过现有附件队列提交，不额外重写 Expense 财务聚合。不以“完全没变化”为由
忽略真实金额、payer、split、日期、估值接受、生命周期或参与状态改变。

对真正的描述字段修改，应保存用户 patch 和观察基线：在确定原币金额／日期／
payer／原币 split 等未被用户或服务器改变时，可以保留服务器新增的派生估值，
按经过批准的三方合并规则继续。不同财务意图仍需选择；禁止盲目替换 revision。
已有这条 409 也必须通过服务器可审计的等价／重基线处理终结，不能仅删本地队列。

### N2 — 等价时间格式被误判为描述差异（P2）

Dev conflict 的 changedFields 只有 occurredAt、splits、valuation、businessStatus；
日期实际时间戳相同，original Money 相同，original split 分配也相同。
changedExpenseGroups 直接 JSON/string 比较 occurredAt，故额外标记 DESCRIPTIVE。
该项不是 base 1/current 2 拒绝的唯一原因，但让冲突解释不准确，并妨碍后续
安全合并／等价判定。

统一使用经过输入验证的 UTC instant 比较 timestamp；economicDate 继续是
独立交易日，不能把真实交易日期变更归为格式差异。只比较用户拥有的 split
输入与原币分配，派生 settlementMinor 应作为估值变更解释，不能倒推出用户
修改了原币分摊。

### R1 — Change feed 版本语义需一并明确（已确认现象、非本笔主因）

deferred 中一个 envelope revision=1，但 aggregate.revision=2；另一个都是2。
Backend 从 feed 事件取 envelope revision，同时附带当前最新聚合，这是代码
现有行为，不意味着丢失服务器快照。但后续收敛不能把事件版本当作聚合版本，
也不能应用低于已确认 canonical 的 deferred 数据。该检查纳入 LAWSON B 的
共同 canonical／pull 保护验收；本笔暂存数据相同，未证明其导致倒退。

## 验证与计划增补

复用临时 LAWSON 隔离审计配置，三组八项检查通过；新增检查复现无变化 Save
仍入队 UPDATE、同一 timestamp 的两种编码被标为 DESCRIPTIVE。此前六组
相关测试32项通过，不能替代新的完整收敛验收。

完整修复增加以下验收：无改动 Save 不产生 Expense UPDATE；仅附件操作
不重写财务聚合；自动估值后只改标题／备注保留服务器估值并正确提交该 patch；
真实财务修改仍触发确认；等价 UTC 编码不误分类；低版本 deferred 不覆盖
成功解决后的高版本；冲突详情能只读显示服务器已有汇率且不能误作已采用值。

没有新的汇率供应商故障证据，不需要换 provider。无需因这笔扩展新同步框架，
在 LAWSON 的闭环方案加入 N1、N2 和 R1 的验收即可。
