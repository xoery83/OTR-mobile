# Slice1 — 单一有限连接及精确 Notes 保存候选

软件与关闭绑定均实际 READY，等待唯一具体 human 组合确认；当前不是访问或保存授权。新窗口标识 `78c1610ecf5f43409106fb67ecd36489`。
旧 acd60 已关闭，不恢复、不延长。代码/SDK/OAuth/Core复用现有实现。

## 只有这一条修改

Claude既有public client `d2b8167f-ee42-4ac1-b5ef-4dc003c0d141`，
callback `https://claude.ai/api/mcp/auth_callback`，resource `https://api-dev.xoery.art/mcp`。
仅合成 Account `1f3d7935-1bdc-4952-8d7f-0f72077368c1`、Trip `cc44a705-6f43-41e0-a2f9-16f334b2a6b2`、
住宿 Item `3616da44-0d35-4400-a739-01f1029565ea`。
原 Operation `1d6c202d-4e1a-4be0-a3f7-e2ee158eeacf`，CAS1，
digest `1d5be7abe7b4ee323bf0631a55b8786eb5e05eddc8d1593fec8f44eb1dd6a546`。
Before：`Synthetic QA only. No Booking/Ticket.`
After：保留原文，末尾仅追加一个 LF 和 `Slice1 Fresh Claude Notes QA verified.`。
其他字段完全不变，不新建事项。真实消费者 Preview 见 READ_AUTH_RETEST_PREVIEW_TRANSCRIPT.txt；
当前独立只读核对见 CONTINUATION_PREFLIGHT_READBACK.json（rev1/原Notes/receipt0）。

## 唯一 human 确认及执行

本候选明确请求 Owner 在 Auth 单一聊天，一次批准本次有限正常连接及上述已展示的精确 Notes 修改，
取代此前“访问批准不含保存、另等一次保存确认”的两次等待；尚未收到该具体批准。
这是仅针对本次已展示修改的流程调整，不把“继续推进”或模型文字解释成保存确认。
正常 OTP/Consent 后，先只读原 Operation 和最新完整 Edit Base；
仅当仍 NOT_SUBMITTED、同 Item/CAS1/原Notes且新正式 Preview 完全匹配上述 digest，
Auth 核验直接 human 具体批准后，Root 才安装唯一 op/digest；此前 confirmations 为空。
任一身份/字段/revision/digest不同即停止，不重算授权、不重设ID。
最多一次 Apply；UNKNOWN 仅查原 Receipt，不重 POST。历史 f107/9b 不重试。
正式 APPLIED 后独立读回同 ID/rev2/Notes，核对其他 root/field_state/11 children 保真。

## 有限访问和关闭

正常合成QA独立Session；既有 read/write Scope，Token最长60秒，DCR关闭。
Auth仅复用已批准的有限issuer/Hook控制，结束恢复原函数体/Owner/ACL/控制台配置。
OTP/Token/Secret仅内存，不记录原文；正常收件器在登录页可发送时才启动。
无新增 SQL/RLS/GRANT/业务Scope，不触真实Nelson/Production/财务/People/Source/Provider/设备。
Root最终默认已实际核验（CONTINUATION_DEFAULT_READBACK.json）：
CID `076edb49d761983f0f507d2102dbde5400b450ef38979ce16022e31fbb6fa2c0`，
Config `011909bcc46adceb3f1defc9b769655d388413ac28d43502330bdfbc6afd588c`，
Image `sha256:cdd762ea99b53fd21330dfe09df157b727b89e7a7c5e4e4da2c2487796364102`。
MCP runtime416/SDK45ff保持，最终关闭必须恢复此版本；旧ddd7仅软件回滚。
无业务/SQL/权限激活，QAkeys absent，23files/Host exact，发布锁已释放。窗口内不换镜像。
Auth正常control/内存收件、Root关闭器和消费者UI准备完再固定T/D；
首次临时配置变化至D最多30分钟，D−120秒正常关闭，不延长、不重置、不重叠。
结束/失败/到期撤销本轮grant/自己的control，恢复issuer/OAuth/Hook/Site；
Root移除QA配置并恢复本轮固定的新默认版本，验证健康/Host/23files/timer/锁释放。
Root 2026-11-02 14:09:21 NZDT 实际 same-ID no-change restore PASS：
CONTINUATION_CLOSE_READY.json；7 helpers 与既有版本逐字相同，无时钟/timer/QAkeys。
Host run dir `/opt/otr/dev-backend/build/auth-consumer-write-qa-78c1610ecf5f43409106fb67ecd36489`。
关闭 Plan SHA `8f43b6195e2f3616d9838a3f17682521d863d072761f9abd9fd30212a12038e1`。
实际关闭入口 `/private/tmp/otr-mcp-root-continuation-78c161-20261102/close-once.py`，
SHA `e3a90d17d037eb1c331b3af1e6f7b6cf783d53ac103c1a5122718df1385a7d8e`，MCP已核对。
有界白名单采集器 `9334be21220e0c73b913c01d73f1007f810956bb6f790941382d7b95a2242c95` 保持，
采集失败不阻止关闭，空日志不能推断NoCommit。
Root将本文完整SHA作为新执行权威，软件marker530单独保留；不循环pin后绑定wrapper。
Auth唯一聊天呈现本次具体组合确认，MCP不重复问。准备完成后才开窗，Native同QA收件不并发。
