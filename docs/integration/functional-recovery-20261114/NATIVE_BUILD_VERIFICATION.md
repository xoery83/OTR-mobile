# Native Build Verification

Product `888a1b4bbc5342e71acde10489d2a2e9a3e334b4`，修复前基线8297。

## 真正的完整构建

临时 staging `/private/tmp/otr-unified-native-20261114`，使用现有 Expo prebuild / CocoaPods / Xcode workspace `OTRDEV` / Release 构建。两个实际 xcodebuild 均 BUILD SUCCEEDED。不是往旧壳替换 JS。最终 manifest 对1159个非测试 tracked App/src/modules/plugins/assets/config 文件与 staging 比较，0差异、0缺失；实际 binary 与 main.jsbundle SHA 见 `evidence/build-manifest-final.json`。

保持现有安装 Bundle `com.xoery.otrmobile.uxc1iphone16` 和原 simulator application-identifier `U9D5C58Z94.com.xoery.otrmobile`，以保留原 Keychain 访问。独立 staging 的 name/Bundle 覆盖明确记录；原 production App ID/Team 没有改动。Native 模块包含 ExpoAppleAuthentication、OtrGoogleSignIn、PlaceSearch、Capture/Preview、SQLite/SecureStore 等既有正式模块。

DEV Apple entitlement 为 Default；actual App 配置 usesAppleSignIn=true。真实点击到系统要求登录 Apple Account 的弹窗；这只证明系统入口，不能算完整 Supabase Apple 登录。

正常 public config：DEV API、dev transport、normal cloud sync、Local First、DEV Confirm、original preview、Guest adoption。没有固定 QA Account/Trip/Release、旧 QA_SCOPE、临时只读 route 或 Fixture provider。staging 只读取两项公开 Supabase 配置，没有复制私有密码/会话；证据不含 token。

## 数据与设备

- 主设备89935253…：原 App 原位更新，无卸载、reset、Session/Keychain/SQLite/原件拷贝。重建前后8个选定表和9个私有文件原hash保持（首次替换证据）；最新检查原9文件仍全一致。随后通过正常UI额外建立独立合成 Account Trip/P1/Expense，不能宣称全DB/全Queue hash未变化。
- 新Guest设备4A5204DC…：相同完整 App，但全新正常 Guest，自身独立私有库；没有从原iPhone/iPad迁移 Session/Keychain/SQLite。Trip改名、USD币种、Coast Cover、P1本地编辑和cold launch可见。Guest未获得云正式Receipt。
- 原iPad B1/B2及QA179未卸载、未清理、未重放。
- 新Account P1 NEW/EDIT在同Item revision1→2，正式Receipt落地；冷启动正常原Session，无重新登录，UI恢复编辑后标题。

## 运行缺口

完整 Apple OAuth、Google custom Bundle认证、多人角色切换、系统级断网、完整当前Provider E2E尚未证明。截图没有替代这些结果。Ledger新Expense远端503仍阻塞。Trip/Ledger旧标题已在888a1b4b修复，最新完整Native构建原位安装并冷启动实际验证新名；金额/币种保持。Root2独立PG已验证P1 NEW/EDIT及Trip改名。

全仓typecheck仍3项既有错误，Native build成功不能冒充TypeScript全绿。Main未Merge/Push，DEV Backend未因本轮进行替换。

## Day Header correction build

产品 `5c28077e`，测试夹具 `8bd49f26`。再次实际 Xcode Release **BUILD SUCCEEDED**（`/private/tmp/otr-unified-xcodebuild-day-header.log`）；相同Bundle原位更新，Session/SQLite/原件保留。1159个tracked非test产品文件与staging逐字节相同，binary/main.jsbundle实际SHA见manifest。原有有日期Trip保留1/2日序，无日期Trip恢复正式日历Header与背景渐变，见day-header-*-fixed.png。没有改业务数据来制造截图。
