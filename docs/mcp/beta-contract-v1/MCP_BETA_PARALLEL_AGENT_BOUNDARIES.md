# MCP Beta Parallel Agent Boundaries

状态 **FROZEN v1.0**；合同版本 `otr.mcp-beta.contract/1.0.0`。2026-11-16，Pacific/Auckland。正式基线Main `41de43927fd9869673c1ca929e911f58d1f6f96d`；修订起点 `eaaf88aafe080f86a944a1f6219b2d798f405230`。Owner本聊天“Final Revision & Freeze”已批准OD01–OD06及本轮合同冻结；不构成实现、部署或Mutation授权。

最新Owner范围覆盖原附件中的Settlement写入清单。MCP可新增/修改Expense，Settlement只读。保留原附件的Expense Delete/Restore范围与原Ledger权限，Settlement及其Payment/Personal Review写动作退出本Beta。Personal Payments按保守边界仅读，独立身份/付款声称仍遵循Ledger原模型。以上范围决定在本包统一应用。

六文档互相引用同一Registry和Schema，单项标CONTRACT_NEW表示已冻结、尚待实现的正式端口/overload，不能认定当前已实现。已有接口不据QA白名单、短窗口或临时Runtime重新设计。

## 1. 独立执行模式

Owner后续分别启动Layer1/2；本轮冻结不自动启动。本轮只完成合同修订、静态Review和冻结记录，不启动两个实施Agent，不通知MC。Layer1/2各自从同一固定Main创建独立Worktree，合同包和规范性Schema作为各自只读副本。不得共享可写目录、工作树、Backend、PG、Simulator、浏览器或Session。Layer2不需要Layer1的实时API，Layer1不需要Layer2的Prompt结果才能实现。

只有Layer3接集成制品。双方按同一Registry ID/Schema/Source pins做独立conformance，日常无需互相申请字段、共享窗口或交接Fixture。发现合同内工程缺陷由所属Writer修复并保留外部合同；发现真正合同冲突集中记录差异与推荐，由Owner一次决定版本，不在实现中偷偷改wire。

## 2. 唯一Writer / 文件所有权

| 文件/资源 | 唯一Writer | 另一Layer消费方式 |
| --- | --- | --- |
| Core/Trip/P1–P6/Ledger/Currency Backend与PG | Layer1 | Layer2仅读固定Main Schema/合同，不改domain/API/export |
| `src/domain/trip/**`、`src/domain/ledger/**`正式规则和API Schema | Layer1 | 冻结schema快照按Source SHA独立读取，L2自有schema测试副本不改规则 |
| `src/data/api/**`、`src/data/repositories/**`、`src/data/sync/**`、SQLite迁移及Native功能/验收代码 | Layer1 | Layer2完全不消费运行态，也不直接写SQLite |
| `backend/**`、`supabase/**`、普通HTTP运行组合/测试 | Layer1，实际共享Main/Hosted操作仍遵守既有唯一Writer | Layer2无Backend/数据库权限或依赖 |
| `mcp/guide.ts`、纯Guide内容/Tool Description | Layer2 | Layer1不编辑，Server Registry是只读输入 |
| 新纯规划Schema/语料/Expected Plan目录 `mcp/planning/**`、`docs/mcp/beta-layer2/**` | Layer2 | Layer1不编辑/运行模型；Layer3消费固定包 |
| 既有 `mcp/server.ts`、`index.ts`、`oauth.ts`、`http.ts`、`internal.ts`、`mutation.ts`、`domainAdapter.ts`、`fieldAdapter.ts`、`batch.ts`、Host/bundling、`mcp/package*.json`/`tsconfig` | Layer3唯一Writer | Layer1不在MCP Adapter实现业务接口；Layer2不为注册Tool改server。Descriptions交纯数据artifact，Layer3导入 |
| `mcp/contract.ts`、`mutationContract.ts`、`domainToolRegistry.ts` | Layer3唯一Writer | 原Schema仅作基线参考；Layer2另建planning-only严格schema，不改这些运行文件；Layer1改正式domain Schema并导出规范制品 |
| Root `package*.json`、app RootStack、共享构建/路由配置 | Layer1作为候选源码Writer，Source integration仍由现有唯一Integrator | Layer2使用自己的纯测试入口/已安装依赖；需要新依赖写入自己目录，不碰root |
| 本合同六文档/冻结发布manifest | 合同Owner本线；现已冻结只读 | 两层不得直接改合同，用同一差异记录，Owner批准后统一版本 |
| Layer1证据 `docs/mcp/beta-layer1/**`、专用Backend/PG/Simulator | Layer1 | 以固定只读制品交接，不搬运行环境/Session |
| Layer2模型输出、截图/测试结果、浏览器 | Layer2 | 不打开Layer1 Simulator/Host/浏览器 |
| Layer3 Consumer OAuth/确认/Receipt接线、最终Native集成 | Layer3 | 待双方SHA和conformance通过后一次集中消费 |

现有项目领域Ownership继续有效。Layer1拥有本轮广义接口候选实现，正式Owning合同/Schema和共享Main安装仍通过既有Writer边界；本合同不另设审批委员会，不让Layer2参与这些工程协调。独立PG/Backend可用于Layer1验收，Hosted部署另按实际资格，避免把临时窗口设计进产品API。

