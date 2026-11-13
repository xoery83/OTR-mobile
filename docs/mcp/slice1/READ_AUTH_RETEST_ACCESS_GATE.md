# Slice1 Read Auth Repair — Claude 有限复测候选

状态：软件与关闭绑定实际 READY，等待本次有限访问确认；无 T/D、Token 或 QA 授权。

## 固定软件和唯一任务

Root 已实际发布并独立核验默认关闭镜像 `sha256:57bce7bb398f0508bf6dad99aaf53cac044be8f07112ca45e57c584757ffcb4d`。
默认 CID `ddd7ac46ab3d1575bc9d9864b128ab50f0bc530c6b9f32c66cbdac813c8cd32f`，
Config `db86894730f9a7e3f675d7bc805ea00a5057c05c5d5047d0b8c292746e0ef512`。
证据：READ_AUTH_DEFAULT_DEPLOYMENT.json。SDK45ff/runtime416；其他 Auth/Core 权限不变。
修复仅把严格单个合法读取的鉴权失败返回 HTTP401，允许客户端正常刷新；
批次、Preview、写入和 Operation Status 保持原行为，服务端不重试写入。
本地72项定向回归、Typecheck、Build、独立 scoped Review NO_BLOCKER；不代表消费者 PASS。

仅 Claude 既有 client `d2b8167f-ee42-4ac1-b5ef-4dc003c0d141`，callback
`https://claude.ai/api/mcp/auth_callback`，resource `https://api-dev.xoery.art/mcp`。
合成 Account `1f3d7935-1bdc-4952-8d7f-0f72077368c1`、Trip `cc44a705-6f43-41e0-a2f9-16f334b2a6b2`、
P3 Item `3616da44-0d35-4400-a739-01f1029565ea`，原 Operation
`1d6c202d-4e1a-4be0-a3f7-e2ee158eeacf`（NOT_SUBMITTED）。
正常 OTP/Consent 后串行读取 Item/Edit Base；允许原权限内正常 credential refresh。
失败立即采证关闭；通过才继续正式 Preview。不得用错误名称代替实际诊断。

唯一拟修改：CAS1，保留 Notes `Synthetic QA only. No Booking/Ticket.`，
仅追加一个换行及 `Slice1 Fresh Claude Notes QA verified.`。
固定 digest `1d5be7abe7b4ee323bf0631a55b8786eb5e05eddc8d1593fec8f44eb1dd6a546`。
访问批准不包含保存；可信确认表为空。真实 Before/After、Revision、digest 一致后，
仅 Auth 聊天直接向 Owner 问一次具体保存确认。取得合法确认才安装该单一 op/digest。
最多一次 Apply，UNKNOWN 只查原 Receipt，不重 POST/换 ID；历史 f107/9b 完全不重试。
需正式 APPLIED 和独立同 ID/rev2/Notes/其他 root 及 children 保真才 PASS。

## 有限访问及关闭

新准备标识 `acd60fd27aee40e8b6cf1aca727ed169`；旧7cb5/f93已关闭，不复用。
软件/UI/正常 control/收件/关闭器全部准备后才固定新 T/D。
首次临时配置变化至 D 最多30分钟，D−120秒正常关闭；不续期、不重置、不重叠。
Token最长60秒，既有 `otr.trips.read`、`otr.trips.write`，DCR关闭，无新增 Scope/SQL/RLS/GRANT。
仅正常合成QA会话，不复用他线Session；OTP/Token/Secret仅内存，不进入日志/附件。
Root唯一操作Host短CAS；Auth唯一操作既有有限issuer及自己的会话清理。
安全日志使用既有有界白名单采集器，失败不阻止关闭，空日志不证明NoCommit。
结束/失败/到期撤销本轮grant、关闭自己的control，恢复OAuth/Hook/issuer原状；
Root恢复新默认ddd7/db86/57、移除QAkeys并核对健康/23files/Host/timer/锁释放。
旧a1/9a88/1c5仅软件回滚，不能作为本轮关闭目标。

Root于2026-11-02 13:01:03 NZDT实际stage及same-ID no-change restore PASS；
回执 READ_AUTH_RETEST_CLOSE_READY.json，7 helpers 匹配且无QAkeys/时钟/计时器。
Close Plan SHA `796aef1dfc3a9f0a0708fd9a042d0d8ed4767a41b55d1ccafd4deaba72f4075e`。
实际关闭入口 `/private/tmp/otr-mcp-root-read401-retest-20261102/close-once.py`，
SHA `6ed5f2b7695daae0be1cb621745e78c30c9c20b468ae3ae978f04d20b69c7508`，MCP已核对。
Collector `9334be21220e0c73b913c01d73f1007f810956bb6f790941382d7b95a2242c95` 保持。
Root将本文完整SHA作为新授权身份，与软件marker530分别绑定；不循环pin未来绑定产物。
Owner在本聊天批准本次有限访问并授权同步Auth/Root后，才准备正常control并开始窗口。
本轮不启 ChatGPT、真实 Nelson、Production、财务、People/Source、设备或 Provider。
