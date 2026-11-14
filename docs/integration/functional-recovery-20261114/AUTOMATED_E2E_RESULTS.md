# Test Health Report / Automated E2E Results

2026-11-14 · **NOT PASS** · Product Functional Integrity 另见 FUNCTIONAL_RECOVERY_MATRIX。

## 原始失败根因

原始全量 905 文件：11,993 tests = 11,616 PASS / 216 FAIL / 161 原有 Pending。216 项逐条保留在 `failure-root-causes.json`，没有删除、跳过或放松断言。

|初次分类|数量|处理|
|---|---:|---|
|测试基础设施|173|sandbox socket/loopback、Node RN 常量、原生 port mocks、required runtime directory 等；按真实调用契约修夹具，不放宽产品权限|
|历史断言/夹具|31|Schema 79、已批准导航/Apple、普通 Auth accountClass；保留原历史行/FK/Queue/幂等检查|
|测试发现的真实产品缺陷|2|Keyboard tap policy、FX 注入时钟，已修并复测；不代表产品仅这两个缺陷|
|待核实|10|边界扫描、初次环境/迁移等；逐项最新结果见 JSON，不因名称猜测|

原216最新：{'failed': 34, 'passed': 182}。测试标题含随机 UUID、Apple 已批准行为更名、BOM 原合同变化都有明确映射，不让失败从统计中消失。

## 实际运行

|运行|结果|限制|
|---|---|---|
|最终一次全量（905 文件）|12,014 tests：11,806 PASS / 47 FAIL / 161 Pending|产品953 + 当时夹具改动；不是 clean release SHA 全绿|
|低并发原超时复测|195 tests：194 PASS / 1 旧诊断断言 FAIL|10 项全量并发失败复测通过；未增加 timeout|
|诊断 final|6 PASS|真实 require 入口使用既有 Node Module port mock；原 Keychain 禁写、SQL query_only 断言保留；launch marker 精确检查|
|BOM owning contract|35 PASS|负面 preflight 改用 BOM-only；新增有效 BOM 原件/摘要正面检查；不改产品代码|
|MCP 独立配置|384 PASS|正确 root config，非 Hosted Consumer|
|UI guard / scoped lint|PASS|不能代替 UI 实际验收|
|Typecheck|3 项既有错误|universalContinuationRuntime.ts 658/660；browser/auth-consent/main.tsx ReactDOM 类型声明；未宣称通过|

截止聚合证据（不同运行逐文件覆盖，**不是一次新全量 PASS**）：{'passed': 11912, 'failed': 34, 'pending': 161}；另有 4 个文件在 import 阶段未执行测试。后续端口修复的额外结果以对应 JSON 为准，不能把未执行项并入 PASS。

## 未关闭

- Day Feed render 32 项：27 项明确缺 FlatList mock，另5项行为/视觉断言仍待核实，不能全部归因基础设施；保留全部原断言，无效 mock 实验已撤回。owning WindowedDayList 测试和实际 App 证据独立。
- Architecture boundary 2 项：测试文本误命中与真实 runtime imports 并存；保留原规则，`boundary-import-findings.json` 未整体豁免。
- 旧 UI 的 Native/FS/Flow import 失败：逐个 port 接线，实际未执行仍 BLOCKED。缺失历史 QA158 绝对路径不能以跳过测试掩盖。
- 所有原有161 Pending保持原条件，没有本次新增skip。随后修复的4个Node native port文件30项PASS，Results文件45项PASS；均保留原业务断言，SF Symbols/文件持久port的Mock不冒充Native或云写入。

原始/全量/复测 JSON gzip 收在 evidence。测试使用无真实业务凭据的环境；没有 DeepSeek 调用、共享数据库修改或正式 Settlement Confirm。完整 App 新合成 Trip/P1/Expense 的正常业务操作另记 runtime evidence；Expense 的实际503不能被本地单测通过覆盖。

## 新增定向验证（未重跑稳定全套）

- TTR现有Node原生SQLite端口修复：7 PASS，真实Driver未调用时不加载Native runtime；原持久Confirm/撤权/ABA断言保留。
- 已改夹具集合：33 files，832 PASS / 0 FAIL / 1原有Pending。
- Day Header/presentation/appearance：42 PASS；最终Header组件7 PASS、正式Trip接线108 PASS。新增无开始日期的四样式、真实badge、渐变与无虚构日序检查。
- 当前216根因细化为173基础设施/31历史夹具与断言/2已确认产品缺陷/10待验证。先前178/31/2/5为初分类；5个Day Feed行为断言未被证明只是Mock问题，现保守归待验证，原测试全部保留。
- 当前逐文件聚合11912 PASS /34 FAIL /161原有Pending，4个import失败文件。不是一次完整全绿。
