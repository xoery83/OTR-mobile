# Slice1 Fresh Consumer Edit — 精确执行授权候选

本文件等待 Owner 明确批准，尚未授权部署、OAuth 激活、OTP 或业务提交。
这是独立新 QA 场景；不是历史 UNKNOWN 的恢复，也不续用旧时钟或 Notes 批准。

## 1. 已固定的默认关闭软件

- 以 Root 当前实际兼容源码组合，Capture352 inputs 仅两 Auth 源码和固定 case JSON 改变，其他349 inputs保留；SDK51 inputs仅 Guide 改变，其他50保留。
- Auth `f1de4b47` 安全阶段诊断、隔离构建/fixture交付 `3574de01`；MCP Guide `bfde2503`，SDK pins `58f7f4bb`，独立新 case `1ae2a1a9`。
- 预构建镜像：`sha256:fbd9074e232861dd272ad16b950045db8be0df82f979b2fafa8da8e91dba1f66`。
- Capture：`8bb2dfba6f5c8c012491c2b42a47d8f876e73a51b9d35192beab286adc627c1d`。
- Runtime：`a0560110a2a6419bb152f8bf423b13b27efbc5155574e303bb76ae299d844565`。
- SDK：`3b5ceca51d6ad4ba56312041880d01452e68d7bf1069dd19454ba34868e62083`。
- Fresh fixture：`6d5d4e07b14c5a5e9c692e3db24040a7dd076edddbcf8f743bbb86007169d6da`；旧 `QA_CASES.json/c87a647…` 原字节保留。
- Root deploy plan：`9b647890363a25299863c726ccb9a6d946e78220f5a0537459a78c1fab56e80b`；release：`1b6e4ff03716f0e08bc5c35dad7afe462d742c497dbf6fb71149411338ec61a1`。
- Fresh CAS：`0ba00b4575b0c828ea5b6bb05d879c8f32e2a71d9602ac27ceba4980f9e9ebee`；只 pin 新固定 case，并要求 Auth 聊天一次直接人类 Notes 批准，沿用已验证的 prepare/close/restore。
- 完整 Root 固定收据 `91465118`：`FRESH_ROOT_READY.json`（包含全部 prepare/closer/restore/helper 完整哈希）；Auth 固定收据：`FRESH_AUTH_HANDOFF.json`。Root 报告默认关闭 image smoke/4 artifacts匹配、BackendCalls0、六项定向校验及独立 Review NO_BLOCKER。MCP SDK smoke、fresh基线/身份摘要/只读runner Review、typecheck/lint已通过；这些不是消费者保存 PASS。

## 2. 唯一测试范围

同一合成 QA Account `1f3d7935-1bdc-4952-8d7f-0f72077368c1`，Trip `cc44a705-6f43-41e0-a2f9-16f334b2a6b2`，另一条已存在的 P3 `3616da44-0d35-4400-a739-01f1029565ea`（Synthetic Nelson QA lodge (unbooked)）。

已独立只读确认 PRIVATE/SELF，self Person `0fba6f2e-d0bd-4e65-8e41-decebe8c3154`，owner为上述Account，rev1。原 Notes：`Synthetic QA only. No Booking/Ticket.`。正常 Backend/消费者仍须通过合法 Session 独立读取；不修改 ownership，也不把 SQL 当用户身份。

- Claude：操作 `1d6c202d-4e1a-4be0-a3f7-e2ee158eeacf`，CAS1，digest `1d5be7abe7b4ee323bf0631a55b8786eb5e05eddc8d1593fec8f44eb1dd6a546`；仅在原 Notes 末尾追加一个 LF 和 `Slice1 Fresh Claude Notes QA verified.`。
- 仅 Claude 真实 PASS、完整关闭后才可执行独立 ChatGPT 轮：操作 `2777810c-24d9-4ecf-998c-9fc5dd00de34`，CAS2，digest `fc182c0b2b679c82ca7060601254d317890d1c4eff0f4f101f0f01de0dc9b88c`；仅追加一个 LF 和 `Slice1 Fresh ChatGPT Notes QA verified.`。
- 完整输入/正式 Core command/identity：`QA_CASES_FRESH.json`。其他字段不变，不创建 Item，不更改日期、人物、可见性或财务。
- 原 `f107/11f` 与历史 `9b` 继续 UNKNOWN，仅允许原回执只读调查；不重发、不改 ID、不把新场景冒充恢复或 NoCommit 证明。

## 3. 执行和关闭

批准后，Root 以短 CAS 发布上述默认关闭镜像，Smoke→Receipt→Release；不合并长支线、不安装并行 Profile/Invite/Photo 新功能。Auth 是发行端/会话/窗口唯一操作人，Root 是 Host/配置唯一 Writer，MCP 是真实消费者执行人。

复用既有 public OAuth client：Claude `d2b8167f-ee42-4ac1-b5ef-4dc003c0d141`，仅回调 `https://claude.ai/api/mcp/auth_callback`；ChatGPT `83504d3f-59d4-43fd-99b1-bebc54c40f7d`，仅回调 `https://chatgpt.com/connector/oauth/CYUxrs56rSrW`。使用用户级身份、Audience 和正常 OTP/fresh Consent。DCR关闭，MCP访问Token最长60秒，无新增Scope、RLS/GRANT/Schema；仅复用已批准的有限发行控制并恢复原函数体/ACL。

每轮全部准备就绪后才固定新的 T/D，首次临时 QA 配置激活至D最多30分钟，D−120秒开始正常关闭；两轮不重叠、不延长或重置时钟。正常 QA 清理 Session、收件 lease、控制台及两端自动关闭器在激活前准备。配置 confirmations=[]；旧 renderer `530937ac…` 仅作软件标识，不是新 case 的执行或 Notes 权威。

真实消费者自行读 Guide/Trip/Item，提供精确 Before/After 后，**仅由 Auth 在其聊天发出一次具体 Notes 保存确认**。MCP 展示实际预览和证据，不先重复问同一 Notes 问题。Auth 收到其聊天直接 human 回复并核验，Root 才可短 CAS 安装唯一 op/digest；模型文字或消费者 Allow 卡片不能代替。**本 Gate 批准不包括 Notes 保存。**

每个 case 只准一次精确 Apply；遇 UNKNOWN 仅查同一 Operation 回执，不再 POST/换 ID。只有正式 APPLIED、同 ID 新 revision/Notes 和独立 SQL 全部其他 root/field_state/children 保真才 PASS。发现新的确切失败则保留 stage/receipt，聚焦诊断，关闭窗口，不循环重开或提高权限。

完成、失败或到期均撤销本轮 grant/自己的 Session，关闭发行端/控制台、移除 QA keys、恢复默认健康服务并释放资源，保留数据和回执。缺少日志/receipt不能证明 NoCommit。无真实Nelson、Production、财务、Source/AKA/Invite、Provider调用或设备占用。

Owner 对本文件的直接回复，可由 MCP 在本聊天取得并同步 Auth/Root，限本 Gate 的部署/窗口协调；实际 Notes 批准依上面的 Auth 直接 human 路径单独取得。
