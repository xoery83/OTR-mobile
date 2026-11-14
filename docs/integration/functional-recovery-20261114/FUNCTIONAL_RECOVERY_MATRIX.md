# Product Functional Integrity Report / Recovery Matrix

2026-11-14 · Overall **NO_GO** · Product source `888a1b4b`.

Test health 与产品完整性分开。每一行仅证明列出的范围；PASS 不外推到未执行的角色/CRUD。BLOCKED 包括环境不足、实际未执行和缺历史来源，具体原因见右栏；不等于所有功能都坏了。历史可信 SHA 不明的行仍 UNKNOWN，不补造。54 组中 46 组 accepted、8 组 deferred/evidence gap；这是登记覆盖率，不是 100% 功能通过率。

- 完整 Native App：主 iPhone 原数据保留；独立 fresh Guest 无复制 Keychain/Session/SQLite。
- 正常合成 Account Trip `285ffde2…`，P1 `442f1586…`；NEW/EDIT Receipt 与 operation 对应，见 `evidence/account-runtime-readback.json`。
- Guest P1 仅 local pending intents，没有云 APPLIED Receipt，不能冒充正式保存。
- Root2通过独立PostgreSQL只读核对了新P1、两条Receipt、Trip改名和Expense缺回执快照；其余功能不能外推。没有本轮真实Provider/完整Apple登录/系统级断网证明。

