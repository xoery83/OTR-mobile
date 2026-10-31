# OTR DEV Serial Bottleneck Investigation — 2026-10-31

**范围：只读调查；本报告不是实施授权。** 调查 2026-10-28～31 的现存代码、固定收据和近期聊天记录。没有为本调查部署、查询 Secret 原文、修改 SQL/权限/main、调用付费模型或操作设备。原 Import Photo 执行窗口在调查开始前已经关闭。

时间口径：带 `Z` 为 UTC；NZDT = UTC+13。`UNKNOWN` 表示没有相应事件时间。Git 固定时间、聊天 Turn 时间、窗口计划起止、业务提交时间，**均不自动等于排队开始、READY 或资源释放时间**。

## 1. Executive Summary

1. **必要串行对象是共享状态变更，不是整条 E2E。** 当前只有一个已核验的共享 Backend 服务和 Supabase DEV 项目；同服务版本切换、相交的受保护函数/ACL/RLS/config 变更需要唯一 Writer。普通已授权、不同 QA Actor/Trip 的 API 已有并行成功证据：Import 保留 Host/SQL Writer 时，Auth 完成 Person 写入/负例，MCP 完成 Read 和 P3 Create/Edit，Native 完成独立 iPad 下行观察。[E1–E4]
2. **不能把所有延误归因于排队。** 反复的资格包/共享哈希兼容确认、人工交接，以及进入 E2E 后才暴露的功能/预算错误共同拉长交付。Photo 的首次 lookup guard 错误、Auth 的 publication HTTP 超时、MCP 的 N+1/读取预算，是工程失败，不是等待 Root 安装的时长。Realtime/Enrichment 的部分缺口则是 owning 接口尚未完成，尚非 READY release。[E5–E10]
3. **先缩短单 DEV 的独占边界，复用现有隔离测试；暂不新增第二 Supabase。** 现有 CAS、事务、关闭器、独立 timer、部署回滚、network-none PG/镜像测试已能支撑最小改进。最先应明确“普通 QA API 不占全局发布窗口”，再把共享变更收敛到一次短预检→变更→Smoke→Receipt→释放；业务 E2E 另持自身数据/能力租约。**没有足够事件时间戳计算四线平均排队时间，也不能给出可信节省百分比。**[E11–E14]

## 2. Current DEV Workflow

实际共享目标：`otr-dev-backend`；Supabase DEV `tuqigdxrvrerfewsxqgm`。本次引用既有收据，不重新连接 Hosted 环境核验即时状态。

| 步骤 | 当前实际执行者/输入 | 验收与自动化 | 需要独占什么 | 人工依赖、失败后如何处理 |
|---|---|---|---|---|
| Coding | 各领域 Agent；独立 Worktree、固定接口 Writer | 本域实现、定向检查、Commit | 同一共享文件/接口的 Writer；不是全局 DEV | 共享文件通过消息移交；领域普通修复不需 Root 批准 |
| Isolated Test | 本域 Agent | Vitest、network-none PG、关闭镜像、协议/故障测试；已有脚本 | 本机内存/构建资源；独立 fixture 无 Hosted 锁 | fixture 与 Hosted ACL 不一致会产生假阻塞；须标明差异，不能静默新增 DEV 权限 |
| Independent Review | 不同作者；固定 Diff、失败收据、候选哈希 | 风险相称的 Review，已有 NO_BLOCKER 收据 | 不占共享 DEV | 修复后定向复核；不应因等 Reviewer 停掉独立编码 |
| Release Package | 本域 Owner，涉及共享边界时与唯一 Writer 协调 | Commit/Digest、SQL 前后像、Owner/ACL、权限差异、目标、关闭和回滚 | 准备/构建无需占 Hosted | 包格式因 Auth/Import/Native 不同；相邻资格缺口有拆包反复现象 |
| Root Queue / handoff | 当前共享 SQL/Host 执行 Writer＋请求 Agent | 聊天中 READY、归还、核对实际基线 | 需要锁定的共享资源，而非全体 Agent | 主要靠消息；未发现所检查材料中有统一跨 Lane、包含完整五时点的队列账本 |
| DEV deployment | 已获授权的 Delivery Owner/当前 Host Writer；固定镜像与旧健康版本 | 版本/config/mount CAS、健康、未认证拒绝、独立读回、失败回滚 | **同一个服务的切换及可回滚验证** | 普通不扩权镜像已有 Standing Authorization；不是每个 Digest 都要 Owner 再批。漂移/UNKNOWN 先读回，不盲重试 |
| Protected SQL / Authority | 当前精确 Gate 指定的 SQL Writer；新增权限须 Owner 精确批准 | 默认关闭安装、OID/Owner/ACL/定义 CAS、事务、独立关闭核查 | 相交函数/表/ACL/policy；必要时发布组合短事务 | Auth 包明确 Root sole SQL/Host Writer；这不代表普通业务 API 技术上也必须由 Root 执行 |
| Smoke / Receipt | 执行者＋独立核查者 | 容器/Digest/config、功能端口、关闭状态、部署回执 | 仅共享变更的最小检查段 | 当前可能等待聊天 HANDOFF_VERIFIED；失败回滚/读回后归还，不应在全局窗口里构建或修控制器 |
| Agent E2E | 正常 QA Actor/Trip；各本域 Agent | API/正式回执、独立读回、Native 恢复、幂等/负例 | 本次 QA 对象、Provider 资源额度、具体设备/会话 | 不改共享配置的普通 E2E 可并行。需要新共享修复时重新排**该变更**，不是整条线全部重新预约 |
| main integration | 各 Owner 按最新 HEAD 串行集成 | 固定已验收切片、保留其他未提交文件、合并 Smoke | main 指针及相交文件 Writer | 已有“默认关闭源码先入 main、DEV 后验收”的实际例子；不必与服务锁合并 |

