# Europe 2026 Replay Recovery / Rebuild Acceptance

日期：2026-09-15
状态：**PASS — 采用版本化替代（B），旧污染 fixture 保留且退役**

## 1. 根因与只读审计

`Europe 2026 Replay` 原 Journey `ae2fb30d-6e31-8ff9-8b14-f8a1b275cf65`
在 2026-09-14 通过正常 Ledger Expense 表单被编辑。产品当时没有把 Stage 9
Replay 识别为只读 fixture；详情页、表单和 repository 写路径均允许正常编辑。

唯一偏离批准 Stage 9 基线的是 Expense
`f040e287-f93f-89b0-b7ad-e45fbed11d09` 的这次编辑及其正常派生行：

- Expense revision 从 1 变为 2；Stage 9 校验字段及金额、币种、分类、payer、
  INCLUDED/EXCLUDED 均未改变；description 仍为 null；
- 该 Expense 的 7 个 participant 成员及快照名称未改变，但正常 aggregate replace
  把 display order 从 `0,1,2,3,4,5,6` 重排为 `3,6,5,1,0,4,2`；
- 531 个 split 的成员、金额、方法和舍入值仍与批准数据集一致；
- 原 valuation `90f830a0-914d-8550-9122-945dc5558412` 保留为 revision 1、
  inactive；新增 active revision 2 valuation
  `6fe4702d-14ab-4ad7-8c15-7dc0cc7aaaf6`；rate snapshot 总数仍为 126；
- 新增 1 个 `EDITED` audit row
  `9b9f3b89-8c0c-4c16-970c-730314406306`，reason 为正常表单更新；
- 新增 1 个 `UPDATE_EXPENSE` idempotency row
  `87d18d9d-ecd2-4e69-86f8-90587794a910`；原 import receipt 保留；
- 新增 1 个 Expense revision 2 change-feed row；原 126 个 import changes 保留。

恢复执行前没有发现第二笔 Expense、成员、split、rate、Settlement、Payment、Adjustment、
Receipt、Household、Review 或其他无法解释的漂移。污染态精确指纹为
`b001270b71956b828ae7fa92b247f77622e0ab7576f36ed830d3f0f09ec909e7`。

替代 fixture 成功导入后，首次启动旧 Simulator 做 Mobile SQLite 验证时，旧 SQLite
中一条早于本恢复 guard 的 pending operation 自动重放到了已退役的原 Replay。它只影响
第二笔 Expense `d410cbcb-30c8-8840-937b-6d969f14e49f`：revision 1→2，新增一条
reason `Edited Expense.` 的 `EDITED` audit、一条 `UPDATE_EXPENSE` idempotency、一条
change 和一个 replacement active valuation；金额、币种、payer、participant、split、rate、
participation 和所有 Stage 9 内容字段不变。Backend request log、时间戳和 durable
idempotency key 完整解释了来源，并非恢复脚本写入或新的人工编辑。发现后立即停止联网写
路径并补上 queued-sync guard。原 Replay 最终退役指纹为
`d69866ea72293f80d9201cd7020f3ae58e8ca0651db64f2daa41e81d9f8d797d`；这段历史同样未删除。
其最终只读计数为 126 Expenses（其中 2 个 revision 2）、531 participants/splits、126 rates、
128 valuation rows/126 active、2 audit rows、3 idempotency rows、128 changes，且仍为零
Settlement/Payment/Adjustment/Receipt/Household/Review facts。

## 2. 不可变来源与恢复可行性

原 Stage 9 v3 私有 artifacts 仍存在且通过既有验证：

- transformed dataset SHA-256：
  `be1fce8c0a4a681e2f520484401317a9ba3611cab1d0636f1c07bee754268a49`；
- committed raw SHA-256：
  `7376dbac22830d05689c3ea1626395c03b4857ba2877d1360c600d5e7ef0f578`；
- approval manifest 为 `PRELOAD_VALIDATED`，target project 为 Hosted Dev
  `tuqigdxrvrerfewsxqgm`；
- 既有 `load-hosted-dev.ts` verify-only 先通过本地 dataset/manifest/raw/restore
  校验，再准确地在 Hosted `EXPENSE_MISMATCH` 处失败，证明来源有效而旧目标已漂移。

仓库没有现成的、精确到 Replay Journey 的 dependency-safe teardown/rebuild 工具。
虽然数据库 FK 包含部分 cascade，直接删除整趟 Journey 仍是新造的破坏性清理路径，且
无法满足“不删除 immutable audit/idempotency/history”的要求。因此没有采用 A，也没有
使用整项目备份回滚（会回退无关 Hosted Dev 数据）。

## 3. 采用的恢复方法

采用 B：创建版本化替代 Replay
`ec3ae448-3fa5-84a9-a986-655a243cf3ad`，旧 Journey 原样保留并在测试流程中退役。

专用脚本 `scripts/stage9/recover-hosted-dev-replay.ts`：

- 在 client/network 创建前精确拒绝非 Hosted Dev project；
- 锁定原 Journey ID、已知污染指纹、原 dataset/raw 摘要和空替代目标；
- 只对 Journey/member/Expense/rate/valuation/review destination IDs 做固定 namespace
  的确定性重映射；名称、日期、Traveller labels、Expense titles、金额、币种、
  participation、splits、rates、valuations 和 provenance 保持不变；
