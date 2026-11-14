# Accepted Feature Baseline

2026-11-14 NZDT · Candidate base `5a5ca447`; recovery code checkpoints `8297ab8e`, `95345e4d`, `888a1b4b`. Main Merge/Push HOLD.

本表是四线已验收成果与现有 Main 的受约束并集，不是恢复某个旧快照。优先级：本次 Owner 指令 → 最新明确验收 → owning 合同 → 历史文档。源码存在、默认启用、历史验收与当前运行 PASS 分开记录。
`UNKNOWN` 表示尚未从验收原文固定最后可用 SHA，不能用 `git log -1` 冒充验收证据。这些行可被当前测试覆盖，但不能据此补造历史状态。Operation ID 不当作 Commit。角色是既有 ACL 中的业务角色，不是新授予。

|Feature / Module|原行为|角色 / 必要配置|最后确认来源 Commit|验收证据 / 范围|
|---|---|---|---|---|
|AU01 Auth / Offline launch|有效本机会话离线可进入；失败只暂停同步，不清队列|Guest / Account；SecureStore + 同一原生身份|`8336e4bc`|ACCEPTED；[ACCOUNT_SWITCHING_FOUNDATION_ACCEPTANCE.md](../../../docs/ux/ACCOUNT_SWITCHING_FOUNDATION_ACCEPTANCE.md)|
|AU02 Email OTP|正常邮箱登录；取消/错误不激活错误账户|Account；DEV Auth / 正常邮箱|`UNKNOWN`|ACCEPTED；[README.md](../../../docs/ops/auth-apple-native-20261113/README.md)|
|AU03 Google|合法 Bundle Client + nonce；缺配置不借用其他身份|Account；原 Google iOS Client / OtrGoogleSignIn|`UNKNOWN`|ACCEPTED；[README.md](../../../docs/ops/auth-apple-native-20261113/README.md)|
|AU04 Apple|原生 Apple 授权、nonce、正常账户交换；不按邮箱合并|Account；模块、entitlement、合法 App ID、系统 Apple Account|`e013bf5d`|ACCEPTED；[README.md](../../../docs/ops/auth-apple-native-20261113/README.md)|
|AU05 Account switching|明确切换；A→B→A 旧请求隔离；保留各账户队列|Account；正常已记住会话|`8336e4bc`|ACCEPTED；[GLOBAL_MENU_ACCOUNT_SWITCHING_ACCEPTANCE.md](../../../docs/ux/GLOBAL_MENU_ACCOUNT_SWITCHING_ACCEPTANCE.md)|
|AU06 Guest Adoption|原 Guest PREPARED/PUBLISHED、原 ID 恢复；不复制凭据|Guest → Account；DEV Adoption 配置 + owning Backend|`237e4c66`|ACCEPTED；[README.md](../../../docs/ops/auth-apple-native-20261113/README.md)|
|AU07 Profile / identity|既有显示名与身份分离；账号链接必须显式确认|Account；正常 Auth；未接入的私有云配置不冒充完成|`efb38d83`|ACCEPTED；[README.md](../../../docs/ops/auth-apple-native-20261113/README.md)|
|TR01 My Trips / Create|正常创建旅行、发现当前有权旅行；无固定 QA 身份|Guest / Account；普通 DEV transport、NORMAL_CLOUD_SYNC|`efb38d83`|ACCEPTED；[README.md](../../../docs/ops/auth-apple-native-20261113/README.md)|
|TR02 Trip metadata edit|名称、目的地、日期；原 CAS / Receipt；合法已确认 base 不重复在线读取|有编辑权的 Actor；owning Parent / 本地 Trip + 版本|`efb38d83`|ACCEPTED；[README.md](../../../docs/ops/auth-apple-native-20261113/README.md)|
|TR03 Trip Cover|内置图与本地照片；自动选择、取消、原 Account/Trip 持久化|有权读取 Trip 的本地 Actor；既有 Personal Cover / 文件权限|`UNKNOWN`|ACCEPTED；[OTR_TRIP_HOME_VISUAL_ACCEPTANCE_REPORT_2026-10-14.md](../../../docs/beta/visual-acceptance/OTR_TRIP_HOME_VISUAL_ACCEPTANCE_REPORT_2026-10-14.md)|
|TR04 Currency|Owner 可通过既有流程更改；Member 只读；Finalized 仍锁定|Guest / Owner / Member；Ledger Actor / 结算锁 / 预览|`91e40d04`|ACCEPTED；[CURRENCY_FX_DOMAIN_AUDIT.md](../../../docs/ledger/CURRENCY_FX_DOMAIN_AUDIT.md)|
|TR05 People / Travelers|已接通的名单、命名旅客、本人昵称权限不退回旧快照|Account / 合法管理者；Person / Parent owning 端口|`efb38d83`|ACCEPTED；[README.md](../../../docs/ops/auth-apple-native-20261113/README.md)|
|DY01 Trip Home / navigation|真实 Hero、业务 widgets、原页面返回；Summary 不假称所有详情不可用|Guest / Account；当前 Trip + 正常 Reader|`eb2b0c5f`|ACCEPTED；[OTR_TRIP_HOME_VISUAL_ACCEPTANCE_REPORT_2026-10-14.md](../../../docs/beta/visual-acceptance/OTR_TRIP_HOME_VISUAL_ACCEPTANCE_REPORT_2026-10-14.md)|
|DY02 Day Feed|真实日期/时间/地点/类型；Today/Tomorrow；背景连续；Focus/Details 返回|有 Trip 读取权；正常 Core / 本地投影|`3def75e9`|ACCEPTED；[OTR_TRIPS_COMPACT_READABLE_NATIVE_ACCEPTANCE_2026-10-14.md](../../../docs/beta/visual-acceptance/OTR_TRIPS_COMPACT_READABLE_NATIVE_ACCEPTANCE_2026-10-14.md)|
|DY03 Details / Immersive|原对象身份、字段和可用操作；Back 返回原上下文|合法读者 / 编辑者；Core ownership / 协议|`UNKNOWN`|ACCEPTED；[FOUR_LANE_DELIVERY_MATRIX.md](../../../docs/integration/four-lane-20261114/FOUR_LANE_DELIVERY_MATRIX.md)|
|DY04 Search / Places|有权结果；native Place matching；不可用结果不伪造坐标|Guest / Account；PlaceSearch 原生模块 / Core Reader|`faed8181`|ACCEPTED；[OTR_TRIPS_SHELL_VISUAL_ACCEPTANCE_REPORT_2026-10-14.md](../../../docs/beta/visual-acceptance/OTR_TRIPS_SHELL_VISUAL_ACCEPTANCE_REPORT_2026-10-14.md)|
|P1 P1 Plan|现有 NEW / Edit / LINK / Document 关联；只保存 Core 已支持字段；缺失事实不伪造|Owner / Member 按真实 Item ACL；Guest 仅已批准本地能力；Core capability / MANUAL 或 IMPORT / target revision|`a28ad66d`|ACCEPTED；[FOUR_LANE_DELIVERY_MATRIX.md](../../../docs/integration/four-lane-20261114/FOUR_LANE_DELIVERY_MATRIX.md)|
|P2 P2 Flight|现有 NEW / Edit / LINK / Document 关联；只保存 Core 已支持字段；缺失事实不伪造|Owner / Member 按真实 Item ACL；Guest 仅已批准本地能力；Core capability / MANUAL 或 IMPORT / target revision|`UNKNOWN`|ACCEPTED；[README.md](../../../docs/ops/b1-p2-document-20261113/README.md)|
|P3 P3 Stay|现有 NEW / Edit / LINK / Document 关联；只保存 Core 已支持字段；缺失事实不伪造|Owner / Member 按真实 Item ACL；Guest 仅已批准本地能力；Core capability / MANUAL 或 IMPORT / target revision|`a28ad66d`|ACCEPTED；[FOUR_LANE_DELIVERY_MATRIX.md](../../../docs/integration/four-lane-20261114/FOUR_LANE_DELIVERY_MATRIX.md)|
|P4 P4 Rental|现有 NEW / Edit / LINK / Document 关联；只保存 Core 已支持字段；缺失事实不伪造|Owner / Member 按真实 Item ACL；Guest 仅已批准本地能力；Core capability / MANUAL 或 IMPORT / target revision|`a28ad66d`|ACCEPTED；[FOUR_LANE_DELIVERY_MATRIX.md](../../../docs/integration/four-lane-20261114/FOUR_LANE_DELIVERY_MATRIX.md)|
|P5 P5 Transport|现有 NEW / Edit / LINK / Document 关联；只保存 Core 已支持字段；缺失事实不伪造|Owner / Member 按真实 Item ACL；Guest 仅已批准本地能力；Core capability / MANUAL 或 IMPORT / target revision|`a28ad66d`|ACCEPTED；[FOUR_LANE_DELIVERY_MATRIX.md](../../../docs/integration/four-lane-20261114/FOUR_LANE_DELIVERY_MATRIX.md)|
|P6 P6 Activity|现有 NEW / Edit / LINK / Document 关联；只保存 Core 已支持字段；缺失事实不伪造|Owner / Member 按真实 Item ACL；Guest 仅已批准本地能力；Core capability / MANUAL 或 IMPORT / target revision|`a28ad66d`|ACCEPTED；[FOUR_LANE_DELIVERY_MATRIX.md](../../../docs/integration/four-lane-20261114/FOUR_LANE_DELIVERY_MATRIX.md)|
|IM01 Capture / six formats|TXT/PDF/PNG/JPEG/WebP/静态 GIF；≤5；Photos 多选；原件持久保存|合法 Trip Actor；LocalFirst + installed file/image modules|`9e608340`|ACCEPTED；[README.md](../../../docs/ops/b1-p2-document-20261113/README.md)|
|IM02 Composer / draft|紧凑菜单；Inline Add、未 Add 文字一次提交；Close/冷恢复；Account/Trip 隔离|Guest / Account；现有私有原件 / draft repository|`5af027b`|ACCEPTED；[IMPORT_V3_B2_INCREMENTAL_DELIVERY_PLAN.md](../../../docs/beta/IMPORT_V3_B2_INCREMENTAL_DELIVERY_PLAN.md)|
|IM03 Analyze / durable Task|真实 DeepSeek 单 Attempt；持久 START_DURABLE；UNKNOWN 原 ID 查询，不自动重发|正常编辑 Actor；Backend Key / 正常 ACL；无 CP14/QA scope 前置|`c452b45`|ACCEPTED；[README.md](../../../docs/ops/b1-p2-document-20261113/README.md)|
|IM04 Auto / DEV confirm|正式可信 NEW/LINK 自动；开发一次 Batch Confirm；同一 Queue/Receipt|合法 Core Actor；DEV confirm 显式配置 / owning IMPORT|`72c020e`|ACCEPTED；[README.md](../../../docs/ops/import-ux-c2-20261114/README.md)|
|IM05 Exception Review|歧义/缺失/冲突才 Review；TYPE05；ABSTAIN；不覆盖手工字段|合法 Core Actor；已支持字段 / Item target CAS|`72c020e`|ACCEPTED；[README.md](../../../docs/ops/import-ux-c2-20261114/README.md)|
|IM06 Activity / Results|同 Batch 恢复；正式对象去重；Created/Linked 与候选分离；UNKNOWN 非失败|Batch Actor；真实 Task/Queue/Receipt|`3227ead90`|ACCEPTED；[README.md](../../../docs/ops/import-ux-c2-20261114/README.md)|
|IM07 Documents / N→M|LOCAL_ONLY metadata + add-only Item 关联；关联待完成不重复创建 Item|合法 Document / Item Actor；RLS / ACL / 原关联 Operation|`UNKNOWN`|ACCEPTED；[README.md](../../../docs/ops/b1-p2-document-20261113/README.md)|
|IM08 Import Sync / Cold|原任务、原件、Receipt、SQLite 冷恢复；跨设备无本机文件要如实说明|原 Account / Trip；既有本地 Store；不复制 iPad 数据|`3f8fb25`|ACCEPTED；[README.md](../../../docs/ops/b1-p2-document-20261113/README.md)|
|LE01 Ledger spending|Mine/Group、真实金额、分析/搜索、唯一正常添加入口|Owner / Member / Read-only；Ledger Actor 与 Journey|`UNKNOWN`|ACCEPTED；[LEDGER_UI_UX_POLISH_ENTRY_PART2_ACCEPTANCE.md](../../../docs/ledger/LEDGER_UI_UX_POLISH_ENTRY_PART2_ACCEPTANCE.md)|
|LE02 Expense CRUD|合法新建/编辑/删除及冲突；原 Operation / 本地先写 / Sync|按 Expense ACL；Ledger mutation / Receipt|`UNKNOWN`|ACCEPTED；[LEDGER_2_0_STAGE_10_ACCEPTANCE.md](../../../docs/ledger/LEDGER_2_0_STAGE_10_ACCEPTANCE.md)|
|LE03 Receipt / attachments|真实原件、OCR 显式调用、恢复；不因审计触发付费扫描|合法 Ledger Actor；文件权限 / 既有 OCR 配置|`UNKNOWN`|ACCEPTED；[LEDGER_2_0_STAGE_9_ACCEPTANCE.md](../../../docs/ledger/LEDGER_2_0_STAGE_9_ACCEPTANCE.md)|
|LE04 FX / rates|展示估算不修改 Expense；真实有效期/币对；更改使用正式预览|Owner / Member；既有费率与锁；不发明汇率|`UNKNOWN`|ACCEPTED；[CURRENCY_FX_DOMAIN_AUDIT.md](../../../docs/ledger/CURRENCY_FX_DOMAIN_AUDIT.md)|
|LE05 Settlement preview|Overview / 个人预览 / 历史 / 读回；角色与结算锁保持|Owner / Member；原 Ledger snapshot|`UNKNOWN`|ACCEPTED；[SETTLEMENT_2_0_PHASE_6_ACCEPTANCE.md](../../../docs/ledger/SETTLEMENT_2_0_PHASE_6_ACCEPTANCE.md)|
|LE06 Settlement finalization|既有显式确认与幂等；本轮禁止正式 Confirm|Owner 按合同；版本、权限、原 Receipt|`UNKNOWN`|ACCEPTED；[SETTLEMENT_FINAL_VERSION_REVISION_ACCEPTANCE.md](../../../docs/ledger/SETTLEMENT_FINAL_VERSION_REVISION_ACCEPTANCE.md)|
|LE07 Personal payments / Review|既有本人决定、FX、可见性及 UNKNOWN|本人 / 有权限成员；原 Payment 与 Review owning 合同|`UNKNOWN`|ACCEPTED；[PERSONAL_PAYMENT_FX_SLICE_D_ACCEPTANCE.md](../../../docs/ledger/PERSONAL_PAYMENT_FX_SLICE_D_ACCEPTANCE.md)|
|LE08 Export / history|原财务数据导出与历史，不在审计中确认新结算|合法读者；现有 export 文件机制|`UNKNOWN`|ACCEPTED；[LEDGER_2_0_STAGE_10_ACCEPTANCE.md](../../../docs/ledger/LEDGER_2_0_STAGE_10_ACCEPTANCE.md)|
|SY01 Queue / Wake / idempotence|原 Operation、Receipt、UNKNOWN；自动唤醒，关联等待 Item|所有已批准本地 Principal；原 Queue / account generation|`a28ad66d`|ACCEPTED；[SHARED_CONFLICT_RESOLUTION.md](../../../docs/integration/four-lane-20261114/SHARED_CONFLICT_RESOLUTION.md)|
|SY02 Downstream / access loss|普通 pull、discovery、前台更新、撤权不复活；version 源不冒充启用|Account；正常 Reader / Account generation|`63b82873`|ACCEPTED；[SHARED_CONFLICT_RESOLUTION.md](../../../docs/integration/four-lane-20261114/SHARED_CONFLICT_RESOLUTION.md)|
|SY03 SQLite / offline|75→76/77/78→79；两种真实76历史；保留原 ID/Queue/FK；离线恢复|Guest / Account；同一私有持久库 / Keychain 身份|`133196d2`|ACCEPTED；[SHARED_CONFLICT_RESOLUTION.md](../../../docs/integration/four-lane-20261114/SHARED_CONFLICT_RESOLUTION.md)|
|PH01 Local Photos|原本地照片、封面选择、取消/保留；不自动云同步|有权 Trip Actor；私有文件库 / Photo permission|`UNKNOWN`|ACCEPTED；[OTR_TRIP_PHOTOS_NATIVE_ACCEPTANCE_REPORT_2026-10-14.md](../../../docs/beta/visual-acceptance/OTR_TRIP_PHOTOS_NATIVE_ACCEPTANCE_REPORT_2026-10-14.md)|
|UP01 Updates|既有合法通知/Needs Attention/返回；未完成 Slice6 不冒充实现|Account；owning Reader / account scope|`UNKNOWN`|ACCEPTED；[IMPORT_V3_B2_INCREMENTAL_DELIVERY_PLAN.md](../../../docs/beta/IMPORT_V3_B2_INCREMENTAL_DELIVERY_PLAN.md)|
|MC01 MCP discovery / read|SDK guide、能力、Trip/Item read，权限不足关闭|获授权 Consumer；既有 OAuth/Scope/ports；默认关闭|`2be99d7a`|ACCEPTED；[ACCEPTANCE.md](../../../docs/mcp/phase4b/ACCEPTANCE.md)|
|MC02 MCP writes / batch|已支持字段 Preview/Confirm/Apply、CAS、原 Receipt 与 UNKNOWN|获授权 Consumer；显式用户确认 / owning Core|`2be99d7a`|ACCEPTED；[ACCEPTANCE.md](../../../docs/mcp/phase4b/ACCEPTANCE.md)|
|MC03 MCP people / expense|已通过的本地 Adapter；无 owning port 不暴露真实能力|获授权 Consumer；真实端口；本轮不得新授权|`2be99d7a`|ACCEPTED；[ACCEPTANCE.md](../../../docs/mcp/phase4b/ACCEPTANCE.md)|
|DF01 Invite / Claim full Native|正常邀请/Claim owning 组合尚未正式验收；Preview 不是产品完成|按原合同；保持原已批准限制|`UNKNOWN`|DEFERRED_OR_EVIDENCE_GAP；[DEFERRED_CAPABILITIES.md](../../../docs/integration/four-lane-20261114/DEFERRED_CAPABILITIES.md)|
|DF02 Private profile cloud editor|源码明确 unmounted local-draft candidate；不得恢复为云写入|按原合同；保持原已批准限制|`UNKNOWN`|DEFERRED_OR_EVIDENCE_GAP；[DEFERRED_CAPABILITIES.md](../../../docs/integration/four-lane-20261114/DEFERRED_CAPABILITIES.md)|
|DF03 Version / Realtime activation|只验收源码与可选组合；运行依赖未注入，不自动开启|按原合同；保持原已批准限制|`UNKNOWN`|DEFERRED_OR_EVIDENCE_GAP；[DEFERRED_CAPABILITIES.md](../../../docs/integration/four-lane-20261114/DEFERRED_CAPABILITIES.md)|
|DF04 MCP complete Hosted Consumer|本地384项与有限模型理解不等于真实Consumer全链|按原合同；保持原已批准限制|`UNKNOWN`|DEFERRED_OR_EVIDENCE_GAP；[DEFERRED_CAPABILITIES.md](../../../docs/integration/four-lane-20261114/DEFERRED_CAPABILITIES.md)|
|DF05 Import Slice5/6 / full UPDATE|Owner 尚未授权下一 Slice / 完整字段编辑|按原合同；保持原已批准限制|`UNKNOWN`|DEFERRED_OR_EVIDENCE_GAP；[DEFERRED_CAPABILITIES.md](../../../docs/integration/four-lane-20261114/DEFERRED_CAPABILITIES.md)|
|DF06 Document Cloud Sync|Owner 明确 LOCAL_ONLY，跨设备无原件是产品边界|按原合同；保持原已批准限制|`UNKNOWN`|DEFERRED_OR_EVIDENCE_GAP；[DEFERRED_CAPABILITIES.md](../../../docs/integration/four-lane-20261114/DEFERRED_CAPABILITIES.md)|
|DF07 Flexible / TTR activation|只恢复已批准的本地展示/几何与选择；未验收 owning Runtime 不开启|按原合同；保持原已批准限制|`UNKNOWN`|DEFERRED_OR_EVIDENCE_GAP；[DEFERRED_CAPABILITIES.md](../../../docs/integration/four-lane-20261114/DEFERRED_CAPABILITIES.md)|
|DF08 P2 formal manual opt-in|须核实已验收启用范围；不能将完整表单源码等同已安装 owning 权限|按原合同；保持原已批准限制|`UNKNOWN`|DEFERRED_OR_EVIDENCE_GAP；[DEFERRED_CAPABILITIES.md](../../../docs/integration/four-lane-20261114/DEFERRED_CAPABILITIES.md)|

## 原始引用与证据缺口
逐项主要源码与缺失路径见 [accepted-features.json](accepted-features.json)。缺失路径必须继续核对，不能算 PASS。历史已验收范围与当前实测状态以 FUNCTIONAL_RECOVERY_MATRIX 为准。
原四线 HEAD/交付关系沿用 FOUR_LANE_DELIVERY_MATRIX；未重复盘点423分支。AUTH Apple 物理证据属于原注册 Bundle/构建，不迁移为本次 Simulator 登录成功。B1 保存证据属于原 iPad/模拟器，不迁移为当前 iPhone 私有原件。