**已经存在的自动化，不应重建：** Import scope SQL 使用事务级 advisory lock；关闭器有 Host `flock`、精确容器/config 检查、独立读回；Auth 有只关闭/只读 helper 与 timer；Host session helper 有正常 QA 登录及清理；设备有独立 UDID/session/claim。[E11–E14]

**锁的证据边界：** `universal_runtime_close.py` 的 `/run/lock/otr-universal-finite-service.lock` 是关闭/恢复操作锁，不能据此声称整条 E2E 一直持有 OS 锁。聊天中的“DEV 窗口/Host Writer”是更长的组织预留；两者不能混算。所检查脚本未证明一个覆盖所有 Lane 的统一调度服务，也未做全仓锁机制审计。

## 3. Recent Queue Evidence

### 3.1 代表性请求与资源

`R/Q/E/F` 分别是 Request / READY / 首次执行 / Finish-release。未保留事件时间则写 UNKNOWN；“未执行”不是 UNKNOWN。“额外成本 UNKNOWN”不等于发生了额外消费。

| ID / 类别 | 请求及 Agent | R / Q | E / F 或实际时间锚 | 等待 / 占用时长 | 原因、重复与独占判断 |
|---|---|---|---|---|---|
| A1：Schema＋函数/EXEC/RLS | Auth atomic Adoption，Gate `fd671463…` | R/Q 时间 UNKNOWN；固定包、Owner 已批准 | 精确包 installed CLOSED；固定安装时刻 UNKNOWN；最终真实 Adoption 收据存在 | 两者 UNKNOWN | 私有 schema、6 表/24 函数、14 owning 函数补丁及 EXEC，确需短时唯一 SQL Writer；不是普通登录需全局独占。[E5] |
| A2：关闭能力＋业务窗 | Auth close helper `e7e9351e…`、window `cdc78f41…` | R/Q UNKNOWN；聊天明确“已批，待 Root 安装核验” | 确认 `10-30 17:50:59.917Z`；窗口到期 `17:56:16Z`；实际关闭时间 UNKNOWN | 排队 UNKNOWN；确认至到期剩 **316.083 秒**，不是总占用 | helper 安装与正常 Add 应分开；Publication 一次 HTTP499/14.986s，随后关闭归还，后续有限会话完成。不是单纯排队。[E6] |
| A3：正常 Adoption E2E | Auth 新 Guest 同一合法发布链 | R/Q UNKNOWN | 正常 OTP 请求 `10-30 19:53:04.294Z`；窗口到期 `20:19:05Z`；真实发布/冷恢复通过，精确释放时刻 UNKNOWN | UNKNOWN | 已取得主场景 PASS；不可继续把旧“待安装”状态算成活跃队列。不是恢复/复制已丢失 AppData。[E7] |
| A4：接口 Review | Auth Parent lookup `8079e7b9` | 源码固定 `10-31 11:42:47+13`，**非 READY/请求时刻** | 研究快照仍待 Core owning Review，未部署 | UNKNOWN；不占运行环境 | 是 Reviewer/共享接口排队。期间 Auth 仍完成独立 Profile 准备及正常 Person 验收；不需全线停工。[E1/E8] |
| I1：Backend 修复 | Import Source connection BUSY，`1072af7d` | R/Q UNKNOWN | 固定部署/独立读回 PASS；`10-28 19:14 NZ` 原 Batch Results 恢复；20:08 冷回执恢复 | UNKNOWN | 真实 PG Source role limit=1；修为 runtime-wide FIFO，未加连接额度/权限；技术背压不等于全局 DEV 锁。[E9] |
| I2：持续权限＋共享后像 | Import Gate `091fb547` 及 Native P4/P5-P6 CAS 兼容 | 首包固定 `10-28 16:32:26+13`；兼容包固定 18:43:59、`10-29 07:06:58+13`；均非 READY 时间 | 首包 installed CLOSED verified `10-28 04:07:02.745662Z`；后续兼容执行并关闭 | 排队/占用 UNKNOWN | 后续 Native 已批准的共享 reader 后像触发原“Any drift aborts; …not a rebase permission”；至少两份额外兼容确认，未增加业务权限。[E10] |
| I3：PDF 资格链 | Import `fb1ffffa`→`96d1a07b`→`02b9e632`→`fb0be7f5` | 四包分别固定 `10-30 14:05 /16:25 /18:21 /22:09 NZ`；请求/READY 时间 UNKNOWN | 安装/正式 PDF E2E 已有接受证据；各精确开始/释放 UNKNOWN | UNKNOWN；四包固定跨度 **8h03m26s**，不能当排队时长 | custody 指纹、Provider Source hash、DERIVED Admission 相邻资格反复修正。需整链首输入预检，不能归结为模型解析慢。[E15] |
| I4：Photo 默认关闭安装 | Import `77a6febb`＋`74530956` | 包固定 `10-31 07:03:53 /11:25:00 NZ`；实际请求/READY UNKNOWN | 原安装42501未应用；同事务维护包装获批后安装/恢复验证 PASS | UNKNOWN；两包固定跨度 **4h21m07s**，不是纯等待 | 原安装漏查 Owner SET ROLE/CREATE 条件，发生一次返工；临时维护权限必须事务内恢复。不能把这一返工算 Owner 审批排队。[E16] |
| I5：Photo 业务窗/设备/诊断 | Import 同 PNG Batch、同 Source，三个窗口 | Request/READY UNKNOWN | 控制器 T0：`10-31 12:08:59 /12:58:47 /13:28:27 NZ`；三次均有 CLOSED/EMPTY/timers-stopped 证明，释放精确时刻 UNKNOWN | 预定每次59m；**实际占用 UNKNOWN，不能相加为177m** | Source 前失败，后拿到503；真实首 lookup 在对象不存在时被 guard 拒绝。第一次缺 Journey 诊断被精确设备读回推翻。属于测试/诊断/控制准备不足，非三次成功解析。未取得 Photo 付费或 Save PASS。[E17] |
| N1：共享 Core 接口/Realtime | Native `6570e4a0` GET、`5c372f13` client | 有 reviewed candidate；R/Q 时间 UNKNOWN | 尚未部署/启用；普通下行基线有证据 | 等待 UNKNOWN；目前不持部署锁 | 私有 publisher/subscribe/revocation owning 端口缺失，版本 GET 当前仍 snapshot SQL；不能称只差一次部署、已实现低延迟或成本下降。[E18] |
| N2：设备/构建/main | Native Build125→126→128、FormsQA/AD5/iPad | R/Q UNKNOWN | 构建失败修复、统一126 smoke、iPad128 独立收据存在 | UNKNOWN | Simulator entitlement/embedded env、Runner/存储与观察脚本等非 Hosted 队列原因。不同设备可独立工作，但 GUI 焦点和本机重型构建仍可能冲突。[E19] |
| M1：普通 DEV Read | MCP normal QA，绕过 MCP 的 direct P3 GET | R/Q UNKNOWN | `10-31 00:21:50.472Z`→HTTP200，**13.557s**；另一次同 op receipt GET **20.786s**→404；最终 READ PASS | HTTP等待有测量；Root排队 UNKNOWN；无全局锁必要 | 15s 客户端等待不足、collection后 N+1 完整 snapshot；修本域适配后通过。不能称 Photo 维护导致不可用或把请求时长当队列等待。[E2/E20] |
| M2：普通 DEV 写入＋设备下行 | MCP P3 Create/Edit、Native iPad | R/Q UNKNOWN；设备 READY 通过消息协调 | Create commit `00:40:18.16509Z`；首可见样本 `00:41:02.420Z`；Edit commit `00:56:29.944318Z`；已正式读回/Session 清理 | 约44s是 commit→可见，**不是单次HTTP或Root排队**；资源占用 UNKNOWN | 两次 POST 响应 UNKNOWN 后读同 op 确认 APPLIED，不重 POST；与 Import Host Writer 预留重叠、不同 Actor/Trip 正常执行，无部署/权限变更。[E2/E3] |
| M3：OAuth/未来部署 | MCP＋Auth 新 resource OAuth | 有默认关闭 adapter；完整 owning release READY 未证明 | 公开 discovery 读回；真实 OAuth/业务权限 issuance 未激活 | UNKNOWN；不是已经执行的部署窗 | active grant/audience/client/Consent/业务权限仍需合法接口和精确配置；普通 Supabase Session 不能冒充外部 MCP OAuth。[E4] |
| F1：Provider/Enrichment＋版本互斥 | 独立 Host 分支 `codex/flight-enrichment-host`，不是只有早期9024307b包 | R/Q UNKNOWN；28Oct获准同范围replacement，替换候选prepared但未armed | 既有closed2210失败窗：8条配置命令ACK、capabilities=false；替换8298/fa500 staged-only receipts，最新诊断候选0f222171固定10-28 11:43 NZ；精确执行/释放时刻UNKNOWN | 排队/占用 UNKNOWN；不能把候选准备当真实启用 | Import Scope6仍active/有hold，需明确关闭其dispatcher再切Enrichment runtime，属于真实共享版本互斥；此外有重复基线重封、控制器锁/pins修复及Mac锁屏的设备阻塞。新Provider E2E未证明，不能根据旧README说完全没有Host工作。[E21] |

