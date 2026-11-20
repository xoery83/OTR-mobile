# MCP Beta Owner Decisions

状态 **FROZEN v1.0**；合同版本 `otr.mcp-beta.contract/1.0.0`。2026-11-16，Pacific/Auckland。正式基线Main `41de43927fd9869673c1ca929e911f58d1f6f96d`；修订起点 `eaaf88aafe080f86a944a1f6219b2d798f405230`。Owner本聊天“Final Revision & Freeze”已批准OD01–OD06及本轮合同冻结；不构成实现、部署或Mutation授权。

最新Owner范围覆盖原附件中的Settlement写入清单。MCP可新增/修改Expense，Settlement只读。保留原附件的Expense Delete/Restore范围与原Ledger权限，Settlement及其Payment/Personal Review写动作退出本Beta。Personal Payments按保守边界仅读，独立身份/付款声称仍遵循Ledger原模型。以上范围决定在本包统一应用。

六文档互相引用同一Registry和Schema，单项标CONTRACT_NEW表示已冻结、尚待实现的正式端口/overload，不能认定当前已实现。已有接口不据QA白名单、短窗口或临时Runtime重新设计。

## 1. 已批准Owner Decision Register

OD01–OD06全部ACCEPTED。可信来源为本聊天Owner“Final Revision & Freeze”完整指令；其中OD04明确覆盖旧候选60秒方案。这里只冻结产品合同；启动开发Agent、真实环境权限和具体业务确认分别遵守后续授权。

| ID | 实际冲突/不足与原依据 | 已批准方案（ACCEPTED） | 影响范围 | 对应实施约束 |
| --- | --- | --- | --- | --- |
| OD01 | Beta要求Trip Archive/Delete，固定Main只有Create/Metadata/Discovery，缺生命周期合同。Ledger保留历史/财务不可变要求不得被Trip删除绕过 | Archive为owner管理的可恢复归档状态，仍可经明确归档筛选/深链合法读取；Unarchive由当前owner使用同一Trip Lifecycle Owning Port把ARCHIVED恢复ACTIVE；Delete为owner确认的逻辑删除，默认MyTrips隐藏且不接受新业务写入，保留原Receipt、财务、Item关系和审计。无物理purge或级联删文件；两者都用现有Trip aggregate版本和独立原operation | Trip lifecycle Reader、普通Actor/所有者、Discovery、Native缓存/Cold | otr.trip.archive/unarchive/delete/lifecycle.base/operation；状态转换/Receipt沿Server合同 |
| OD02 | Beta要求Item Hide/Restore/Delete；Main有HIDE/RESTORE图语义但未普通资格化，无独立Delete。Hide和取消行程不能混同删除 | Hide修改对象隐藏状态，默认Day隐藏，管理列表可见；Restore只恢复Hide；Delete为独立可审计逻辑删除，默认不可被Restore恢复，保留Receipt/Expense关系历史与受保护资料，无永久清理/取消Booking副作用 | 六类Item生命周期、Core state/read projection、Native Day/Details/关系 | 各otr.pN.delete；Hide/Restore既有OBJECT_ONLY后果可以独立实现但最终显示区别按已批准OD02 |
| OD03 | “Item正式完整业务字段”与Booking/Entitlement/Instruction独立Authority边界，P3 Contact不在现有Stay details，不能把商业确认/住客分配当普通Room字段 | Beta完整覆盖本合同明列的P1–P6 canonical Item fields及Expense关联。既有Instruction/Contact/Booking/Ticket摘要可合法读及保留；新增/修改结构化Instruction、Booking、Entitlement和Guest-to-Room assignment在有正式产品字段合同前不纳入。普通用户明确指示可作为notes文本，但不把结构化/私有信息强塞Notes冒充完成 | P3和其他Item字段保真、Layer2完整性报告；无需Document/Import写入 | F303/F304等边缘要求，主体P3 Room/日期/地点等不依赖其开发 |
| OD04 | 用户要求Server改动iOS正常自动发现，当前Main依赖General cloud scope/前台读与自适应轮询，Version/Realtime未挂。现有材料没有统一承诺秒级刷新SLA | 前台在线、当前Trip且权限有效：外部服务器正式Commit→对应iOS可见UI自动更新≤15秒，含发现/Reader/安装/渲染全程。后台不要求即时推送；前台恢复/重连立即调度正常同步；网络异常沿既有Backoff，缓存/权限隔离保持。不强制Realtime；计时及领域覆盖见Sync §6 | Layer1 foreground auto-refresh验收和电量/后台行为；Layer2不依赖技术方案 | Layer1必须修调度、记录时钟误差及Commit/UI证据；不能以15秒轮询间隔代替15秒端到端SLA |
| OD05 | 原附件称“合法Trip选择和跨Trip操作”，现有Core Item/Expense根都Trip-scoped，未有Move Root Port | Beta支持跨Trip查询、分别选择合法目标Trip和独立Create/Update，确认摘要显示每个Trip。已有对象跨Trip Move不纳入，不能用复制+删除冒充Move；若Owner要求Move需另定义Owning语义 | Trip选择与批次计划、用户“搬到另一旅行”的措辞 | 仅真正Move请求；普通跨Trip查询和分别合法新增不阻塞 |
| OD06 | 最新Owner禁止Settlement任何修改。原Ledger明确Personal Payment不改变canonical Settlement，容易对“付款可否新增”产生两种解释 | 此Beta把Settlement及其Transfer/Personal Payment/Review区域一并只读。仅Expense内银行成本记录作为Expense事实的一部分可在用户明确要求时写，不创建转账/确认/Review Checkpoint | 只读Payment/Review工具、Expense付款成本字段、Layer3允许集 | Personal Payment新增/编辑不在本Beta；本合同已批准只读，模型不能自行开启 |

