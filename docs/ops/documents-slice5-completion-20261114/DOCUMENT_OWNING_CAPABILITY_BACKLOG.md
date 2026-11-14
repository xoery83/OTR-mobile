# Document Owning Capability Backlog

2026-11-14 · MC登记 · **尚未实现的正式产品能力，不是Cloud Sync延期**。本轮只记录，不授权新增Core/SQL/ACL或第二套Writer。

## 已批准来源及优先级

原文位置：`/Users/xoery/Downloads/Document Module Design V1/`，2026-10-23：

- Documents Product Delta：DOC-PRIV-01、DOC-SHARE-01、DOC-CUSTODY-01。Personal Inbox仅Private；Add/Move到Trip不自动共享。Trip默认Private；selected people与whole Trip不同，成员离开/撤权必须影响访问。
- Document Detail Product Delta §4 More：Rename仅改display title；Move仅改当前目录关系；Add保留当前目录；Export不改内部ACL；Remove区分解除关联、删除本地副本与删除原件，未知/受保护证据不能删除。
- Detail UI Blueprint §2、§3、§5：Rename紧凑输入；Move/Add目标选择；Private Inbox无Manage Sharing；正式成功需真实授权结果。验收例为Passport移入Inbox及Insurance增加第二Trip，均不得改变既有业务Item或复制原件。
- 后续Owner Local-First决定优先：原件本地长期保留，稳定Document ID及Document↔Item关系；不引入Source Proof；Cloud Sync单独延期。原文的cloud-only下载场景不属于本轮实现。

源文件SHA256：Product `84a1520c38c3f7f5b9f2ea87f0c5b60c2376518719c8ad39728a4960245c249c`；Detail Product `4ca76270d1f979aadf30bd01411e9eda31808304a88365b596ae13e6e4bd4e6f`；Detail Blueprint `55b0f6e4b2b17eb20c003da967643015169521fdf3db86babbd23e78ae9ba829`。

## 最小Owning交付

| ID / 优先级 | 批准行为 | 真实命令缺口与责任 | 权限 / Receipt要求 | 最小验收 |
|---|---|---|---|---|
| DOC-OWN-01 / P1 | Rename只改显示标题，原件名/字节/hash和业务对象不变 | Core Owner：现有CREATE_DOCUMENT_METADATA仅创建；SET_ITEM_TEXT仅ITEM。缺Document标题更新的owning命令，正式名称待Core确定。 | 现有身份、coreCanRead/coreCanManage及目标revision；原Operation幂等、正式Receipt/reader。不是修改本地accepted snapshot。 | 合法Owner更新→APPLIED→独立读回/冷恢复；无权限、版本冲突、重复/UNKNOWN不二次写；hash和关联不变。 |
| DOC-OWN-02 / P1 | Trip Doc显式Private/selected people/whole Trip；变更替换可管理范围，Make Private撤可管理授权；Inbox不直接Share | Core Owner：SET_OBJECT_VISIBILITY的泛型payload存在，但普通MANUAL selector在非ITEM处拒绝；正常Document Queue/owning授权/Receipt消费尚未交付。不能仅开放UI。 | 保留现有Document管理权和成员有效性；SELECTED_PERSONS保留稳定member IDs；RLS/ACL不扩大；服务端确认后显示成功，错误/UNKNOWN保持原操作对账。 | Owner正例、非Owner及移除成员负例；选人集合替换不累加；Private后旧访问失效；原件/业务关联不变。 |
| DOC-OWN-03 / P1 | Move当前目录关系；Add保留旧目录且新增目标Private；稳定Document不复制字节、不改Canonical Items | Core/Document Owner：无正式directory-membership Add/Move命令。AUTHORIZE_DOCUMENT_COPY不是目录移动；现有Core Document的trip_id/身份含Trip范围，需要owning合同最小兼容，不能直接改trip_id或为成功伪造新Item。 | 源目录和目标Trip访问/管理权均由现有Auth/Parent/Core核验；独立Operation/Receipt和目录读回；不会因Add自动Share。具体最小Migration另行设计/授权，本轮不实施。 | Trip→Inbox和TripA→B Move；Add后两目录可见且原件唯一；跨账号/无权Trip拒绝；原Item/Receipt/hash不变，断线原ID恢复。 |
| DOC-OWN-04 / P1，先定安全语义再启用 | 区分目录移除、仅本机副本移除、原件删除；保护唯一副本和UNKNOWN相关资料 | Core/Document/Custody Owner：HIDE_OBJECT泛型存在但正常Document MANUAL未开放；没有已交付的安全移除/保留字节组合命令及普通Receipt路径。capture.deleteCapture只管legacy本地Capture，不等同正式Core Document Remove。 | 各动作使用对应owner权限、revision和原Operation；不可把metadata hide当作永久原件删除；破坏性动作须明确用户确认，失败状态不得伪成功。 | 各动作前后目录/字节/业务关系分别读回；唯一副本/保护中/UNKNOWN负例；幂等、重启和可用恢复行为；不删除历史Receipt。 |

所有P1为建议的下一产品工作包优先级，不是本轮新Gate或已批准延期。建议顺序Rename→Share/Private→Add/Move→SafeRemove；可复用现有命令时先复用，不建立Document Authority或Writer。

## 与其他条线的依赖

- **Auth C04不是Rename的开发前置**。Share及跨Trip操作消费现有真实会员/撤权/Account generation证书；C04会新增Invite/Claim/Removal变更来源，需要接入后做成员变更回归，但不复制其Membership authority或要求C04完成全部规划才能写上述命令。
- **Import Slice6不是上述写入命令前置**。Slice6后续消费正式Receipt/失败/UNKNOWN状态及Document/Activity导航，不代替命令Owning authority。Slice6当前未完成。
- Core/Document Owner负责命令、权限、版本、Receipt/reader；Native/Documents只接已审接口；MC串行协调共享Backend/SQL与Auth。任何DEV SQL/权限安装仍需当次实际授权。

## 当前UI和代码证据

`CoreDocumentDetail.tsx`的DocumentActions明确禁用上述四类动作；File Information和Export独立可用。`tripCoreV2Commands.ts`：CREATE_DOCUMENT_METADATA326、SET_OBJECT_VISIBILITY251、RECONCILE_ITEM_DOCUMENTS332、HIDE_OBJECT374、isNormalManualCoreCommand568。`tripCoreV2Mutation.ts`72+为原管理谓词；`tripCoreV2.ts`482+为当前Trip-scoped Document模型；`localItemImportOriginals.ts`保留原授权/私有原件读取；`localCaptureInboxRepository.ts`145/183仅为legacy Capture assign/delete，不能当Core Document命令。

本清单不声称任何新命令存在，不把这些缺口标PASS，不要求Cloud Storage先上线。