**成本结论：** 已引用 Import connection 修复新增模型调用0；Enrichment独立包候选轮新增0，后续有限窗不能凭此推算新增成本；MCP/Auth上述普通请求无 AI Provider 调用。Enrichment 28Oct记录的 shared holds USD0.0294912 是保留占用，不是该窗账单或新增费用。Photo 没有正式模型/Save PASS，Source三身份独立读回为空。无法从这些记录计算全项目额外 Provider、VPS 或部署总费用；不把 UNKNOWN 当0，也不把“开窗”当付费调用。

### 3.2 为什么不能给“平均等待时间”

没有统一记录 `requestedAt → readyAt → acquiredAt → mutationFinishedAt → releasedAt`。大量 JSON 只有状态/哈希，聊天只有 Turn 时间，窗口文件只有 T0/expiry。Ready 后因缺接口、准备代码、审批、设备、请求超时分别消耗多久没有可相减的完整事件对。**四线平均等待、P95、Top3按分钟排序均 UNKNOWN。** 以下前三项是按重复证据和阻塞范围确定的重点，不是假装有分钟排名。

## 4. Necessary vs Unnecessary Serialization

| 分类 | 操作 | 最短独占边界/允许并行条件 |
|---|---|---|
| A 必须串行 | 同 Backend 容器/同入口运行版本、共享 config/mount/Secret 引用切换 | fresh baseline CAS→切换→健康/兼容 Smoke→固定 Receipt→释放；构建、Review 和整个 Native E2E 不包括在内 |
| A 必须串行 | 相交 migration、受保护 function/trigger/RLS/GRANT/policy | 唯一 Writer、精确授权、短事务/有序安装、Owner/ACL/后像核查；互不相交也不能在未证明依赖独立前自行同时安装 |
| A 当前配置下必须串行 | Enrichment finite runtime与仍active的Import dispatcher的互斥切换 | 现有分支明确需禁用Import dispatcher才安全启动Enrichment；没有兼容隔离证明前不能同时激活。准备/Review仍可并行，不能仅因它也是Provider请求就视为独立 |
| A 必须串行 | main 更新、同一共享文件 Writer | 最新 HEAD 校验→采用验收切片→必要检查；不自动延伸为 Hosted 服务锁 |
| B 可以并行 | 独立 Coding/Review、network-none fixture/离线回放 | 限制本机内存与大型构建并发；不复制 Hosted credentials/Session 到新环境 |
| B 可以并行 | 已授权、不同 Actor/Trip/operation 的正常 API E2E、只读检查 | 使用正常 Auth/既有权限；固定版本或记录实际版本；迁移/切换时短暂停新请求，UNKNOWN按原身份恢复；同数据有冲突则另持对象锁 |
| B 条件并行 | 已批准 Provider 请求 | 由现有 Usage/Resource Hold/预算/到期/并发许可调度；Source principal limit1或Provider并发1仍须遵守。不能把“免人工预约”变成无界并发或加预算 |
| C 短时串行后释放 | 部署 CAS、SQL install、配置激活、Smoke、Receipt | 自动完成后释放**共享变更锁**；scope自身 TTL/watchdog仍运行。新版本须保留活动业务和读回兼容，回滚不得覆盖别人后续变更 |
| C 短时设备协调 | 同一 Device Hub GUI焦点、同一设备/session、OTP receiver | 精确 UDID/会话/收件对象 claim；只持有实际操作段，自动清理/归还。独立设备不需全局 E2E 串行；GUI前台焦点仍需短协调 |
| D 不确定 | Enrichment新Provider E2E、MCP真实OAuth、Realtime发布/撤销端口 | Enrichment已有更晚Host/finite候选，但capability失败尚未闭环；其他owning接口/运行证据仍缺。不得以并发优化替代正式授权 |
| D 不确定 | 跨Lane所有SQL是否完全独立、Hosted承载上限 | 未做全schema依赖/负载审计，也未读Secret/改连接额；不能承诺无限并行或所有安装可并发 |

