# UNIFIED_REGRESSION_RESULT

本轮范围：独立候选，本机隔离测试、标准Backend本地关闭态启动、完整iPhone App只读导航/恢复。没有共享DEV部署/SQL/权限改动，没有付费Provider或业务Save。

## 自动与构建

|验证|实际结果|范围与限制|
|---|---|---|
|Auth/People/Shared/UI/DB初轮|72文件，1234通过/2失败；两项均已修复|失败为79布局不被Guest识别及旧75期望；未把最初失败隐藏成一次全绿|
|Guest/79修复复测|4文件142 PASS|含真实磁盘库冷重开、原Queue/Proof、未知登记拒绝|
|共享路径/Review/Results/Ledger复核|11文件226 PASS|包含100项Trip组件测试；不是独立Harness替代真实App|
|Native Reader/PG Storage|6文件120 PASS|授权DTO/LOCAL_ONLY投影、正常权限、Commit/Replay/Observer|
|Downstream/Bootstrap/Repository复核|4文件176 PASS|保留discovery、前台当前性和access-loss；Account测试显式mock Guest owning边界，实际Guest另测|
|MCP|27文件384 PASS；独立typecheck/build PASS|官方SDK用本机回环测试；无真实Consumer/DEV授权激活|
|Parent+IMPORT兼容|2文件8 PASS|复用实际Parent版本的纯Core兼容测试；非新增DEV写入|
|UI Guard/改动文件Lint/diff check|PASS|全仓旧风格不重复清理|
|Backend标准/capture build|均PASS|标准脚本纠正为现有capture使用的Native外部模块边界|
|标准编译入口实际启动|health200、MCP404|无效本地测试凭据；所有出站被拦截，既有Finance扫描1次尝试被阻断，实际交付网络0；不是实际DEV健康声明|
|iOS产品JS export|PASS，2344模块、98资源|正常expo-router/entry，无临时路由/Mock Provider；保留原生壳|
|全仓TypeScript|BASELINE_FAIL，仅既有3处|universalContinuationRuntime.ts:658/660 presentationTier；browser/auth-consent/main.tsx react-dom/client声明；未新增错误|

计数有重叠，不相加制造“总验收数”。Phase4B空白模型证据固定于其Guide/Schema版本；后续C02改动的SDK通过不等于重新做过该模型验收。没有重跑全部历史B1/55/33项未受影响验收，也没有额外Agent或新模型执行。

## 完整iPhone App实际操作

设备89935253…，bundle `com.xoery.otrmobile.uxc1iphone16`，正常DEV后端配置与原Session。不是临时只读App；未复制旧设备Session/Keychain/SQLite/私有原件。

1. 正常My Trips进入同一Trip；Trip Cover图片实际显示。
2. Trip Home→日期→真实Day Feed，显示酒店/Workshop/Boardwalk/NZ1等既有条目，未把selector当最终Feed。
3. 酒店展开→正式Details，入住11月14日、退房11月15日；系统Back返回。没有编辑或保存。
4. 正常Add→Import Composer，看见原 `UX-C2 layout check — not submitted` 草稿；Close返回，不点击Submit/Analyze/Confirm。
5. Ledger Spending及Settlement Overview可读；没有触发结算、Expense写入或Preview执行。
6. 进程终止/冷启动后仍登录同一App、同两条Trip；再进Import同一草稿仍在。
7. 最终源码 `63b82873142452de459f7712949c47e45c9f2061` 再次封包原位安装并冷启动，正常My Trips与Cover可见；SQLite78→79，sync_operations仍0且摘要与之前相同。iOS可重定位Data容器路径，核对的是内容，不假定路径永久不变。

交互链的主体截图/操作发生于133196d2；最终63b82873额外回收默认关闭的Native版本组合后重做了启动/磁盘读回。UI组件未变，不伪报每张截图均来自最终SHA。完整Review/Results实机链本轮未重新创建，因为iPhone没有旧iPad本机Batch；已通过C2/B1的组件/保存证据复用，本轮接口兼容另测。没有复制旧Batch或原件填补此差异。

## 数据库/运行边界

已装V3六份SQL、P2关联、有限IMPORT合同保持原样；本轮未独立再查共享PG系统目录或执行Migration。f650 Parent与IMPORT共存DEV回执是既有证据，不升级为本候选已部署。未操作QA179/QA176、Production、旧Provider UNKNOWN。

截图在`screenshots/`；日志/源输入/设备存储前后像在`evidence/`。原iPad及四线工作树均保留。新版Apple Native壳、统一真机、完整Consumer与新真实Provider验收仍NOT_RUN。
