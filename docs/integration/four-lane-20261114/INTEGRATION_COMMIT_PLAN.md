# INTEGRATION_COMMIT_PLAN

## 固定输入与实际执行

独立Worktree：`/Users/xoery/Project/otr-mobile-import/integration-four-lane-20261114`。Main始终未Merge/Push，原四线工作树未改。GitHub main在收尾只读核对仍为ec282ce6；本地旧main5648818e不是集成基线。

|步骤|实际提交/来源|结果|
|---|---|---|
|1 最新Main→Import|ec282ce6→43215a47，31提交快进|已完成；不重复Phase A/B1/Slices的业务开发|
|2 Auth/MCP产品闭包|7e8fc857，Auth父5d2e6d6c；MCP目录取2be99d7a|已完成；保留Main/Import新增合同，排除新旧固定QA包/专用脚本/陈旧生成包；未激活MCP|
|3 单编辑器冲突|8ed8e3e5|修正试合时的双Modal真实问题；后续再精简远端Editor不可达分支|
|4 Native独立源/79兼容|133196d2|Version DTO/Transport/HTTP、post-COMMIT可选observer、Guest79兼容；无远端DDL|
|5 Native共享协调器|63b828731|保留Auth discovery、foreground当前性、access-loss；Version依赖不注入，正常pull继续原实现|
|6 回执复核/报告|本报告后一个本地提交|保留实际Parent发布的兼容回归；仅固定证据/当前交接，不修改功能范围|

Native来源为74e271ac、d467914e、5c372f13、6570e4a0、478b95bc的产品叶补丁，不整体取旧Native快照。Place六叶、Guest Currency、Access-loss和多项Forms已经被后续代码包含，按INCLUDED_EQUIVALENT去重；没有再制造一份Queue或订阅。

Auth为真正三方合并并按产品范围解决树差，不是把旧目录覆盖Main；合并祖先记录不代表所有Auth历史QA/Invite能力均被启用。MCP只取其 owning 产品目录与必要设计/验收文档，未以MCP旧快照替换整个Backend/Core/SQL。

## Owner批准后的最短动作

确认远端Main仍为ec282ce6且无新差异后，审核本候选精确SHA；按正常Git流程将该候选合入Main并推送。若Main有新提交，仅调和新增差异，不重跑所有历史验收。部署及新的付费E2E不在本轮；数据库已装版本不重发。随后从统一Main建立短生命周期分支。

未提交Root2运维补丁、旧Gallery实验、QA176、旧Provider窗口及未完成Invite不被自动带入；不删除原分支或Git历史。