**当前不必要的组织串行：** 把“某Agent保留Host/SQL Writer”理解为禁止其他人普通QA GET/POST；等GUI READY时仍预留整个服务；让无需改共享状态的Review/本地构建重新排部署队列；已批准同范围测试重复问同一种窗口。现有 Standing 授权已经排除了部分重复审批，执行口径尚不一致。保留精确 protected Gate、未知结果核对及跨Account隔离，不扩大 Service Role。

## 5. Root Causes — 三个优先瓶颈

| 优先 | 有证据的瓶颈 | 影响及排除的误判 |
|---|---|---|
| 1 | **资源预留粒度与人工交接过大。** Actor/Trip普通请求、Device READY、Backend部署和SQL Writer经常在同一段消息里预约/归还；Root同时接收接口Review、安装、main和协调请求。[E1–E4/E8] | 形成单个消息处理者的排队。实际 Auth/MCP 的并行成功说明不是全局安全规则要求；但没有完整排队计时，不能量化Root被协调占用多少小时 |
| 2 | **资格链/共享后像分段到运行时才闭合。** PDF四份相邻资格包、Native兼容hash确认、Photo安装维护补包及首次lookup缺陷；Enrichment替换候选随共享基线更新重新固定。[E10/E15–E17] | 产生重审/重新预检/重开窗；其中既有必要精确审批，也有可前移的工程失败。第一次误诊和漏掉“新对象首次lookup”测试应计入Import自身返工，不归咎审批制度 |
| 3 | **可恢复读取链路及执行预算/观测不匹配。** Source角色limit1 BUSY、Auth publication约15s被中断、MCP N+1/receipt20.786s、Native Pull及可见字段监测。[E6/E9/E18/E20] | 触发 UNKNOWN、重复登录/观察和重新协调。它们可能发生在合法并行环境中；第二DEV不会修复相同SQL/客户端算法。不能从单次超时断言连接池满或Photo导致服务不可用 |

