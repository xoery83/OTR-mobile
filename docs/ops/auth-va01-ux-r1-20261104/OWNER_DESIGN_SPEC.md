# OTR Mobile 2.0 — V-A01 Account & Sign-in UX

Owner-approved Design Feedback · 2026-11-04

Vision Package：V-A01。关联 AUTH-C01、AUTH-C03、TRIP-C03。Auth / Lane D 为实现 DRI，Native 负责共享页面与导航接线，Vision QA + Owner 负责验收。排入后续工作，不打断 AUTH-C04 Hosted 多人协作验收。

## 正式设计要求

1. Guest-first、Beta 单账号。Guest 本地旅行功能正常开放，不强制登录；云端、协作或 AI Connect 需要身份时，给出上下文登录引导。不进行全 App UI 重构。
2. Guest / 从未登录：Account 入口展示 Sign in、简短价值说明、实际可用 Provider、Continue as Guest；不展示 Accounts List 或 Add Another Account。
3. 已退出 / 回访：Welcome Back 或普通 Sign in。可在隐私允许时提示以前登录方式，但不得保留有效 Session 展示或绕过重新认证。
4. 已登录：Account 显示 Display Name / Email、实际登录状态、Profile / Settings、有证据的 Sync 状态、AI Connect 入口与真实连接状态、Sign out。Beta 不提供多个正式账号同时登录、列表或直接切换。
5. Provider 采用统一页面结构：Email OTP、Google；Apple 仅正式资格就绪后显示。Email 与验证码使用独立步骤，不嵌入 Account 首页。不新增密码或 Magic Link。覆盖无效邮箱、发送失败、错误/过期验证码、重发限额、返回修改邮箱、取消和正常恢复。
6. AI Connect / Invite 等上下文认证保留原操作，完成正式认证及适用的 Guest Adoption 后安全返回；不自动执行未确认业务写入或 OAuth Consent。
7. Guest Adoption 复用既有合同：对合法 Guest 数据提供明确选择；稍后处理保留数据与待处理状态；不得静默覆盖、丢弃或重复创建。失败、UNKNOWN、部分完成使用已有恢复机制，不重设计迁移事务。
8. Sign out 说明影响并允许取消；撤销当前正式 Session，清理或隔离 Guest 不得读取的账号私有数据，保留合同允许的独立 Guest 数据，回到明确未登录状态，不残留前一账号敏感内容。具体遵循既有 Auth / Sync 合同。
9. 未登录与已登录页面视觉统一；删除 Add / Login another account；Provider 按钮一致；主操作、取消、错误清晰。支持已批准中英文、Light / Dark、键盘避让、触控目标、Loading、错误和 Native 可访问性规则。

## 四个独立复验切片

- V-A01-1：Guest / Signed-out Account。
- V-A01-2：Email OTP。
- V-A01-3：Signed-in Account / Sign out。
- V-A01-4：Guest → Account Adoption。

每片固定实际 main Build、Device、Fixture、Auth / Backend 版本和可用 Provider；Vision 先预检，再交 Owner。技术 PASS 不能替代 Owner Accepted。它们是现有 V-A01 内的复验切片，不新增原54 Beta Package范围。

## 视觉参考的边界

四张 Owner 附图保留为视觉参考，正式文字要求优先。图中6位验证码、Apple按钮、Sync绿色完成标记、AI连接或Adoption示意不构成已实现或已获授权的证据。当前正式 Email OTP 是8位，除非 Auth 正式合同改变，不按图改成6位；Apple按实际资格显示，Sync/AI状态必须真实。

## Owner 同轮独立缺陷：历史 Trip 恢复前误报空状态

操作：用此前已创建过 Trip 的 Email 登录，进入 My Trips。

实际：先出现无 Trip 的初始化页面，几秒后旧 Trip 才出现，误导用户以为数据丢失。

预期：My Trips 展示前建立该账号的历史数据恢复状态。恢复尚未完成时显示明确 Loading / 恢复状态，不得将“未知/恢复中”展示成“确认为空”。有历史 Trip 后展示列表；仅确认已完成且为空才展示空状态。失败、离线或超时保留明确恢复反馈和既有安全恢复入口，不能无限 Loading 或回退为假空状态；切换身份和退出须遵守账号隔离。

该问题关联 AUTH-C01 / AUTH-C03 / TRIP-C03，由 Auth 主责诊断登录恢复时序、Native 配合 My Trips 页面与导航。根因、精确耗时、Owner实际账号与历史Trip数尚未固定；不能推断数据丢失或后台故障。不得为了复现读取Owner邮箱、Session或Token，使用独立合成回访账号Fixture。
