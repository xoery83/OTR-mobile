# Slice1 AUTH_REQUIRED Focused Recovery — 有限消费者访问候选

状态：软件与关闭入口均已准备完成，等待本次有限访问确认。本文不续期旧 b94/80dd，也不批准 Notes 保存。

## 已完成的软件与证据

Owner 2026-11-02 Focused Recovery 指令下，Root 已发布默认关闭诊断镜像：
`sha256:1c5d8f83d57ca9d704cfc947e908c3fa6d90ff8fbf16327e775201bdced4c39b`。
默认 CID `a1d0993ea215c4bb6f1ca554c2f5536d1ce8c1925374a06d867c36d44c21effd`，
Config `9a88efaac354f37c8863f48d1ac8c5c9ecf5b3368a3bdbd6e7dade955d19caba`。
Capture `6e69438340ce20f51912b4ad465406270fc17a8589950d1d52b6f7eb566a59e0`，
仅 Auth609184bb 两生产文件变化，其余350 inputs保持；Runtime `a0560110…`、SDK `3b5ceca5…` 原值不变。
Root固定提交 `1a678149`，MCP已从Git对象核对部署/镜像/组装收据（FOCUSED_RECOVERY_SOFTWARE.json含完整哈希）。
Root报告49项定向检查及默认关闭smoke通过、BackendCalls0、健康200/受保护401、QA keys absent和23文件一致，短锁已释放。
原始失败对照已固定4b66715c；MCP本地19项Read测试/types/lint通过，独立静态Review NO_BLOCKER，不是消费者恢复PASS。

## 唯一真实测试

仅 Claude 既有 public client `d2b8167f-ee42-4ac1-b5ef-4dc003c0d141`，
callback `https://claude.ai/api/mcp/auth_callback`，MCP resource `https://api-dev.xoery.art/mcp`。
仅合成 Account `1f3d7935-1bdc-4952-8d7f-0f72077368c1`、Trip `cc44a705-6f43-41e0-a2f9-16f334b2a6b2`、
已有 private P3 `3616da44-0d35-4400-a739-01f1029565ea`。
独立21:21:52Z只读预检仍为rev1/原Notes/整个root与原baseline相同、固定两receipt0。

先正常OTP/OAuth Consent，依次实际读取 Item 和完整 Edit Base，保留消费者响应和有限诊断。
原来缺失的HTTP/Correlation/JWT状态不能追认；新证据保留原始requestId和每个Backend-read diagnosticId，不假定两者相同。
失败即停止修改，采证并关闭，不盲目重试、扩大权限或推断Token过期。真实EditBase PASS后才继续原任务。

原固定 Operation `1d6c202d-4e1a-4be0-a3f7-e2ee158eeacf` 仍 NOT_SUBMITTED。
仅允许原Notes `Synthetic QA only. No Booking/Ticket.` 末尾追加一个LF和
`Slice1 Fresh Claude Notes QA verified.`，CAS1，固定digest
`1d5be7abe7b4ee323bf0631a55b8786eb5e05eddc8d1593fec8f44eb1dd6a546`。
必须先取得真实PREVIEW；实际Before/After/revision/digest一致后，仅Auth聊天另问一次具体人类保存确认。
此访问批准不等于保存批准。可信confirmations保持空，Root只有收到合法精确确认后才短CAS安装该op/digest。
最多一次合法Apply，必须正式APPLIED和独立同ID新Revision、Notes及其他root/children保真才PASS。
若UNKNOWN只查询原Operation回执，禁止重POST/换ID。历史f107/9b保持UNKNOWN，完全不重试。

## 时钟与关闭

先完成软件、UI、正常control/收件/关闭器准备，之后才固定新T/D。
首次临时QA配置变化至D最多30分钟，D−120秒启动正常关闭，不延长、不重置、不与其他消费者轮重叠。
只复用既有用户级身份/同Audience及既有 `otr.trips.read`、`otr.trips.write` Scope；写入仍受固定Notes工具与空确认表限制。
MCP Token最长60秒，DCR关闭；不放宽Core/RLS/GRANT或新增业务权限。
Auth仅使用既有QA有限issuer/Hook控制，并在关闭时恢复原函数体/ACL/控制台配置，不安装新权限合同。
Auth唯一操作既有有限issuer/正常Session控制；Root唯一短锁操作Host，MCP负责消费者。
正常登录/接收仅使用既有合成QA收件账号和内存桥，不复用其他线Session，不记录OTP/Token/Secret/私有Source。

关闭前有界白名单采集器已固定Root `80a21920`，11项独立测试、Review NO_BLOCKER、关闭态Host自检通过。
Helper SHA `9334be21220e0c73b913c01d73f1007f810956bb6f790941382d7b95a2242c95`；仅REQUEST/READ_STAGE/WRITE_STAGE有限字段，
最多64事件/32768字节/1.8秒含落盘，0600留存；失败标记UNAVAILABLE且继续关闭。
独立timer优先关闭可能不留日志，不能因空日志或不可用日志推断NoCommit。新窗口准备标识仅 `7cb5cd285a774df8bc71375c6890bce4`（Auth已确认采用；无T/D/OTP/Session/issuer）。
关闭Plan SHA `6237746bc11148a82c86dea785907174dbc6239c39aa3f4c245201f1ba43bff4`；实际关闭入口
`/private/tmp/otr-mcp-root-read-focused-20261102/close-once.py`，SHA `4c43a9d311b0073a4d3c9b802015e37775db2686d8c80a26aaced0c05bafd177`，
MCP已独立校验此入口及helper文件哈希；Root21:49:41Z实际no-change restore通过。
Root在时钟前将本新Gate完整SHA作为真实授权身份，与软件marker530分别绑定；不循环pin含GateSHA的preparer哈希。
历史80dd关闭模板/b94授权不得直接复用。
结束/失败/到期均撤销本轮grant和自己Session，OAuth/Hook/临时issuer恢复关闭，移除QA keys，
恢复新默认a1/9a88/1c5并验证健康、文件/Host、计时器和锁释放。旧cb71仅为软件回滚，不作为本轮默认恢复目标。

本轮不新增ChatGPT测试、Nelson/Production/财务/People/Source等业务，不占设备、Provider或其他领域Gate。
Owner可在本MCP聊天批准有限访问，并授权同步Auth/Root；实际Notes确认仍由Auth聊天直接人类回复取得。