不存在足够证据证明“Owner每次都必须批准普通部署”仍是现行政策；Owner已给 Standing Authorization。真正新增 Authority、SQL/ACL变化和冻结包禁止漂移的后像仍需精确处理，两者不能混为一类。

## 6. Options A/B/C — 成本、收益与风险

| 方案 | 当前基础与最小动作（建议，未实施） | 预计收益 | 成本/风险 |
|---|---|---|---|
| A 单Hosted DEV，短发布窗口 | 复用现有部署/关闭/事务脚本；统一小Release envelope：Owner、资源write-set、Git/Digest、前后像、权限差异、Gate、Smoke/rollback、五事件时间；Root只处理共享变更，Receipt后释放 | 取消普通API人工排队；减少“先占窗再构建/找设备”和重复问状态；让失败只重新排实际修复 | 工作量相对低，主要整理已有约定/脚本调用；须保证并发E2E有兼容baseline，不能释放后让旧timer回滚新服务 |
| B 单Hosted DEV＋隔离测试 | 已有network-none PG 256MiB、独立SQL/HTTP测试、closed-image smoke、协议fixtures；增加“同一真实命令的首次不存在lookup→创建→闭窗恢复”到现有验收 | 在进入共享服务前发现资格/ACL/控制器组合问题；减少失败窗和反复包 | 工作量低至中；fixture漂移会漏错或假FAIL（本轮extensions ACL差异已有例子）。本机内存是资源约束，避免多套重型构建；本地不能替代真实Auth/Provider/Native E2E |
| C 新Integration/Staging | 第二Backend可隔离已证实的Import/Enrichment bootstrap互斥，但须独立验证其作用域/dispatcher/预算；仍共享DB函数/ACL，第二Supabase才能进一步隔离Schema/Auth | 适用于已有稳定发布列车、频繁互斥破坏性迁移或大量独立集成测试的未来场景；目前没有证据证明它是最短解 | 新增数据库/计算/备份/存储与运维成本；**金额UNKNOWN，未读取账单/定价**。另有schema/RLS/secret/issuer/OAuth redirect/Provider预算/Native构建矩阵漂移；仍须保护main和最终共享目标，不会消除源码缺口或错误预算 |

推荐 **A＋复用已有B**，先建立有效的短资源锁和证据，再决定C。若持续的主要冲突确为Enrichment/Import互斥bootstrap，应先评估同DEV内第二个受限Backend进程，而非直接新增Supabase；本报告不授权启用、增加凭据用途或部署。不是新建第二个权限/队列/测试平台。

## 7. Recommended Minimal Changes — 按优先级三个最小改进

### P0：发布资源锁与普通QA执行明确分开

- 已授权普通API不再申请“全局DEV窗口”；测试Agent登记Actor/Trip/对象/实际服务版本并遵守原预算。不得因此扩权。
- 共享变更单只锁服务、相交SQL/config或main；跨资源组合需显式列write-set。设备/Receiver独立短claim，Reviewer不持服务锁。
- 版本/config已兼容、Smoke及Receipt完成就释放共享变更锁；业务scope仍按既有TTL/独立关闭器运行。切换时只短暂停相应请求，保留所有在途UNKNOWN。
- **今晚最先建议这一项。** 现有正常并行成功已经证明无需先造第二DEV。对于已在Standing范围内的正常QA，这是执行规则澄清，不是再要求用户逐条批准API。

### P1：复用脚本自动完成“Preflight→发布/安装→Smoke→Receipt→释放”

Root最值得自动化的三件具体操作：

