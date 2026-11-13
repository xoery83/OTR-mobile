# Slice1 — 单一有限连接及精确 Notes 保存候选

REVIEWED_CANDIDATE_READY_FOR_ONE_ROOT_CONFIRMATION；默认、关闭回执及最终增量Review已核验；未批准、未开窗。新窗口标识 `e389fb93736b401c9e9b5f1437e852dc`。
旧 acd60 和 78c 均已关闭，不恢复、不延长。代码/SDK/OAuth/Core复用现有实现。

## 只有这一条修改

Claude既有public client `d2b8167f-ee42-4ac1-b5ef-4dc003c0d141`，
callback `https://claude.ai/api/mcp/auth_callback`，resource `https://api-dev.xoery.art/mcp`。
仅合成 Account `1f3d7935-1bdc-4952-8d7f-0f72077368c1`、Trip `cc44a705-6f43-41e0-a2f9-16f334b2a6b2`、
住宿 Item `3616da44-0d35-4400-a739-01f1029565ea`。
原 Operation `1d6c202d-4e1a-4be0-a3f7-e2ee158eeacf`，CAS1，
digest `1d5be7abe7b4ee323bf0631a55b8786eb5e05eddc8d1593fec8f44eb1dd6a546`。
Before：`Synthetic QA only. No Booking/Ticket.`
After：保留原文，末尾仅追加一个 LF 和 `Slice1 Fresh Claude Notes QA verified.`。
其他字段完全不变，不新建事项。真实消费者 Preview 见 CONTINUATION_PREVIEW_TRANSCRIPT.txt；
当前独立只读核对见 CONTINUATION_POSTCLOSE_READBACK.json（rev1/原Notes/receipt0）。

## 唯一 human 确认及执行

本候选明确请求 Owner 在 Root 唯一聊天，一次批准本次有限正常连接及上述已展示的精确 Notes 修改，
取代此前“访问批准不含保存、另等一次保存确认”的两次等待；尚未收到该具体批准。
这是仅针对本次已展示修改的流程调整，不把“继续推进”或模型文字解释成保存确认。
正常 OTP/Consent 后，先只读原 Operation 和最新完整 Edit Base；
仅当仍 NOT_SUBMITTED、同 Item/CAS1/原Notes且新正式 Preview 完全匹配上述 digest，
Auth/Root 核验本次直接 human 具体批准后，Root 才安装唯一 op/digest；此前 confirmations 为空。
任一身份/字段/revision/digest不同即停止，不重算授权、不重设ID。
最多一次 Apply；UNKNOWN 仅查原 Receipt，不重 POST。历史 f107/9b 不重试。
正式 APPLIED 后独立读回同 ID/rev2/Notes，核对其他 root/field_state/11 children 保真。

## 有限访问和关闭