- 使用既有 service-role-only `ledger_import_stage9_v1` 和 manifest/read verifier；
- 默认只做 preflight；只有精确 token
  `CONFIRM_VERSIONED_REPLACEMENT_V1` 才执行；不是任意 Journey 清理/导入工具。

替代 dataset SHA-256 为
`40999542081740642a8729c24cb2bb29e123a9e54b85ceb05fa71f12adb76fec`。
它与批准 dataset 的非身份 payload 逐字节等价；指纹变化仅来自新目标 IDs、正常 import
生成的 Hosted timestamps/change identities 以及新的 import receipt。

## 4. 前后指纹

| 对象                    | 状态                            | 指纹                                                               |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------ |
| 原 Replay 批准基线      | 历史参考                        | `50c8125a45d23f75a8df7de63256fdb5bff21943b109aa64166c2f7c23b42e7d` |
| 原 Replay 恢复前        | 已知污染态                      | `b001270b71956b828ae7fa92b247f77622e0ab7576f36ed830d3f0f09ec909e7` |
| 原 Replay 替代导入后    | 未被恢复脚本修改                | `b001270b71956b828ae7fa92b247f77622e0ab7576f36ed830d3f0f09ec909e7` |
| 原 Replay Mobile 验证后 | 已解释 stale pending 重放、退役 | `d69866ea72293f80d9201cd7020f3ae58e8ca0651db64f2daa41e81d9f8d797d` |
| 替代 Replay 恢复后      | 新批准 fixture                  | `97fa314b965dd6af0f1337147301bdfb345e8a0060e1de0c56c6b421dcd83ce2` |

旧批准指纹没有被伪造恢复；两次旧 revision/audit/idempotency/valuation/change 历史全部保留。

## 5. 替代 Replay 精确验证

| 检查                                   |      结果 |
| -------------------------------------- | --------: |
| Journey / members                      |     1 / 8 |
| ACCEPTED Expenses                      |       126 |
| INCLUDED / EXCLUDED                    |   68 / 58 |
| participants / splits                  | 531 / 531 |
| rate snapshots / active valuations     | 126 / 126 |
| normalization provenance               |        69 |
| import receipt / Expense changes       |   1 / 126 |
| Review findings/actions                |     0 / 0 |
| Expense audit/correction               |     0 / 0 |
| Receipt/assets/links                   |     0 / 0 |
| Household facts                        |         0 |
| Settlement root/input/balance/transfer |         0 |
| Payment records / Settlement payments  |     0 / 0 |
| Adjustment                             |         0 |

同一 payload 的第二次正常 import 返回 `idempotentReplay=true`；前后替代目标指纹完全
相同，零新增行、零更新、零 revision/change-feed 变化。替代 import 完成时旧污染 Replay
指纹不变；随后旧 Simulator stale queue 导致的第二次旧 Replay 漂移如第 1 节记录，不影响
替代 Replay 的任一行。

Release iPhone 17 Pro Max Simulator 使用正常 Dev Auth → Backend → repository →
SQLite v17 路径通过：

- bootstrap：`1/8/126`、`68/58`、`531/531`、126 valuations；
- Spending/Search/local+server Analysis 均为 126；
- Settlement preview 为 68 inputs、58 excluded、balance zero-sum；
- incremental pull 为 0 changes，SQLite 为 126 unique Expenses；
- SQLite 无 finding、payment 或 audit rows。

## 6. Production 安全证明

本次网络目标只有精确 origin
`https://tuqigdxrvrerfewsxqgm.supabase.co` 和本机 Dev Backend。恢复脚本先解析并比较
origin，再创建 Supabase client；使用 `https://production.invalid` 的负向运行返回
`TARGET_REJECTED_BEFORE_CLIENT`。没有读取 Production、没有 Production credential、
没有重新抽取 live data，也没有 Production network/client 创建或写入。

## 7. 后续 Replay 不可变保护与流程

新增精确 ID guard，覆盖两枚 Replay ID 的所有正常本地财务写入口：

- Expense create/update/delete/restore、valuation 和 Expense payment evidence；
- Settlement finalize/Adjustment；
- Transfer Payment record/action/correction。

守卫位于共用 repository/coordinator 及 Expense/Settlement Payment sync-worker 边界，
因此表单、详情页、深链和旧 SQLite durable queue 都不能绕过；只读 bootstrap/pull/
reporting/analysis/preview 仍可用。此保护没有新增 Backend、Schema 或财务语义。测试人员
必须使用新 ID `ec3ae448-3fa5-84a9-a986-655a243cf3ad`；旧 ID 只作污染事故证据，不再用于
acceptance。

若替代 Replay 再次漂移，不做局部修复或删除历史：停止测试，记录新精确指纹，并用新的
固定 namespace/新 Journey ID 生成下一版本替代。当前恢复脚本会拒绝非空替代目标，不能
作为通用 reset 工具。

## 8. 验证命令

- 恢复脚本只读 preflight：PASS；
- 版本化 import + 第二次 idempotent import：PASS；
- TypeScript：PASS；
- targeted ESLint：PASS；
- 6 个相关 Vitest files / 21 tests：PASS；
- prototype-disabled Release Simulator build/install：PASS；
- Mobile Stage 9 online acceptance / SQLite v17：PASS。

本阶段到此停止。没有继续 UI Polish Settlement finalization、Payment lifecycle seeding 或
Round-2 UI 工作。
