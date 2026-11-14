# Import V3 UX-C2 — Exception Review & Composer

2026-11-14 · Owner接受UX-C1 `3227ead90`后实施 · 不Merge/Push。

## 实际修改

- 原生Review Stack使用普通全屏push及系统Back，底部Shell不出现。固定来源文件/提交时间/剩余数量不随列表滚动。全宽连续列表、中性类型图标、问题优先、对象副文、单accordion；来源使用真实文件名横向切换，一个原文面板。原件通过已有私有文件store及授权viewer读取，不恢复Source Proof或字段定位。
- 持久决定保存后折叠原行，不自动打开下一行；green check配合Applying/本机等待/DEV批次确认文本。只有`owner.check() === VERIFIED`才从未解决列表移除并减少remaining。UNKNOWN保留原ID、不自动重发。Needs Recheck保留原答复且不提供再次保存原失败操作。使用Native `maintainVisibleContentPosition`保留列表锚点，不创建滚动恢复系统。
- TYPE-05直接补充现有Core真正要求的缺失标题/日期，以及P5端点/服务事实；日期可输入或使用现有UiDatePicker。已有非空事实不被这些输入覆盖；不补造时间，不开放字段级UPDATE。无效日期或不符合现有Core合同的payload不能确认。
- **用户确实补充事实并明确Confirm NEW时**，复用现有MANUAL命令创建所展示的条目；不把用户填写日期伪标为PROVIDER。仅在原本地submission resolution中增加可选`manual`事实，旧记录兼容，原Candidate/Operation ID不变。正常自动IMPORT仍走原IMPORT路径；LINK不修改Item字段。Core、SQL、ACL、RLS、Role、Grant均未修改。
- Composer仅修既有26pt Sheet外框、受限宽度/90%高度、数量与Tray/Magic Input对齐及安全区。紧凑附件菜单、草稿、原件、Clear All、Submit路径保持。

## UX-C1遗留核实

1. 真实缺陷：Processing的主关闭按钮原为Done，现按同一视图阶段显示Close；Results仍为Done。原hide handler不调用任务取消。
2. 完整Batch主投影原已核对完整候选集合，不以已返回的Receipt子集计完成。针对缺失/其他候选/关联pending增加测试。另修实际边界：最新读取失败时，即使上次所有缓存观察为VERIFIED，也显示uncertain，不宣称本轮独立核验完成。旧iPhone只读Receipt子集截图不代表整个Batch完成，没有把它升级成生产运行证据。没有新增Batch状态机。

## 验证及证据性质

**iPhone16 Pro主设备，正常登录的完整App内合成验收：** 未复制其他设备Session、SQLite、Keychain、原件。临时路由直接使用产品Review/Composer组件，标题明确Synthetic；两份新合成TXT通过既有私有原件库保留并实际读取。没有Provider/业务API写入，临时入口不进入产品源码，验收后移除。

- 收起列表、固定Context、一次展开一个问题；实际切换两份命名来源，打开真实本机TXT原文。
- TYPE-05 UI实际输入`2026-12-18`后Confirm；保存决定/折叠/Applying时5 remaining不变；应用**现有Core内存执行器**并核对后变为4。隔离结果为1个P1、2个LOCAL_ONLY Document、2条关联；日期准确、时间null。见`type05-isolated-core.json`：明确`ISOLATED_CORE_NOT_DEV_RECEIPT`，不是正式DEV Receipt或新Cloud Save。
- Needs Recheck保留原日期；离线/UNKNOWN未减数，未出现重发。中文浅色、英文深色、系统字号3→6实际切换，恢复Light/3。操作记录见`interaction-record.md`。
- Composer从正常Trip→Add→Import进入；真实键盘输入/Inline Add仅暂存一个`UX-C2 layout check — not submitted`草稿，未Submit。该草稿保留，不清理用户既有数据。

**iPad辅助：** 同一旧设备原位安装回归候选，验证全屏Review/单项展开/系统Back/正常Composer宽度；随后恢复原JS/native程序，保留旧B1/B2数据与特殊历史fixture读取，图片资源目录已纠正。适配截图是C2候选实际运行，不冒称iPad最终已安装新的常规发布包。

**静态/定向：** Core命令生成、真实owning mutation、scope/原ID/UNKNOWN、Review状态与UI交互、持久record重新读取、完整Batch与partial receipts、Composer原行为。UI guard和改动文件lint检查。全仓既有3处typecheck错误单列，未降级校验。

## 最小文件范围

`ImportExceptionReviewScreen.tsx`、`universalV3Review.ts`及其测试；原`importSubmissionRepository`增加可选事实及回读测试；`UniversalCaptureResults`修未解决计数；`UniversalV3ResultPresentation`关闭文案；`universalV3Activity`读失败优先级；`CaptureComposer`局部样式；`app/_layout.tsx`仅Review presentation；catalog中英文本。没有新引擎/队列/Receipt/SQL或外部接口。

## 真实限制 / 停止点

- 本轮没有新的真实DEV Save/APPLIED Receipt，也没有新DeepSeek；TYPE-05保存结果为隔离Core执行，不能当作Cloud E2E。现有正式Core保存接口未改变。
- 未在物理iPhone/iPad验证。完整App的Trip摘要/Day入口/Ledger遮挡及各分支最终集成仍是独立缺口，未借本Slice修复或宣称通过。
- Results→Activity-filtered Updates→Review仍为Slice6；完整字段UPDATE为B4；Documents为Slice5，均未开始。
- UX-C2候选完成后停止，等待Owner查看实际截图。整体Import UX仍为PARTIAL。

## 交付截图索引

- `screenshots/report-review-list-expanded.png`：iPhone收起/中间项展开（合成状态）。
- `screenshots/report-type05-applying-resolved.png`：决定已保存仍5项；隔离Core应用后4项。
- `screenshots/report-processing-close-results-done.png`：Processing Close / Results Done。
- `screenshots/report-composer-before-after.png`：同iPhone/中文/Light/字号3，正常Composer前后。
- `screenshots/iphone16-second-source-original.png`：实际本机TXT来源切换。
- `screenshots/iphone16-review-en-dark-large.png`：主设备英文/深色/大字号。
- `screenshots/ipad-review-middle-expanded-en-light.png`、`ipad-composer-en-light.png`：辅助适配。

121项/7文件定向验证、guard及scoped lint通过；全仓typecheck仅剩既有3处错误。最终UI在Needs Recheck中只读保留答复，不提供重复Confirm。部分早期状态截图拍于同轮候选的该小修正前，不冒称最终包逐像素截图。

兼容性说明：有用户补充但尚未入队的待决策记录时，不应降级到会丢弃可选manual事实的旧Native reader；本轮未建立自动降级/迁移系统。已有已入队命令保留原MANUAL模式和Operation身份。
