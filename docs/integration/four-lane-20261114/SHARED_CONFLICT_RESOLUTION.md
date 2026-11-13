# SHARED_CONFLICT_RESOLUTION

实际在独立候选试合后修复，不以“Git无冲突”冒充业务兼容。未操作共享DEV/Production。

|共同合同|实际处理|证据|
|---|---|---|
|SQLite76冲突|保留Import76/77/78，将Parent Metadata前向登记为79；79先清理原parent触发器再按原Auth owning SQL重建、保留行。Auth76旧登记名不改写；78提供统一图片触发器，补齐早期被跳过的PNG路径。|fourLaneMigrationCompatibility：fresh/Import78/Auth76原ID/Queue/Proof、FK、重开、重复迁移通过|
|Guest兼容当前库|原只认74/75的布局判断显式认识当前79的准确登记和必要表；允许两条真实76历史命名。未知登记仍拒绝，非空Capture/原件/范围判断保持。|Guest Cover/Currency/Workspace与79兼容142 PASS；负向未知76验证|
|Sync / Queue / Wake|Auth Parent Metadata/People/Readback与Import统一MANUAL/IMPORT选择并存；保留原Operation和关联等待、Instruction恢复、UNKNOWN。测试改用匹配实际多查询顺序，不删原断言。|初测暴露3个旧序号mock失败；修正后相关Sync/Wake及恢复通过|
|Trip本地与云端Editor|Auth shared editor与Import旧本地editor试合后双挂载。远端editor只在remote-only时挂载，本地原Guest封面/恢复行为保留；删远端不可达本地分支。|100项完整组件交互测试；原稿关闭/保存中不可关闭保护保留|
|Parent+IMPORT+Receipt|保留Auth create-receipt路由、事务池/前后guard；保留Import有限IMPORT、PROVIDER字段、LOCAL_ONLY、add-only LINK与旧Receipt读。|tripCreate测试及authParentImportCompatibility；没有新SQL或权限授予|
|Native Version Reader|从已交付源收回独立Reader，LOCAL_ONLY请求头和正常collection投影一致；Actor/Trip/协议检查不降级。|120 Native/Backend用例，包括新旧头、错误Actor/Trip、缓存后像|
|Native Downstream|合并原discovery状态与version缓存字段；保留isCurrent/generation/access-loss；两种方法接口并存。正常native pull仍使用原readAccessLoss路径，专用version transport没有注入。|176 Bootstrap/Repository/Coordinator复测；Auth F02与访问撤销保持|
|post-COMMIT observer|沿用原可选回调，只有新APPLIED且COMMIT/Lease结束才通知；未给运行时回调、不启用私有通道。|PG Storage局部事务/Replay/异常回调测试|
|Backend构建|标准server脚本与既有capture脚本保持同样的react-native/expo-*外部边界，避免Node打包懒加载Native模块时解析Flow。没有取消数据校验或扩大权限。|标准/捕获构建均通过；实际标准入口本地health200、MCP404|
|MCP/历史运维|没有恢复Auth旧固定Slice1 QA包或旧脚本；MCP新源码为默认关闭，可用端口/业务权限仍由现有机制决定。生成的旧Backend QA包未被旧快照覆盖。|384 MCP；SDK build/typecheck；本地标准入口默认404|

全部修复落在候选。未清理数据、重编号旧Operation、复制Session或改变RLS/ACL/Grant。旧的已装六份V3 SQL、Core MANUAL兼容、P2关联与IMPORT六函数保持原定义；79是**设备本地SQLite前向迁移**，不是新的Supabase迁移。

版本回退注意：不要向已有79 Guest库回退只认识74/75的旧资格Reader；本轮不提供破坏性降级或清库。保留新兼容Reader或停用相关未验证Guest发布动作，既有Account/Item数据不需要重建。
