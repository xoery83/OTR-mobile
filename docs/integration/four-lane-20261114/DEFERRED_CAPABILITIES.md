# DEFERRED_CAPABILITIES

DEFER不表示阻塞所有Main集成；只表示不能因源码进入Main宣称已启用/验收。

|能力|仍缺什么 / 关闭边界|后续归属|
|---|---|---|
|普通Invite/Claim完整Native/多成员|当前preview不是真实邀请；成员Claim owning配置与正常Native组合未认证；历史有限测试不可复用为新授权|Auth/Core；按正常产品任务补齐，不另造权限平台|
|两个独立Apple用户/显式既有Account链接|旧单用户Adoption证据不覆盖这些场景|Auth/Native|
|新Bundle Google|需要对应iOS Client实际配置；不借用别的Bundle资格|Auth/Native|
|新版Apple原生壳联合验收|本轮复用已装完整Simulator Native壳并更新完整产品JS；未重新编译Apple Native模块或真机登录。Auth既有物理证据只适用于其原构建|正常Native构建/发布回归，不是代码合入的额外审批机制|
|Version专用轮询/私有Realtime|Source与可选组合已回收；deps.version未注入、正常pull保持原access-loss。没有cheap SQL/私有订阅撤权的完整运行资格|Native/Core/Auth；不自动开启|
|post-COMMIT私有发布|只收回可选内部hint；未接私有消息和订阅，不能把ID回调当授权|Core/Auth|
|MCP完整OAuth/Consumer Hosted E2E|Phase4B是本地SDK+有限空白模型预览；历史Notes局部Consumer不等于当前全字段Create/多域Apply|MCP/Auth；默认关闭|
|MCP People/Expense/关联尚缺端口|源码/本地Adapter已收回；真实Ledger恢复/链接的owning端口与完整权限未认证的能力不暴露|各owning模块；不复制业务写入|
|Import Slice5/6、完整字段UPDATE|Owner暂停的独立产品范围，本轮未开始|后续短分支按Slice执行|
|跨设备Import本机历史/原件|Local-First设计本来不自动同步原件和本机Batch；iPhone不能伪装拥有iPad原件。未复制SQLite/Session来通过|Document Cloud Sync仍不在范围|
|Legacy Trip Metadata摘要|当前Phase A旧Trip仍显示cached metadata资格提示；Day Feed/Item读取可用，不伪造Parent Receipt。该提示对可读详情的措辞偏宽，后续小UX修正|Native/Auth；不是清库或扩权理由|
|完整统一实机/新Provider闭环|本轮无新模型或Save；Review/Results采用已通过的B1/C2证据与本轮接口测试，不冒充新统一真机闭环|后续正常验收；不为此重放原Batch|
|Root2未提交运维差异|原工作树仍有Writer/release/control补丁和回执；未固定/未完成本轮独审，未擅自提交|Root2先固定交付，再做小集成|
|旧Gallery/固定QA/Cutover/QA176|仅保留Git历史和原工作树；ARCHIVE_CANDIDATE不执行删除|无当前Main依赖|

全仓3个旧TypeScript错误单列在回归报告；本轮没有借集成追加无关修复、依赖或新安全框架。
