> Expanded authoritative backlog: [DOCUMENT_OWNING_CAPABILITY_BACKLOG.md](DOCUMENT_OWNING_CAPABILITY_BACKLOG.md), including approved rules, permission/Receipt and cross-lane dependencies.

# Document 写入能力缺口（独立于 Slice5 只读 UX）

2026-11-14。未改 Core/SQL/ACL、未添加 Document Writer。

| 操作 | 已有合同 / 缺口 | 必需 owning port / 责任模块 | 验收要求 |
|---|---|---|---|
| Rename | `CREATE_DOCUMENT_METADATA` 可设创建标题；没有正常 Document rename 命令。`SET_ITEM_TEXT` 只适用于 ITEM。 | Core Document metadata owning command + revision/Operation/Receipt；Core Owner | 合法用户更新标题、版本冲突拒绝、重复 Operation 幂等、读回/冷恢复，其他字段不变。 |
| Share / Private | 泛型 `SET_OBJECT_VISIBILITY` 存在；`isNormalManualCoreCommand` 在 Document target 返回 false；没有完整普通 Queue/Receipt 消费链。 | Core Document visibility 的普通 owning adapter + 明确合法 ACL；Core Owner | 原权限正负例、版本/撤权、正式回执与独立读回；不能靠 UI 展示变更即报成功。 |
| Add / Move Trip | 当前 Core Document 以 account/Trip/content 标识；无普通 directory membership Add/Move 命令。`AUTHORIZE_DOCUMENT_COPY` 不等于目录移动。 | Document directory association owning command；Core/Document Owner | 保持稳定 Document/原件身份，Add 不自动共享；Move 只变目录关系，不改既有 Item/Receipt；多 Trip ACL 与回滚。 |
| Safe Remove | 泛型 `HIDE_OBJECT` 不构成已交付 Document 清理协议；正常 Document target 不在 MANUAL selector 中。local 原件唯一副本不能默删。 | Document/Custody safe unlink vs byte-retention owning port；Core/Custody Owner | 明确移除目录/保留原件/删除副本的不同语义，拒绝影响未知写入和唯一恢复资料，回执/幂等/读回。 |

代码依据：`src/domain/trip/tripCoreV2Commands.ts`（payloads251/326/332/374，normal selector568+）；`src/data/operations/localItemImportOriginals.ts`（只读授权/原件保管）；`src/data/files/importOriginalFileStore.ts`（account/content 私有存储）。

上述操作当前 UI 明确不可用，不标 PASS。File Information 与显式 Export 只读现有授权信息和校验后的字节，已复用现有系统 Share Sheet。Cloud Sync 保持 Owner-approved deferred。本轮不提出 ACL/SQL 扩张，也不伪造本地成功。