1. **只读Release READY判定**：固定源码/镜像、依赖函数后像、权限/安装身份、原件和实际端口、正常Actor、关闭器；验证“首个新对象”路径，不以健康200或本地接口存在代替。发现不合格包则退回对应项，尚不拿Host锁。
2. **服务切换与故障恢复**：复用现有容器/config CAS、独立健康/未授权负例、回滚和关闭；成功自动写Commit/Digest/基线/关闭状态/释放时刻。失败先独立读回，不能自动回滚到不兼容Reader或覆盖另一已接受版本。
3. **protected SQL短事务安装与交接**：复用既有精确Gate、函数/Owner/ACL CAS、临时维护边恢复验证、幂等close/readback；每包一次固定回执，兼容见证集中核对。不能自动接受未批准hash漂移或持久增加管理员权限。

只需扩展现有manifest/回执及调用入口，不做监控平台。五时点先记录，后谈平均等待或收益百分比。

### P2：把相邻资格一次收口，持续业务授权与管理员维护授权分离

- Source→Provider→Review/Admission相邻差异用同一条Golden输入检验；一次准备最小合法变更，精确授权后默认关闭安装。不是为未来能力预授权。
- 已验收业务可用正常Backend Authority＋受限QA Account/Trip＋现有RLS/预算持续运行；临时管理员/安装grant立即恢复。新增长期业务范围仍提交一次精确 owning Gate。
- Import已存在 `CONTINUOUS_MINIMUMS/1`，但到期为 `2026-11-01T08:48:56Z`，且P2/Photo仍有窄范围限制；**它不是全用户、永久或任意图片授权**。延长/泛化、Auth Adoption持续化、MCP OAuth、Realtime新发布权均不能靠本文自行开启。
- 针对已另行批准的兼容后像，可由Owner制定一次可审计兼容接受规则；未批准前继续遵守原hash CAS，不能自行rebase受保护包。

### 必答问题直接结论

| 问题 | 回答 |
|---|---|
| 1 平均在等什么？ | 不能计算平均。可见等待混合了Root人工交接/Review、资格包修复、设备与正常请求延迟；没有证据支持“主要都在等SQL”或“都在等Provider” |
| 2 哪些可取消？ | 普通已授权、disjoint QA API的全局预约；无需共享状态的编码/隔离测试/Review等待；已批准同范围测试的重复窗口审批 |
| 3 哪些必须串行？ | 同服务版本切换、相交protected SQL/config/Secret、main或同文件Writer；最短为CAS→修改→必要Smoke/回执→释放 |
| 4 多Agent可同时正常E2E吗？ | 可以，今天已有真实证据；须正常身份、隔离对象、既有并发/预算许可、可恢复UNKNOWN及变更时短协调 |
| 5 DEV Release与main应分离吗？ | 应分离资源锁及验收状态；允许reviewed固定分支部署、未完成默认关闭源码增量合入，部署不能代替main Review，merge不能代替DEV验收 |
| 6 能有持续最小业务权吗？ | 可以且Import已有窄scope；到期/业务范围明确，不保留临时管理员。新长期授权仍需精确Gate |
| 7 Root自动化前三？ | READY只读核验；服务切换/故障恢复/Receipt自动释放；protected SQL事务安装/关闭核查与单一handoff回执 |
| 8 今晚先改什么？ | 先明确资源级锁与普通QA免全局预约，沿用现有脚本，不先建新环境 |
| 9 要第二DEV吗？ | 目前证据不足；先A＋已有B。若测得长期“两个READY且只因运行版本互斥”排队，再评估第二Backend或完整Staging |
| 10 可减少多少等待？ | 可取消这些类别的一轮人工预约/归还，可避免已知漏检导致的失败窗；**分钟、平均值、百分比均不能可信量化**。不得把8小时包跨度或59分钟TTL当节省值 |

## 8. Decisions Needed from Owner

本轮不请求立即执行，也未改变现行授权。

| 决策 | 建议 | 边界 |
|---|---|---|
| 是否采用资源级发布锁/统一小Release envelope | 同意A＋已有B；Root只持共享变更，普通QA依Standing运行 | 不取消protected Gate、独立Review、预算/RLS；不要求新平台 |
| 是否批准未来“已批准兼容后像”的统一接受规则 | 单独冻结规则及可接受证据，由Owner决定 | 在此之前原Any drift aborts继续有效，脚本不可自行换CAS前像 |
| 到期后的持续受限DEV业务授权 | 本域Owner另交精确范围/到期/关闭包，避免逐Batch临时管理员窗 | 不把当前Nov1 scope自动延长；不扩大到真实用户/Production/任意P2或图片 |
| 是否增加第二Supabase/Staging | 暂缓；先记录READY→锁获取→释放的真实样本 | 当前无预算报价、负载证据和漂移管理方案；不自动采购或建设 |

## 9. Evidence / Unknowns

### 证据索引

以下均为既有收据/代码或只读聊天快照。旧文档有时保留“待批/未执行”，以更晚的安装/关闭/真实回执为准。