|Feature|入口|角色权限实测|Create/Edit/Delete|Save / Readback|冷恢复 / 离线|跨模块|最终状态与证据|
|---|---|---|---|---|---|---|---|
|AU01 Auth / Offline launch|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：正常 Account/Guest 冷启动 PASS；系统级断网和过期 token 的当前 Native E2E BLOCKED。 `src/data/auth/authRepository.ts`、`src/data/bootstrap/bootstrapApplication.ts`|
|AU02 Email OTP|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：OTP UI / owning tests 存在；本轮未执行真实邮箱验证码交换。 `src/features/auth/EmailOtpSignIn.tsx`、`src/data/auth/devSupabaseAuth.ts`|
|AU03 Google|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：完整 Native Google module/入口存在；当前 custom Bundle 的实际 OAuth client E2E 未证明。 `src/data/auth/googleSignIn.ts`、`src/features/auth/GoogleSignInButton.tsx`|
|AU04 Apple|PASS|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：系统 Apple 授权入口 PASS；系统要求 Settings 登录 Apple Account，完整登录 BLOCKED。历史物理登录不转记本次通过。 `src/data/auth/appleSignIn.ts`、`src/features/auth/AppleSignInButton.tsx`|
|AU05 Account switching|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：generation/ABA 定向测试 PASS；本轮没有第二个合法实际账号执行 A→B→A。 `src/components/AccountManagementScreen.tsx`、`src/data/auth/accountSwitchCoordinator.ts`|
|AU06 Guest Adoption|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：原 Guest Adoption 验收与原 IDs 保留；本轮新 Guest 未触发 publication/adoption。 `src/data/auth/guestAdoptionRecovery.ts`、`src/components/AccountManagementScreen.tsx`|
|AU07 Profile / identity|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/data/auth/accountProfileRepository.ts`、`src/features/auth/AppleAccountConnection.tsx`|
|TR01 My Trips / Create|PASS|current normal Actor PASS / other roles BLOCKED|NEW PASS / EDIT PASS / DELETE BLOCKED (not executed)|PASS (normal Receipt + SQLite; P1/Trip metadata independent PG verified)|PASS cold launch / BLOCKED system offline|BLOCKED|**BLOCKED**：正常 Account 创建新合成 Trip 已获正式接受；独立 Guest 创建/冷恢复 PASS；删除未执行。 `src/features/day-feed/LocalTripWorkspace.tsx`、`src/data/repositories/tripRepository.ts`|
|TR02 Trip metadata edit|PASS|current normal Actor PASS / other roles BLOCKED|EDIT PASS / other operations outside this feature|PASS (normal Receipt + SQLite; P1/Trip metadata independent PG verified)|BLOCKED|PASS (Ledger title fixed; full Native cold launch)|**BLOCKED**：新合成 Account Trip 改名正式Receipt与独立PG PASS；888a1b4b修复Ledger metadata投影，完整Native冷启动账本新名PASS；Guest改名也保留。 `src/features/day-feed/TripBasicEditor.tsx`、`src/features/day-feed/LocalTripWorkspace.tsx`|
|TR03 Trip Cover|PASS|BLOCKED|CHANGE PASS in stated scope / other roles BLOCKED|PASS|PASS cold launch / BLOCKED system offline|PASS|**PASS**：实际 Account 封面 picker/取消 PASS；Guest Coast Cover 写入同作用域，冷启动仍在，未上传原件。 `src/features/day-feed/TripCoverPicker.tsx`、`src/data/repositories/tripPersonalCoverRepository.ts`|
|TR04 Currency|PASS|BLOCKED|CHANGE PASS in stated scope / other roles BLOCKED|BLOCKED|PASS cold launch / BLOCKED system offline|BLOCKED|**BLOCKED**：实际 Account currency picker PASS；Guest NZD→USD 与冷恢复 PASS；Member/Finalized 只有 owning tests，未实机变更。 `src/features/ledger/CurrencySettingsScreen.tsx`、`src/data/repositories/ledgerCurrencyRepository.ts`|
|TR05 People / Travelers|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/features/people/ServerParentTripPeople.tsx`、`src/data/repositories/tripPersonCloudCreateRepository.ts`|
|DY01 Trip Home / navigation|PASS|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：正常 My Trips→Home→全局菜单→My Trips PASS；原 Trip/Item 可访问；新 Trip Home 的部分 setup 行暂 disabled，未泛化为所有功能正常。 `src/features/trip/TripHomeFrame.tsx`、`src/features/day-feed/TripScreen.tsx`|
|DY02 Day Feed|PASS|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：5c28077e恢复无Trip开始日期时的正式TripDayHeading和渐变，无虚构Day ordinal；完整Native重建/原位安装，同一无日期Trip及原有有日期Trip均实际查看PASS。32项旧render失败仍在，完整字号/滚动/视觉覆盖未闭合。|
|DY03 Details / Immersive|PASS|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：真实原 Hotel Details / 返回及新 P1 Details/编辑 PASS；其余类型的全部权限动作尚未逐一执行。 `src/features/day-feed/P1Detail.tsx`、`src/features/day-feed/P2Detail.tsx`|
|DY04 Search / Places|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/features/trip-search/TripSearchScreen.tsx`、`src/features/place-search/PlaceSearchSheet.tsx`|
|P1 P1 Plan|PASS|current normal Actor PASS / other roles BLOCKED|NEW PASS / EDIT PASS / DELETE BLOCKED (not executed)|PASS (normal Receipt + SQLite; P1/Trip metadata independent PG verified)|PASS cold launch / BLOCKED system offline|BLOCKED|**BLOCKED**：正常 Account NEW 与 EDIT 均正式 COMPLETED，两条 Core Receipt，同 Item revision 1→2；正常 UI 与冷启动看到新标题。Root2独立PG NEW/EDIT APPLIED与revision1→2 PASS；DELETE未执行。 `src/features/day-feed/P1Detail.tsx`、`src/domain/trip/tripCoreV2Mutation.ts`|
|P2 P2 Flight|PASS|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：正常 Account Flight 菜单可进入，已有 B1 PDF Flight 证据保留；本轮新建/编辑/删除、formal opt-in 未真实提交。 `src/features/day-feed/P2Detail.tsx`、`src/domain/trip/tripCoreV2Mutation.ts`|
|P3 P3 Stay|PASS|current normal Actor PASS / other roles BLOCKED|NEW PASS / EDIT BLOCKED / DELETE BLOCKED|PASS: formal Receipt + independent PostgreSQL NEW|PASS cold launch / BLOCKED system offline|PASS: Home/Day Feed; other navigation BLOCKED|**BLOCKED**：NEW 正常 App→正式 APPLIED/独立PG rev1 PASS；Details入住/退房日期与地点 PASS；冷启动 Day Feed保留。EDIT/DELETE及其他角色尚未实测。|
|P4 P4 Rental|PASS|current normal Actor PASS / other roles BLOCKED|NEW PASS / EDIT BLOCKED / DELETE BLOCKED|PASS: formal Receipt + independent PostgreSQL NEW|PASS cold launch / BLOCKED system offline|PASS: Home/Day Feed; other navigation BLOCKED|**BLOCKED**：NEW 正常 App→正式 APPLIED/独立PG rev1 PASS；Details明确取还车日期及14:02/14:02 PASS；冷启动 Day Feed保留。EDIT/DELETE及其他角色尚未实测。|
|P5 P5 Transport|PASS|current normal Actor PASS / other roles BLOCKED|NEW PASS / EDIT PASS / DELETE BLOCKED|PASS: formal Receipt + independent PostgreSQL NEW|PASS cold launch / BLOCKED system offline|PASS: Home/Day Feed; other navigation BLOCKED|**BLOCKED**：NEW正式APPLIED/独立PG rev1 PASS；同Item EDIT正式客户端Receipt/rev2 PASS；Details及冷启动Day Feed PASS。首次草稿被保护拒绝且无命令落盘，关闭重开后成功；首次准确错误码未记录，根因仍未证明。DELETE及其他角色BLOCKED。|
|P6 P6 Activity|PASS|current normal Actor PASS / other roles BLOCKED|NEW PASS / EDIT BLOCKED / DELETE BLOCKED|PASS: formal Receipt + independent PostgreSQL NEW|PASS cold launch / BLOCKED system offline|PASS: Home/Day Feed; other navigation BLOCKED|**BLOCKED**：NEW正常App→正式APPLIED/独立PG rev1 PASS；冷启动Day Feed保留，无虚构时间。Details/EDIT/DELETE及其他角色尚未实测。|
|IM01 Capture / six formats|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：原 B1 六格式原件仍保留；当前完整 Native module/file intake 已编译；本轮未重新选择六格式。 `src/native/capturePicker.ts`、`src/features/capture/CaptureComposer.tsx`|
|IM02 Composer / draft|PASS|BLOCKED|BLOCKED|PASS|PASS cold launch / BLOCKED system offline|PASS|**PASS**：真实 Account 原 UX-C2 未提交草稿在完整 rebuild/冷启动后恢复；打开→关闭不提交，9 个原私有文件 hash 不变。 `src/features/capture/CaptureComposer.tsx`、`src/data/repositories/captureDraftRepository.ts`|
|IM03 Analyze / durable Task|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：当前无真实 Provider 调用；不重放原 B1/QA179；Task/UNKNOWN 代码测试不替代真机 Analyze。 `backend/src/universalV3Execution.ts`、`src/features/capture/useUniversalCapture.ts`|
|IM04 Auto / DEV confirm|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：Slice3 已验收闭包保留；本轮未新的 Confirm/Save 原 Batch。 `src/data/operations/universalV3Review.ts`、`src/data/repositories/importSubmissionRepository.ts`|
|IM05 Exception Review|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：UX-C2 已验收代码保留；本轮实际异常 Review 全交互未复跑。 `src/features/capture/ImportExceptionReviewScreen.tsx`、`src/data/operations/universalV3Review.ts`|
|IM06 Activity / Results|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：UX-C1/C2 已验收真实回执/UI证据保留；未把临时只读入口计为正式生产入口。 `src/features/capture/CaptureProgress.tsx`、`src/features/capture/UniversalCaptureResults.tsx`|
|IM07 Documents / N→M|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：原 14 条 Item Document links/9 Documents 保留；本轮未重做 B1 关联或重复 Save。 `src/features/documents/ImportDocumentsPanel.tsx`、`src/data/repositories/importDocumentsRepository.ts`|
|IM08 Import Sync / Cold|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/data/sync/tripNormalSync.ts`、`src/data/sync/tripNormalQueueActivity.ts`|
|LE01 Ledger spending|PASS|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：正常 Account Ledger 打开，重复底部 Add Expense 已移除；新 NZD1 local expense 显示。 `src/features/ledger/LedgerStage6Screen.tsx`|
|LE02 Expense CRUD|PASS|current normal Actor PASS / other roles BLOCKED|CREATE local PASS / cloud FAIL / EDIT,DELETE BLOCKED|FAIL (Backend 503; local retained)|BLOCKED|BLOCKED|**BLOCKED**：正常 UI 新建合成 NZD1 Expense 本地保存 PASS；原 Operation 远端 503，正式 Receipt/Readback BLOCKED。 `src/features/ledger/LedgerExpenseEntryScreen.tsx`、`src/features/ledger/LedgerExpenseDetailScreen.tsx`|
|LE03 Receipt / attachments|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/components/ReceiptCaptureScreen.tsx`、`src/data/files/receiptFileStore.ts`|
|LE04 FX / rates|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：注入时钟/报价分类修复，测试 PASS；不修改原金额、费用策略或自动入账。 `src/data/operations/referenceRateEstimate.ts`、`src/features/ledger/ExpenseFxDetails.tsx`|
|LE05 Settlement preview|PASS|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：Settlement preview 正常入口/原上下文可读；未执行正式 Confirm。 `src/features/ledger/SettlementReadinessScreen.tsx`|
|LE06 Settlement finalization|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：本轮禁止未经授权正式 Settlement Confirm；测试与历史验收保留，不标记当前真机通过。 `src/data/repositories/ledgerSettlementRepository.ts`|
|LE07 Personal payments / Review|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/features/ledger/PersonalSettlementReviewScreen.tsx`|
|LE08 Export / history|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/data/files/settlementExportFileStore.ts`|
|SY01 Queue / Wake / idempotence|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：本次正常 Account Trip/P1 NEW/P1 EDIT 经原 Queue/Wake 完成；Expense 503 保留原操作；未清队列。 `src/data/sync/tripNormalCoordinator.ts`、`src/data/sync/tripNormalQueueActivity.ts`|
|SY02 Downstream / access loss|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：普通读取与权限撤销测试保留；Realtime/Version 服务激活仍 deferred；当前未验证多用户实时回归。 `src/data/sync/tripDownstreamCoordinator.ts`|
|SY03 SQLite / offline|BLOCKED|BLOCKED|BLOCKED|BLOCKED|PASS cold launch / BLOCKED system offline|BLOCKED|**BLOCKED**：Migration 79、两种历史76升级/重开测试 PASS；原选定8表和9私有文件保持；新 Guest/Account 冷启动状态恢复。 `src/data/db/fourLaneMigrationCompatibility.test.ts`、`src/data/auth/guestSqliteSchema.ts`|
|PH01 Local Photos|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/features/day-feed/LocalTripPhotos.tsx`、`src/data/repositories/tripPhotoRepository.ts`|
|UP01 Updates|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/features/updates/UpdatesInboxScreen.tsx`|
|MC01 MCP discovery / read|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：本地 MCP SDK/discovery/read checks PASS；无当前真实 Hosted Consumer/OAuth。 `mcp/server.ts`、`mcp/read.ts`|
|MC02 MCP writes / batch|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：本地 Preview/Confirm/Apply/CAS/UNKNOWN checks PASS；真实 Consumer 写入未执行，默认关闭不变。 `mcp/mutation.ts`、`mcp/batch.ts`|
|MC03 MCP people / expense|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED**：本地已验收 adapters 保留；没有 owning ports 的费用/People 不自动公开。 `mcp/peopleExpenseAdapter.ts`、`mcp/domainAdapter.ts`|
|DF01 Invite / Claim full Native|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED (approved deferral / missing acceptance evidence)**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/features/people/InviteClaimPreviewScreen.tsx`|
|DF02 Private profile cloud editor|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED (approved deferral / missing acceptance evidence)**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/features/auth/AccountPrivateProfileScreen.tsx`|
|DF03 Version / Realtime activation|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED (approved deferral / missing acceptance evidence)**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/data/sync/tripDownstreamCoordinator.ts`|
|DF04 MCP complete Hosted Consumer|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED (approved deferral / missing acceptance evidence)**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `mcp/oauth.ts`|
|DF05 Import Slice5/6 / full UPDATE|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED (approved deferral / missing acceptance evidence)**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `docs/beta/IMPORT_V3_B2_INCREMENTAL_DELIVERY_PLAN.md`|
|DF06 Document Cloud Sync|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED (approved deferral / missing acceptance evidence)**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/features/documents/ImportDocumentsPanel.tsx`|
|DF07 Flexible / TTR activation|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED (approved deferral / missing acceptance evidence)**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/features/day-feed/flexibleSnapshot.ts`|
|DF08 P2 formal manual opt-in|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|BLOCKED|**BLOCKED (approved deferral / missing acceptance evidence)**：代码与历史验收存在；本轮完整 App 的该功能操作、角色切换与服务端读回尚未执行，不能因测试覆盖推定正常。 `src/data/sync/nativeTripQaScope.ts`|

