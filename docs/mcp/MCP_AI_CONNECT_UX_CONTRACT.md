# Connected AI — Native implementation contract v1

Owner Phase3, 31 October 2026. READY_FOR_NATIVE_IMPLEMENTATION, not shipped UI.
Native is the sole page/navigation/external-opening Writer. MCP owns this contract.
UI Foundation and Terminology Glossary apply; no business or permission change.

## Reuse and navigation

Current inspected code: app/settings.tsx; app/account.tsx; root Stack registrations
in app/_layout.tsx; CaptureComposer.tsx → CaptureConnections.tsx page=ai. The latter
is a disabled discovery panel, not an existing OAuth connection or status port.
No Connected Apps screen or reusable external-browser wrapper was found in these
callers; existing feature links use React Native Linking.openURL.

Add one root Connected AI destination from existing Settings. Provider sections
can expand inline on this one screen; no second Settings system or new bottom tab.
The Capture AI entry reuses that same ConnectedAiContent inside its existing
page=ai Modal, with Back to the original composer and draft retained. Native
inspected CaptureContent.hide(): without draftStaging it calls staging.cancel(),
so do not hide/close/push merely to reach the new root route. Settings uses the
new root Native Stack page; this is one content implementation in two existing
navigation contexts, not another Settings system. Preserve the Email sibling,
Source lifecycle and unrelated Capture/Account behavior.

## Small provider configuration

A checked-in typed four-entry list is sufficient: id, nameKey, summaryKey,
capabilityKey, availability, platformUrl, guideUrl, installationUrl, promptKey.
IDs: chatgpt / claude / gemini / other. No dynamic registry/marketplace or tokens.
Availability is GUIDE_ONLY or FUTURE today; it is not an Account connection state.
installationUrl is null for every provider until an official public OTR install
entry is approved and verified. Never use the Owner-only custom QA plugin URL.

| Provider | Current capability copy | Actions now |
| --- | --- | --- |
| ChatGPT | Limited-environment Trip-list Read verified; Item Read/Edit still in validation | Instructions; Open ChatGPT; selectable example |
| Claude | Limited QA OAuth/Trip/complete Item reads verified; editing pending | Instructions; Open Claude; selectable example |
| Gemini | Compatibility pending | Informational future entry; no Connect action |
| Other AI | Future compatible clients | Informational future entry; no Connect action |

Both current platforms prominently show public OTR connections not yet available.
An enabled Open action opens the platform only, never installs/grants anything.
Do not label it Connect OTR. Do not show internal QA identities, DEV resource URLs,
OAuth client IDs, service credentials or the personal test conversation.

## URLs and evidence, checked31 October2026

- ChatGPT platform https://chatgpt.com/ — actual browser and public page verified.
- ChatGPT plugin settings https://chatgpt.com/plugins — actual current-account
  custom-server flow verified; general access/plan is not inferred.
- Public instructions https://developers.openai.com/api/docs/guides/custom-mcp-server
  — official page fetched; current plugin UI agrees. Not a public OTR listing.
- Claude platform https://claude.ai/ — actual browser redirects to /new, signed-in.
- Claude settings https://claude.ai/customize/connectors — actual browser add
  custom connector draft verified, no connector created or permission granted.
- Official instructions https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
  — fetched official source; settings access is not OTR OAuth/Read/Write PASS.

Use platformUrl for Open; guideUrl for a clearly labeled official-guide action.
Do not embed an unverified deep link, install URL or prefilled prompt that claims
automatic installation. Public users receive no temporary DEV connection steps.

## Account connection state

Auth confirms no production Native Connected Client/Grant status Reader is READY.
Its private online QA checker is not a Native status repository. Therefore show
no Connected/Not connected/expired/Revoke status or action yet. An explanation
may say connection status is managed in the AI platform. Never persist a local
connected boolean, AI token or inferred grant. Leaving the app/opening a link does
not change OTR authentication, Trip ACL, business state or launch behavior.