- **E1 Auth普通Person与Parent排队**：Auth chat `01a1803b-c5a7-7ab0-a90f-fb4f87609201`，只读Turn起点1793381236及后续最终反馈；固定证据 `de90a085`、`5bcf0013`，Parent源码 `8079e7b9`。本研究未指示其更改任务。
- **E2 MCP实际普通QA读写**：[P3_VERIFY](</Users/xoery/.codex/worktrees/mcp-01-read-only/otr-mobile-canonical/docs/mcp/acceptance/P3_VERIFY.json>)、[Create checkpoint](</Users/xoery/.codex/worktrees/mcp-01-read-only/otr-mobile-canonical/docs/mcp/acceptance/P3_CREATE_CHECKPOINT.json>)、同chat `01a18663-48af-7b80-9fac-408bfa98e2fb` 正在执行Turn1793403928。明确为内部正常Session，非公开OAuth。
- **E3 Native独立观察**：Native chat `01a17101-8b2d-7240-ab67-f4c34a5d90d9` Turn1793406640、消息收据 `9c15ee9d`；P3编辑Core title/rev不在现UI暴露，未冒称该字段Native视觉PASS。
- **E4 Auth OAuth接口现状**：Auth同chat Turn1793405067/1793405269；discovery汇总 `0e51bf13`。公开metadata≠client/业务grant已激活；未读取Secret或在本研究中重测OAuth。
- **E5 Auth atomic owning包**：[Gate](</Users/xoery/.codex/worktrees/auth-identity-delivery-20261028/otr-mobile-canonical/docs/ops/auth-phase2-20261028/hosted-gate-candidate/OWNER_GATE.md>)、[安装部署收据](</Users/xoery/.codex/worktrees/auth-identity-delivery-20261028/otr-mobile-canonical/docs/ops/auth-phase2-20261028/DEV_DEFAULT_CLOSED_DEPLOYMENT.json>)。
- **E6 Auth关闭器/首窗失败**：[close Gate](auth-phase2-20261028/finite-qa-window/OWNER_GATE.md)、[真实Add及关闭](</Users/xoery/.codex/worktrees/auth-identity-delivery-20261028/otr-mobile-canonical/docs/ops/auth-phase2-20261028/FINITE_WINDOW_REAL_ADD_20261031.json>)。
- **E7 Auth新Guest实际闭环**：[真实E2E](</Users/xoery/.codex/worktrees/auth-identity-delivery-20261028/otr-mobile-canonical/docs/ops/auth-phase2-20261028/NEW_GUEST_ADOPTION_GOLDEN_SLICE_REAL_E2E.json>)；[源码增量main集成](auth-phase2-20261028/ADOPTION_EXECUTION_MAIN_INTEGRATION.json)证明源码集成与业务安装状态分开。
- **E8 不等待就能继续的实例**：Auth chat final“Parent待Root、Profile仍独立准备”；Root本chat既有资源协调回复，正常Person验证后归还Receiver；不是本调查新发调度命令。
- **E9 Source角色容量与软件修复**：[固定部署/BUSY收据](universal-product-20261028/authority/CONTINUOUS_SOURCE_SERIAL_DEPLOY_RECEIPT.json)。
- **E10 连续Authority/兼容**：[安装收据](universal-product-20261028/authority/CONTINUOUS_AUTHORITY_INSTALL_RECEIPT.json)、[P4兼容](universal-product-20261028/authority/CONTINUOUS_NATIVE_P4_COMPATIBILITY_GATE.md)、[P5/P6兼容](universal-product-20261028/authority/CONTINUOUS_NATIVE_P5_P6_COMPATIBILITY_GATE.md)。
- **E11 部署/关闭已有工具**：[transition](../../scripts/import/universal_continuous_transition.py)、[runtime close](../../scripts/import/universal_runtime_close.py)、[scope close](../../scripts/import/universal_scope_close.py)。`trip_structured_deploy.py`是10-23历史脚本，仅说明已有CAS/窗口预检模式，不把它15分钟限制冒充所有10-31发布规则。
- **E12 Auth正常QA会话工具**：[Registered Host Session](auth-inbound-otp-20261030/REGISTERED_HOST_SESSION.md)、[真实验收](auth-inbound-otp-20261030/REGISTERED_HOST_REAL_E2E.json)。
- **E13 决策/接口/执行登记**：[Beta Decisions](../beta/BETA_DECISIONS.md)、[Interface Register](../beta/BETA_INTERFACE_REGISTER.md)、[Execution](../beta/BETA_EXECUTION.md)。历史协调规则提供职责边界，但不是完整实时部署队列；后续Owner Standing授权优先。
- **E14 隔离基础**：E9的network-none/256MiB PG证据；[Photo关闭/镜像预检](universal-product-20261028/photo/PHOTO_RUNTIME_CLOSED_PREFLIGHT.json)。
- **E15 PDF相邻资格包**：[Owning Gate](</Users/xoery/.codex/worktrees/universal-product-20261028/otr-mobile-canonical/docs/ops/universal-product-20261028/authority/PDF_SOURCE_RUNTIME_OWNING_GATE.md>)、[custody指纹](</Users/xoery/.codex/worktrees/universal-product-20261028/otr-mobile-canonical/docs/ops/universal-product-20261028/authority/PDF_CUSTODY_FINGERPRINT_REGISTRATION_GATE.md>)、[Provider Source hash](</Users/xoery/.codex/worktrees/universal-product-20261028/otr-mobile-canonical/docs/ops/universal-product-20261028/authority/PDF_PROVIDER_SOURCE_HASH_GATE.md>)、[统一派生证据](</Users/xoery/.codex/worktrees/universal-product-20261028/otr-mobile-canonical/docs/ops/universal-product-20261028/authority/VERIFIED_DERIVED_TEXT_GATE.md>)。固定时间来自Git；不推算审批或排队时间。
- **E16 Photo安装/软件部署**：[Photo Owning Gate](universal-product-20261028/authority/PHOTO_SOURCE_VISION_OWNING_GATE.md)、[同事务维护Gate](universal-product-20261028/authority/PHOTO_TRANSACTIONAL_MAINTENANCE_GATE.md)、[默认关闭镜像](universal-product-20261028/photo/PHOTO_AUTH_DEFAULT_CLOSED_DEPLOYMENT.json)。
- **E17 Photo既有真实执行/纠正**：[第二窗关闭](universal-product-20261028/photo/PHOTO_SECOND_WINDOW_CLOSED.json)、[归属诊断纠正](universal-product-20261028/photo/PHOTO_ACCOUNT_JOURNEY_REPAIR.json)；本chat既有独立第三窗CLOSED、精确Source/representation/operation不存在、首次lookup RED→GREEN收据。后两项仍保存在已存在私有证据目录 `/private/tmp/otr-photo-approved-execution-20261031/`、`/private/tmp/otr-photo-first-lookup-repair-20261031/`；未将私有SQL/凭据复制进报告。
- **E18 Realtime owning缺口**：[Port Gap](native05-06-20261031/REALTIME_OWNING_PORT_GAP.md)、[Trigger验收](native05-06-20261031/REALTIME_TRIGGER_V1_ACCEPTANCE.md)，结合更晚Native chat；旧文档“baseline pending”不能覆盖后续普通基线成功。
- **E19 设备/构建证据**：[Unified126](native-04-downstream-20261030/UNIFIED126_SMOKE.json)、[构建失败](native-04-downstream-20261030/UNIFIED_BUILD_FAILURES.json)、[iPad验收](native05-06-20261031/IPAD_PRIMARY_QA_ACCEPTANCE.md)。
- **E20 MCP请求耗时**：[direct GET](</Users/xoery/.codex/worktrees/mcp-01-read-only/otr-mobile-canonical/docs/mcp/acceptance/READ_DIAGNOSTIC_50S.json>)、同目录READ_ATTEMPT_01～05、MCP/Native近期正常receipt查询20.786s消息。13.557s采用固定JSON值，不把早期聊天13.554s当更精确数据。
- **E21 Enrichment**：旧[集成候选](native-flight-enrichment-20261027/README.md)及chat `01a17a26-c694-7d60-8cd3-4fbb2e2a6486`只代表早期包，不能覆盖后续Host工作。另只读核对 `codex/flight-enrichment-host` / commit `0f222171`（10-28 11:43:19 NZ）：[Deployment review](</Users/xoery/.codex/worktrees/p3-accepted-read-entry/otr-mobile-canonical/docs/ops/native-flight-enrichment-20261027/DEPLOYMENT_REVIEW_20261027.md>)、[Integration readiness](</Users/xoery/.codex/worktrees/p3-accepted-read-entry/otr-mobile-canonical/docs/ops/native-flight-enrichment-20261027/INTEGRATION_READINESS.md>)、[Backend capability诊断](</Users/xoery/.codex/worktrees/p3-accepted-read-entry/otr-mobile-canonical/docs/ops/native-flight-enrichment-20261027/BACKEND_AVAILABILITY_DIAGNOSTIC.md>)，以及同分支finite-acceptance的 `RUNTIME_PREPARED_8298_RECEIPT.json` / `RUNTIME_PREPARED_FA500_RECEIPT.json` / `NODE24_FA500_PREFLIGHT_RECEIPT.json`。有实际失败关闭窗及staged候选；没有将后者冒称运行/付费PASS，排队五时点仍不足。

### Unknowns及限制

- 无统一队列五时点，不能输出平均/总等待或三项耗时排名；报告不补造时间。
- 未读取账单、Secret、全部历史聊天、全部schema依赖或实时锁/数据库负载；不能断言资源容量充足、无任何其他锁、或第二环境的美元成本。
- 部分新证据只在各Agent独立分支/聊天，尚未main集成；报告标明来源，不当成统一main已包含。
- 原权限批准到期、Provider并发/预算、Actor/Trip隔离仍有效；本报告不延长期限、不审批新函数、不打开能力。
- 普通业务并行已有成功实例，但没有部署时在途请求的完整故障注入数据；新发布兼容规则和自动释放仍需单独定向验收。

**结论状态：INVESTIGATION COMPLETE / IMPLEMENTATION NOT AUTHORIZED BY THIS REPORT。等待Owner对建议决策，不自动实施。**
