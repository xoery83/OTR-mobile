# B1 Final Closure — 13 November 2026

**判定：PARTIAL。保存主链已通过；系统级断网冷启动尚未验证。**
本轮新增 DeepSeek 调用 **0**。无 main Merge/Push、Production、RLS、ACL、Role、Grant 或其他 Core 命令授权变更。

| 验收项 | 实际结果 | 证据 |
|---|---|---|
| 最小 Core SQL 修复 | DEV 已提交、独立读回通过；OID/Owner/ACL 不变 | [安装回执](dev-install-result.json) |
| 隔离 PostgreSQL | 24 项 PASS；复现原错误、拒绝非法输入、验证逆操作 | [测试结果](isolated-result.json) |
| 原 PDF Association | 原 Operation APPLIED，原 Item 版本 2→3 | [正式 Receipt / 独立读回](original-operation-readback.json) |
| 唯一性 | 原 Receipt 1 份、有效关联 1 条；Trip 仍 7 Items，含原 Phase A 2 个 | 同上 |
| 客户端 | 原 Queue COMPLETED；Review 显示 Saved and verified | [队列](local-original-queue.json)、[截图](screenshots/p2-saved-review.png) |
| 六格式 / 五个新 Item | 六份原件 SHA 不变；19 个 B1 Core 操作全部 COMPLETED；5 Items / 6 Documents / 7 associations / 19 receipts | [本地核对](final-local-evidence.json) |
| Day Feed / Details / 原件 | 完整 App 实际显示 NZ1、AKL→CHC、Dec17；PDF 关联及原件可打开 | [Day Feed](screenshots/p2-full-day-feed.png)、[Details](screenshots/p2-associated-details.png)、[PDF](screenshots/pdf-network-failure-original.png) |
| WebP 离线原件 | App fetch 被强制拒绝后，实际看见完整原件内容；非系统断网 | [WebP](screenshots/webp-network-failure-original.png) |
| 冷恢复 | 网络失败注入下，正常 My Trips / Day Feed / Item / Document 关联及 PDF、WebP、PNG 原件可读 | [PNG](screenshots/png-network-failure-original.png)；明确仅为 App 网络失败验证 |
| 系统级断网 | NOT_VERIFIED：已检查的模拟器界面/命令无独立无线控制；Mac 非交互 sudo 要求密码，未改全机网络 | [实际限制](system-offline-limit.json) |
| Provider 唯一性 | 仍仅原两次成功 Attempt，总 3,086 tokens；本轮 0 次 | [Host 只读核对](provider-unchanged.json) |

## 精确改动与恢复

仅在 `public.assert_trip_core_v2_aggregate(uuid)` 的现有 MANUAL authored Sparse
P2 分支白名单补入 `RECONCILE_ITEM_DOCUMENTS`。保留原 Actor/Trip/target、SPARSE、
零 Service、两个端点、civil/provenance、参与者等所有条件。现有写入 guard 继续控制
Document/Item 所有权、版本、关联和正式回执；没有扩大其他命令权限。

- [固定 DEV forward SQL](../../../supabase/dev-forward/core-v2/20261113000100_sparse_p2_document_association.sql)
- [精确 CAS 逆事务](rollback.sql)、[工件 SHA256](artifact-sha256.json)
- 函数定义 MD5：`82eb172c0e6cab2a44995e36a5c3087e` → `3224ef85fb4e193bf5293f7ba86d03d1`。
- 原 Operation：`b8d1a89e-7036-817c-9047-dab721cc3af4`。
- 原 Item：`d9ec2529-6516-857f-a31f-325083e68a9f`。
- 正式 Receipt SHA256：`0123e6ba0bfea35866049123215659f9533d0895c217c04143fa9d857fd01736`，已用正式 schema/hash 校验器验证。

使用现有 Host Writer 和合法 LinkedPG，一次事务安装，独立连接读回；Writer 已释放。
原 Receipt 和关联先读到不存在后才恢复。历史失败的退避尚未到期，故临时测试入口调用
现有 Repository 的 **exact-target** `reactivateLongLivedFailures`，再由完整 App 的正常
Sync 提交原 Operation。负载、幂等 ID 均未变；没有直接修改 SQLite，没有重复 Confirm/Analyze。

只发生预期的 Item revision/updated_at 变化，其他原字段逐项对比相同。整个 Trip
最终为 7 Items、7 Documents、9 associations、24 receipts，包含未改动的 Phase A 基线。

隔离测试使用已有 PG17 镜像、无网络、自动销毁。列类型和三个验证函数为固定实际
catalog 前像；scope predicate 为合成 fixture stand-in，仅证明聚合合同差额。
真实 Auth/ACL/Receipt/数据读回由后续原 App→DEV 正常 Sync 证明，不冒充 DEV 越权测试。
逆操作在隔离环境通过；DEV 未实际回滚。逆事务仅恢复函数，不删除已提交关联或 Receipt；
若将来使用会重新引入旧限制，应先评估后续写入影响。

## 收尾和后续

临时恢复入口、fetch 故障注入已撤收，最终测试包恢复正常网络行为；原 Session、SQLite、
Queue、Batch 和六份原件均保留。无需新 Analyze 或 Item。物理 iPad/签名验收单列，未碰 QA179。

剩余 B1 验收仅为系统级断网，需要具有实际系统网络控制能力的执行环境；不能把当前
注入测试升级为系统断网 PASS。

后续按原 B2/B3/B4 计划处理：正常 Trip Home 仍有与实际可读内容不一致的 summary 提示、
Review 再打开后的回执检查等待体验；Documents/Updates/Review Delta 及 P4–P6 真实模型覆盖
未在本轮展开。完整字段级 UPDATE 留在 B4；EML/HTML/ICS 保持既定后续扩展，不是本轮新增阻塞。