## 2. 已确定并直接继承，无需新产品决策

- **Settlement只读**来自本聊天Owner后续明确指令，覆盖原附件全部Settlement写清单。Reopen、Finalize、Adjustment、Correction、Supersede和Payment confirm等不再是本轮待选功能。既有Main Reopen返回SETTLEMENT_REOPEN_NOT_ALLOWED，保留原Native合同。
- Expense Add/Edit允许，Delete/Restore沿原附件范围与原Ledger final保护。已Final Expense不能经MCP调用Correction绕过只读Settlement。
- Visibility与Participation独立。沿用coreCanRead/coreCanManage，Organizer不因此获得他人PRIVATE或非WHOLE_GROUP对象广泛管理权；选择Person不授予Account访问。无需Owner重新选一个权限模型。
- Expense Split/FX/金额精度沿现有Ledger整数minor units、币种scale、拆分/valuation/refinement。未知币种、同名人员、财务信息矛盾由具体用户澄清，不新增全局产品决策。
- USER明确结构化业务修改用正式MANUAL路径，原资料不产生Import权限或Source Proof。GPT自行理解附件，OTR无第二次模型解析/Import AI调用。
- Documents/Photos/Cover文件管理、Member/Invite/Claim/Organizer/Profile写、Claude接线不在Beta，不能借它们补本范围缺口。History/Export本候选提供JSON数据导出，远程文件制品/Storage管理延后，不创建远程文件服务。
- 工程上使用哪个独立数据库/Simulator、现有poll优化方式、Schema导出器、正常QA账号，不需要Owner产品决策。实际受保护环境动作仍按当时真实授权，但不写进产品API白名单。

## 3. 审核与冻结记录

当前状态 **FROZEN v1.0**；合同版本 `otr.mcp-beta.contract/1.0.0`。2026-11-16，Pacific/Auckland。正式基线Main `41de43927fd9869673c1ca929e911f58d1f6f96d`；修订起点 `eaaf88aafe080f86a944a1f6219b2d798f405230`。Owner本聊天“Final Revision & Freeze”已批准OD01–OD06及本轮合同冻结；不构成实现、部署或Mutation授权。


冻结记录的六文件哈希、Registry哈希、Source Pins、合同源提交与交接提交定位见 `FROZEN_HANDOFF_MANIFEST.json`。同一提交不自报自身SHA；交接提交固定引用已存在的合同源提交。独立Review见 `FINAL_REVIEW.md`。
