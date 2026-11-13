# Import V3 UX-C1 Processing Results Return

2026-11-14 · 基线 `d2c4d0c` · 仅 UX-C1 · 不 Merge/Push。

## 实现与范围

- 保留 Slice1–4 的 Task、自动接纳、Queue/Sync、Core Receipt、Document关联。
  仅新增局部 presentation 组件，不是 Results engine/database 或新状态机。
- 同一 Sheet 按真实执行状态显示 Processing / Import results 标题。
  Progress 时间线只使用真实提交/原件接受/正式回执的时间；当前分析没有可用
  事件时间时不伪造时间。完成结果的历史在一个入口展开，技术细节不在默认页。
- 顶部业务类型标签零隐藏；对象行按正式 Item 身份唯一呈现，并分别标记
  Created / Linked / Updated。Linked不计入新增；多Documents不重复Item。
  日期、时间、地点从授权accepted Item/所属transport endpoints读取，
  `Recorded`单独使用正式Receipt时间，不用文件日期或UI时钟冒充。
- Done始终可用，且不受Review、UNKNOWN或等待关联影响。Needs Review为独立入口。
  UNKNOWN仅原ID核对。真实REJECTED进入原保存操作详情，展示原ID/正式拒绝原因，
  使用原owning检查读回；不进入Semantic Review，不提供盲目重发。
- Item/Document沿用原Details/原件reader，Trip/Day返回使用现有Stack机制。
  Activity/Results共享既有Sheet容器，C1内容在iPad限制阅读宽度720pt、上限90%
  可用屏幕高度；这是局部呈现目标，不是新全局token或Composer改版。

## 常驻完整 DEV 环境与主验收设备补充

Owner进一步要求后续Import持续使用该完整环境，不把临时预览环境作为主设备。主包使用标准Expo Router入口、正式Provider/Backend接线，保留新正常DEV会话及本机数据库；只读验收入口在本轮结束移除。构建目录位于临时路径不代表Simulator数据临时，运行数据位于CoreSimulator常驻设备目录。

Owner后续将主设备改为iPhone16 Pro，并明确批准正常登录完整App中的临时只读验收入口。主设备独立创建、正常登录；新Session由原正式Auth路径取得，没有复制旧Session/SQLite/Keychain/原件。实际看到原Trip及正式Item；正常Recent submissions为空，是本机历史现状，不伪装跨设备恢复。临时入口仅现有Core GET和accepted snapshot读回，Receipt经现有校验；不执行submit/enqueue或Provider。Processing为明确合成展示。入口只在临时构建目录，不在产品源码。

## iPhone16 完整环境实际结果

主设备 `89935253-B3B0-4851-ADCA-87AFED548C7E`，完整 OTR DEV，固定 Bundle ID
`com.xoery.otrmobile.uxc1iphone16`。正常登录和云端 Trip / Item 读取已通过。
临时只读入口通过现有认证 Core API 顺序 GET 三份 FULL 正式 Receipt；hash 与
既有独立 PostgreSQL 证据一致。实际展示2个唯一对象：Created1、Linked1，
Flight1、Activity1。对象打开正式 Details 并返回相同 Results，Done独立结束查看。
这是实际已保存结果子集，不冒称跨设备完整 Batch 历史恢复；原Review未被解决。
Processing截图明确标记合成，不冒充模型正在执行。未取得iPhone本地原件打开
证明，原件未从iPad复制。此前iPhone17图片仅辅助布局证据，不当作主设备验收。

TripCover缺图根因为安装时资源多嵌套一层目录。修正为将Expo导出资源内容放入
App bundle根目录；96个文件hash匹配，实际看到封面和推荐图片。
`asset-package-check.json`、`iphone16-trip-cover-picker.png`为对应证据。
本轮结束原位安装正常主包：标准入口、真实DEV transport、DEV Batch确认开启，
移除临时验收入口，保留同一设备/登录/SQLite。没有重新实现或迁移其他模块。

顺序GET修复了临时验收读取并发导致的 `CORE_CONNECTION_BUSY` 503；未修改
数据库或Backend权限。`iphone16-authenticated-receipts.json`记录真实读回。

## 验收证据的性质

**完整 App + 原真实DEV数据（iPad）：** 原Batch `8b3ca4ad…`、job `23bec76c…`、
00:22:34，从正常Trip→Import→最近提交打开。实际读取原回执，新增Gallery1、
关联AA1302 1、Needs Review1、ABSTAIN1。Done在Review未解决时正常返回Trip；
重入后仍为原Batch。Gallery→实际P6 Details→Back；关联文字原件实际显示全文。
英/中、浅/深色实际切换；没有Analyze、Confirm或Save。

**iPhone只读布局样本：** 专用Simulator `AEC6920F-8E24-45BA-BAAF-C8B405CEA54A`，
bundle `com.xoery.otrmobile.uxc1preview`。临时完整App路由只挂载真实产品
CaptureComposer/UniversalV3ResultPresentation，传入明确标注的只读合成事实。
没有复制任何Session、Keychain、SQLite或操作队列；没有网络/保存动作。
验证Results、Processing、UNKNOWN、关联待完成、Save Failed、Done、中文/英文、
浅/深色、系统Text Size3→6和滚动。**这是原生组件布局/交互验证，不是iPhone真实
DEV业务E2E，不替代iPad的真实回执验证。** 临时路由/fixture未进入产品源码。

前后对照使用同一iPad Simulator、English、Light、系统字号3。Before为
Slice4原实际截图；After为本轮实际候选截图；不是新生成概念图。

`read-only-invariants.json`确认原Trip仍为4 Items / 5 active links / 12 receipts；
全部31份本地既有receipt hash及三个synthetic dispatch count不变。
本轮真实DeepSeek=0，新增业务Item/关联=0；不操作QA179、SQL或Production。
独立PG读回复用Slice4内容，C1不声称另执行了一次PG核验。

## 验证与剩余范围

60项定向测试通过（六文件）；包含结果去重/原receipt观察、Done与Review独立、
零类别隐藏、UNKNOWN、REJECTED原操作详情、transport业务时间与记录时钟分离。
UI guard通过；改动UI lint零错误，保留既有CaptureContent require警告。
全仓typecheck仍有既有三处错误：两处fixture presentationTier和react-dom/client类型。
CaptureContent旧测试仍在加载原Native依赖时失败，不冒称全仓测试PASS。

UX-C2未开始：Review V2固定Context、单accordion、命名来源面板、Decision Saved/
Applying/Applied/Needs Recheck、remaining实际resolved后递减、TYPE-05 inline输入，
以及Composer局部Foundation对齐，均须下一轮授权。不以“手工补充”文案当完成功能。
Results→activity-filtered Updates→Review明确保留Slice6导航依赖。
拒绝Operation没有既有通用自动修复命令；当前恢复入口提供准确原操作读回和拒绝
原因，**不宣称所有拒绝都已可一键修好**。不为此创建Save/Recovery engine。

**停止等待Owner UX-C1审核；不启动UX-C2或Slice5/6。**