## 当前真实风险和下一动作

1. Ledger Create远端503：原异常旧Backend未记录，Root2独立PG无该Expense回执仅是快照，不证明可以重试。源补丁888a1b4b保留脱敏stage/code，84项相关测试PASS；当前实际Backend仍f8862b0a/f650ce2b，本轮不替换共享DEV、不重发。
2. Trip→Ledger旧标题已在888a1b4b最小修复，完整原生App冷启动实际显示新名；不改金融字段/ACL。
3. Apple 当前系统没有 Apple Account；入口 PASS，完整登录 E2E BLOCKED。Google custom Bundle / OTP 真实账户交换也不能由 Mock 代替。
4. Member/多 Account、其余 P 类型全 CRUD、照片/附件、Settlement 非破坏只读、完整 Consumer 等仍缺当前真实运行证据；不能申请 Main Merge GO。
5. 来源不明的历史能力继续追溯。Flexible、Invite/Claim、Realtime、Document Cloud Sync 等 approved deferral 不作为已验收功能恢复来擅自启用。

## 截图

[Apple system boundary](screenshots/apple-system-account-required.png) · [Trip edit](screenshots/trip-edit.png) · [Cover](screenshots/cover-picker.png) · [Currency](screenshots/currency-picker.png) · [Day Feed](screenshots/day-feed.png) · [Ledger](screenshots/ledger.png) · [retained draft](screenshots/capture-draft-final.png) · [actual Account P1 edit](screenshots/account-plan-edited.png) · [Guest P1 local edit](screenshots/guest-plan-edited.png)。不同截图可能来自首次8297与后续953全原生构建，具体版本见 NATIVE_BUILD_VERIFICATION；不混为同一批视觉测量。

## 14:21 NZDT 增量实际验收

- P3/P4/P5/P6 NEW 已由 Root2 一次独立只读 PostgreSQL 验证，见 `evidence/root2-NEW_ITEMS_READBACK.json`。P5 原唯一创建 op `d76351f0…` 已提交；后续 EDIT `c72eb532…` 同 Item revision2 客户端正式回执，不是重复创建。
- 冷启动后同 Account、同 Trip、五个唯一 P1/P3/P4/P5/P6 Item均在，原9份私有文件摘要一致。冷启动不等于系统级断网验收。
- Owner发现Header/背景偏差后追加真实产品修复：旧 `dayFacts?.startDate` 条件会使无日期Trip退回简单文本、丢失渐变；`5c28077e` 取消此视觉分支，已有开始日期保留日序，无开始日期显示真实月/日。完整Native及两种Trip实看，无新业务保存。
- 仅以上范围PASS。P5首次草稿保护拒绝准确码不明、账本503、未执行角色/删除及全产品覆盖仍不是PASS。