## 3. 双方起始输入与退出制品

| Layer | 固定起始输入 | 必交制品 | 独立退出标准 |
| --- | --- | --- | --- |
| 1 Server + iOS Sync | 六份Owner接受的合同、Main SHA/Schema pins、Registry，已接受OD结论 | `api-manifest.json`、`capability-registry.json`、`server-api.schema.json`+语义validator表、普通Auth/ACL/CAS/Receipt测试证据、server/sync acceptance matrix、合成数据建立的正式HTTP记录、Simulator/冷恢复结果、固定Source与Build SHA | Registry所有范围能力按Server合同完成，五层Sync等级按该操作需要逐项PASS；OD01–OD06已接受；明确记录真实实现阻塞，不自行缩范围 |
| 2 Guide + Planning | 相同合同/Schema pins、只读合成Server输入快照，纯材料 | Guide、Tool descriptions、`tool-planning.schema.json`、源Schema pins、materials manifest、Expected Plan、实际GPT Plan输出与判定、fixed Candidate SHA | 覆盖全部Registry schema/field/权限/恢复规则；模型输出合法Plan，无真实业务调用/假确认/Settlement写操作 |
| 3 Integration | 两层各自固定Candidate/Manifest和证据 | Thin join计划、正式Consumer/OAuth、可信确认与业务Receipt、独立readback、Native相同结果记录 | 先GPT完整普通场景，消费同样Server能力；Claude另行安排 |

Layer1 API Manifest只描述已实现的Registry，不以更宽后端能力自动扩大MCP。Layer2 Tool Manifest可包含尚未实现的合同能力，但标`contractualAvailability`，不得伪称实际tools/list可发现。Layer3交集是已实现+实际授权+当前Consumer可发现的集合。

## 4. 冻结交接Manifest形状

```json
{
  "contractVersion": "otr.mcp-beta.contract/1.0.0",
  "baselineMain": "41de43927fd9869673c1ca929e911f58d1f6f96d",
  "layer": "LAYER1_OR_LAYER2",
  "candidateSha": "FULL_SHA_AT_DELIVERY",
  "contractBundleSha256": "HASH_OF_CANONICAL_MANIFEST_OF_SIX_DOCUMENTS",
  "capabilityRegistrySha256": "HASH_OF_EXTRACTED_REGISTRY",
  "schemaArtifacts": [{"schemaId":"SCHEMA_ID","path":"RELATIVE_PATH","sha256":"FILE_HASH","sourcePins":[]}],
  "semanticValidators": [{"id":"CORE_MANUAL_ADMISSION","source":"PINNED_SOURCE_EXPORT","evidence":"RELATIVE_RECEIPT"}],
  "acceptance": [{"capabilityId":"otr.p3.update","level":"PLAN_QUALIFIED_OR_SERVER_API_PASS","evidence":"RELATIVE_PATH","status":"PASS_OR_BLOCKED"}],
  "ownerDecisions": [{"id":"OD01","status":"ACCEPTED","source":"TRUSTED_OWNER_REFERENCE"}]
}
```

上例占位值是合同字段说明，实际制品不允许占位SHA或混合layer字符串。Manifest自身不含secret/Session/OTP/生产数据；sourcePins精确到基线与Schema文件hash。两层的Schema artifact可以不同语言实现，但同一请求/响应应得到相同合法性结果和同一canonical intent，尤其省略/null/false/empty array/时间精度。

## 5. 最终集成无需重新协商的检查

- Registry ID、方法/路径、Command、schemaRef、toolName、响应投影、原Receipt域、错误/UNKNOWN含义完全一致。
- 新增Reader/Sparse overload/ordinary资格完成后，Layer1仍兼容原命令及历史pending/Receipt，不更换Core/Sync engine。
- `MANUAL`与`IMPORT`隔离；只读Roster无成员管理；Settlement业务范围只读。Batches逐项，不允许声明虚假原子批次。
- Layer2依赖引用先解析实际read result和rev，再由Layer3进行真实Preview/用户确认。不可把离线Expected Plan当保存授权。
- Layer1正式HTTP/PG/Reader/Sync/SQLite/UI结果各自可追溯。Layer2模型理解成绩不能补缺Server/Native，反之也不能推断模型工具使用正确。
- OD01–OD06已ACCEPTED，OD04正式≤15秒；两层按同版冻结输入实施，不在Layer3临时解释或降低SLA。


## 6. v1.0固定输入入口

- Layer1：`LAYER1_INPUT_MANIFEST.json`，覆盖Server/Reader/Sparse Port及iOS Sync；Roster正式映射、完整ItemSnapshot、Unarchive、逐域Commit→UI≤15秒为必交合同。
- Layer2：`LAYER2_INPUT_MANIFEST.json`，覆盖Guide/Descriptions/纯Plan Schema及离线理解；只消费相同Registry/Source Pins，禁止猜Member映射、隐藏字段或保存结果。
- 总入口：`FROZEN_HANDOFF_MANIFEST.json`。其frozenContractCommitSha固定六合同/Registry/Schema/Source Pins的不可变源提交；交接Manifest在后继提交记录该SHA，避免自引用SHA/递归hash。Owner以最终交接提交读取两个输入文件，再checkout其中指定的Main与只读合同源。不得把合同冻结当Layer1/2已实施或Hosted权限。