正常合成QA独立Session；既有 read/write Scope，Token最长60秒，DCR关闭。
本候选同时明确请求 Root 为本轮唯一受保护执行方：Host、既有有限issuer/Hook body CAS、
正常QA控制Session、OAuth Grant撤销与控制台恢复均由Root执行；不改变Auth Owning合同。
Root自行通过既有正常OTP入口建立独立process内Session，不复用Auth旧Session、不转移Token。
Auth仅交接已有软件并独立Review，不在另一聊天执行本轮Host/issuer/Grant/console。
仅临时更新既有QA Hook的有限body；既有Owner/invoker/search_path/ACL不变，结束恢复原deny-all body，
不新增Schema/RLS/GRANT、不伪造业务Principal，也不使用Service Role提交业务。
控制台仅本DEV项目 `tuqigdxrvrerfewsxqgm`：Siteapi-dev、既有Hook启用、OAuthON/DCR0；
结束OAuthOFF、HookDISABLED、Site `http://localhost:3000`，正常Grant/自己的Session撤销并刷新负例。
软件入口与边界见 NEXT_NOTES_ROOT_EXECUTION_HANDOFF.json；旧78c激活脚本只参考，不能执行。
OTP/Token/Secret仅内存，不记录原文；正常收件器在登录页可发送时才启动。
SQL仅限前述既有Hook有限body CAS与恢复；不新增Schema/RLS/GRANT/业务Scope。
不触真实Nelson/Production/财务/People/Source/Provider/设备。
Root已于2026-11-02 17:10:06 NZDT独立核验最终默认（NEXT_NOTES_FINAL_DEFAULT_READBACK.json）：
CID `dc58a1f22b5b47d5f2da85a19f2fd8a5a024b4fb5314606fbecb85226757a950`，
Config `0ebea28102b868a112bf410cc51fc8883cb249bc84cdfcc6f08ff1ce0e77fb66`，
Image `sha256:0ffd444c102405d3cb7844a40258dfa561d5b8b8af0add026233eb9580cf2d0a`。
MCP runtime416/SDK45ff保持，最终关闭必须恢复此版本；先前aaf6仅历史默认/回滚证据。
无业务/SQL/权限激活，QAkeys absent，23files/Host exact，发布锁已释放。窗口内不换镜像。
Root自己的正常control与独立关闭机制、MCP内存收件和消费者UI全部准备完再固定T/D；
首次临时配置变化至D最多30分钟，D−120秒正常关闭，不延长、不重置、不重叠。
Root在结束/失败/到期撤销本轮grant和自己的control，恢复issuer/OAuth/Hook/Site；
Root移除QA配置并恢复本轮固定的新默认版本，验证健康/Host/23files/timer/锁释放。
新默认关闭前像已实际核验：NEXT_NOTES_CLOSE_READY_COREAD.json。
2026-11-02 17:11:43 NZDT same-ID dc58/0ebe/image0ffd no-change restore PASS，
无T/D/timer/QAkeys/OTP/authority，旧aaf关闭计划只保留历史，不能用于本轮恢复。
关闭入口 `/private/tmp/otr-mcp-root-source-binding-e389-20261102/close-once.py`，
SHA `471a338ae9a66cab8865b3bab00f2ad5f587737b62371cdbebf56ed0c4687f83`；
Host目录 `/opt/otr/dev-backend/build/auth-consumer-write-qa-e389fb93736b401c9e9b5f1437e852dc`，
实际关闭Plan SHA `cb0db7f85270f157fa6e5954a1de0235b5bab61c2167ed27e4f64c51bbfe825a`。
此阶段Host守卫仍为旧 `0ba00b4575b0c828ea5b6bb05d879c8f32e2a71d9602ac27ceba4980f9e9ebee`；
不得声称新Root来源校验已安装。本文明确请求批准后，在本轮独立目录按精确前像
0ba0→候选 `2ee651282e3c415c1616266ca19326c09bc8c890e006c15081b126d5883c11ad` 安装，
不改旧窗口冻结文件、不接入服务、不放宽到任何其他批准来源；其余6 helper及关闭逻辑逐字不变。
安装后核实际helper与关闭条件，失败停止；实际human字节预检通过前不启动业务时钟或授权。
计时前必须用包含已冻结 clientId 的确认记录通过既有 validator 和 pure plan；
检查禁止 process/socket/Host/CAS/DB 执行；不得把模拟时间或计划当成新实际授权。
实际确认记录随后仍须直接匹配 Owner 的这次具体批准及窗口身份。
本轮明确请求 Owner 批准将唯一实际确认来源从旧 Auth 聊天改为 Root 聊天
`01a1753a-2837-7d20-89c8-d8c1476b0ed8`；记录必须是真实 Root human message/thread，
不得伪写 Auth sourceThreadId，也不得把任何 Agent/tool 转述当作 human。
旧 frozen config_cas/confirm-once 仅接受 Auth source，差异的最小候选及独立离线负例已完成；
不改旧窗口冻结文件，不放宽到任意聊天，不改业务身份、Scope、字段、Operation或期限。
实际新 human approval bytes（含完整 clientId）必须在计时前通过新精确来源 validator 和 pure plan，
错误来源/未批准/错误Client/Operation/digest/过期均拒绝，检查不执行 Host/CAS/DB。
Owner 未批准这个具体来源调整前不启用；Root 唯一聊天呈现一次组合确认，Auth/MCP 不重复问。

来源绑定 CLOSED 候选：Root私有目录 `otr-mcp-root-source-binding-e389-20261102`。
`config_cas.py` 候选 SHA `2ee651282e3c415c1616266ca19326c09bc8c890e006c15081b126d5883c11ad`；
仅固定 Auth 来源改为本轮唯一 Root 来源，其余6 helper保持。confirm模板另加claim前clientId校验，
仍为非可执行差异模板，包含旧pins不得执行；实际新wrapper仅在本Gate最终冻结后绑定。
本地10项精确检查通过（NEXT_NOTES_SOURCE_BINDING_LOCAL_TEST.json），Root来源为明确synthetic fixture；
无process/socket/Host/CAS/DB、无时钟或实际批准；不把本地通过当作真实Owner授权。
Auth独立增量Review NO_BLOCKER，副本10项检查通过；固定2abc52f0，
见 NEXT_NOTES_SOURCE_BINDING_INDEPENDENT_REVIEW.json。关闭前像实际回执已固定；
新的Root来源守卫仅待本文明确批准后安装，不把现有回执当成安装或授权证明。

最终五个适配入口已取得Auth独立增量结论 NO_BLOCKER_FIVE_ENTRY_SCOPE_AFTER_STALE_BINDING_FIX，
MCP已核对五入口当前字节与Review中的SHA一致；见 NEXT_NOTES_DISPATCHER_INCREMENTAL_REVIEW.json。
此前实际prepare输出继承旧expectedCurrent的错误已由Root定向修复；同本轮default/expectedCurrent、
issuerPlanSHA256、normalControlObservedAt均须来自本轮真实产物，禁止继承旧78c值。
Root已报告实际AST→既有EMPTY pureplan的RED→GREEN及9个wrapper检查通过（无Host/SQL/CAS）；
Auth已独立执行真实prepare输出→既有EMPTY纯plan的RED→GREEN检查，0外部执行。
这些结果不构成Owner批准；实际批准原字节仍须在clock前复验。
本Gate仅固定权限范围与默认/关闭边界；最终绑定wrapper记录另存，不反向pin入本文件造成循环。