## Copy catalogue, en / zh-Hans

Use whole-message keys and useUiLocale; names stay official. Suggested key prefix
aiConnect, with no module-initialized translations. These messages reflect current
acceptance and must change only when evidence changes.

| Key | en | zh-Hans |
| --- | --- | --- |
| title | Connected AI | AI 连接 |
| intro | Use an AI platform with the OTR tools you authorize. | 通过你授权的 OTR 工具，在 AI 平台中使用旅行数据。 |
| notPublic | Public OTR connections are not available yet. | OTR 连接尚未公开开放。 |
| chatgptSummary | View your authorized OTR Trips in ChatGPT. | 在 ChatGPT 中查看你有权访问的 OTR 旅行。 |
| chatgptCapability | Trip-list reading verified in limited testing. Item details and editing are still being validated. | 已在受限测试中验证旅行列表读取；行程事项详情和编辑仍在验证。 |
| claudeSummary | Connect Claude to the same OTR travel service. | 通过 Claude 连接同一个 OTR 旅行服务。 |
| claudeCapability | OTR connection and tool capabilities are still being validated. | OTR 连接和工具能力仍在验证。 |
| future | Compatibility pending | 兼容性待验证 |
| otherSummary | More compatible AI platforms are planned. | 后续将支持更多兼容的 AI 平台。 |
| instructions | Connection instructions | 连接说明 |
| openChatgpt | Open ChatGPT | 打开 ChatGPT |
| openClaude | Open Claude | 打开 Claude |
| openHint | Opens the platform in your browser. It does not connect OTR automatically. | 在浏览器中打开平台，不会自动连接 OTR。 |
| officialGuide | Official platform guide | 平台官方说明 |
| statusHelp | Manage any existing authorization in the AI platform. | 请在 AI 平台中管理已有授权。 |
| example | Example prompt | 示例指令 |
| readPrompt | Use OTR to list Trips I can access. Do not change any data. | 使用 OTR 列出我有权访问的旅行，不要修改任何数据。 |
| selectCopy | Select and copy this example. | 选择并复制这段示例。 |
| futurePlanning | Planning and saving will be available after their tools are verified. | 规划和保存功能将在相关工具验证后开放。 |
| openFailed | Could not open the platform. Try again or open it in your browser. | 无法打开平台，请重试或在浏览器中打开。 |
| copyFailed | Could not copy. Select and copy the example instead. | 无法复制，请选择并复制示例文本。 |

For the first release, a selectable UiText prompt plus clear selection/copy hint
is acceptable when no existing clipboard writer is available. No clipboard writer
was found in the inspected callers; do not add a dependency merely for one button.
Native may reuse an already owned explicit-copy facility. Do not claim one-tap
Copy PASS if only text selection is implemented. Never read clipboard passively.
The longer Nelson Preview/Confirm/Save example remains a future guide example,
not a current verified consumer Write claim.

## Native behavior, accessibility and acceptance

Use canonical UiSection/UiButton/UiText/AppIcon, theme/visual roles and native
Stack title/Back. Generic link/chat SF symbols are sufficient; no unlicensed brand
asset or extra icon dependency. No network check at launch, login or every render.
Buttons >=44pt; provider name+availability in VoiceOver; text selectable and wraps
at Dynamic Type; long Chinese/English copy scrolls without clipping. All ScrollViews
use keyboardShouldPersistTaps=handled. Link failures are visible/localized and
retryable; app-return retains screen position and never fabricates Connected.
Unknown/missing configured URL disables that action instead of constructing one.

Native validation: ui:guard, terminology, types/scoped lint and affected navigation
checks. Device smoke: Settings entry + Capture shortcut/back/draft preservation,
provider labels/statuses, valid opens and return, explicit copy/selection, offline
instructions/link failure, both locales/appearances/large text. Report code checks
separately from actual installed/device results. MCP does not edit Native files.
