# Auth client integration gaps

Updated 2026-11-01. Client tests and synthetic responses never prove server authority.

Current first integration dependency: Native file-level Settings/route handoff remains pending; Auth has not modified its Settings, navigation, startup or SQLite registry. Dedicated Auth code continues independently.
Photo retains shared DEV Backend/SQL/Provider/AD5 priority; no new shared release requested.

| Slice | Existing interface/evidence | Actual missing delta | Owning Writer | Minimum later acceptance |
| --- | --- | --- | --- | --- |
| Profile local page | AccountPrivateProfilePage/Screen + existing AccountProfileRepository.local; optional Display/Document names and local-only Global AKA array; SQLite reopen, save/cancel, legacy JSON and Account isolation reviewed | Global AKA remains private draft only; formal AKA confirmation/read contract and self Trip Nickname mutation remain absent. Normal Settings/route caller and committed-Account DB injection; SQLite77 definition is not registered (76 reserved Source) | Auth screen/repository; Native navigation/DB registry; Source76 owner | Normal Account UI edit/save/cancel/relaunch; A/B isolation; no fabricated cloud state |
| Private Cloud Profile | Normal-JWT API/repository + reviewed private SQL body; network-none PG10 domain and6 installer checks | Hosted private storage, runtime and worker remain unmounted/uninstalled; exact Owner Gate and fresh preflight not executed | Auth; unique Backend/SQL Writer | Normal OTP self save/read/receipt; foreign Account/resource-token negatives; conflict/idempotency/UNKNOWN recovery |
| Adopted Trip Add | Existing Person repository/queue and remote People candidate; actual adopted Person Backend+Native roster/cold proof | Optional private editor draft now retains original Person/operation IDs before the existing create; real SQLite reopen proves single Person/Queue after a lost local reply. Native SecureStore adapter and form are tested with mocked storage; normal caller does not yet pass the draft port. Adopted Add authoring caller not enabled; by-Trip parent reader SQL installed closed, Backend/Native reader inactive | Auth Person/UI port; Native caller; unique Backend Writer | Local draft/queue/close/recovery; later exact Person receipt and independent readback with foreign denial |
| Invite/Claim | Dormant tripMemberClaimAuthority commands; approved four-choice UX | Synthetic-only four-choice screen/model now reuses AddTravelerSheet, fences responses by Account/Trip/invitation/op/person/action, and labels all responses as simulated; 11 tests + independent Review. Normal incoming entry remains unmounted; no qualified Hosted authority/read/receipt port | Auth UI/identity; Native entry; unique server authority Writer | Synthetic client isolation only now; later normal two-Account invite/claim/revoke with atomic authorization and receipt |
| Settings | Existing Settings route; chooseUiLocale/hydrateUiLocale; system theme; existing Auth session/account switching | AuthSettingsSection has Profile callback (disabled if unavailable), existing Language and device-local Appearance choices + write-failure feedback. Locale and Appearance stores fence startup/write races. Normal Settings/startup caller not mounted; existing Logout/Switch feedback is reused, not duplicated | Auth preference/client; Native Settings/navigation/startup | Local preference restart; no Account-private cache leakage; existing normal logout/switch evidence reused |
| Account AI Usage | Existing Provider Usage/Cost Meter receipts | Account-scoped readonly DTO/View + guarded injected Meter reader and existing Flight UsageSummary projection are implemented and reviewed. Reader is UNAVAILABLE by default; no normal Settings caller or qualified server Account aggregation port. Import/POI mapping, tariff context, retry/UNKNOWN accounting and concurrency-reservation evidence remain with existing Meter owner; no guessed HTTP route or duplicate ledger. No approved allowance numbers or commercial policy | Auth client/entitlement; existing Usage owning reader | Truthful actual usage or no-data/unknown; account isolation; default-off enforcement; later real receipt aggregation |

## Release and evidence limits

- Main `4e1bedfc` is source-only/default-closed, normally pushed and remote verified.
- Profile local candidate `346c3e4b`; exact install preparation `3d0b705a` is not approval.
- New permission installation requires a concrete exact Owner Gate; ordinary client coding does not.
- Account/Trip identity comes from existing scoped repositories; names/AKA never establish a connection.
- Sensitive Claim/role/link/revoke operations remain online/server-authorized; no offline optimistic permission queue.

## File-level client handoff

- Native Settings/route handoff was requested as one consolidated client-only change under Owner §4. No affirmative handoff has been received. Native reported its outgoing handoff message was rejected by automatic approval under its no-per-interface-request direction; it was not delivered. No permission is inferred from that failure.
- Integration calls: mount `AuthSettingsSection`; provide the normal Profile route callback only after startup-owned SQLite77 is qualified; new route renders `AccountPrivateProfilePage`. Existing startup calls `hydrateUiLocale`; add `hydrateUiAppearance` alongside it through its unique Writer.
- Person caller binds `loadTripPersonEditorDraft(context)` to the existing `AddTravelerSheet.draft`; do not activate the closed adopted parent reader to obtain this local binding.
- Preview-only Claim screen receives only `SYNTHETIC` input and cannot show a real accepted/connected badge. A real route requires the owning online authority, authoritative expiry/revocation and exact receipt lookup.
- Usage View renders only the guarded reader result. No server reader means unavailable, not empty/zero. Empty requires a qualified response; allowance remains unconfigured/null and enforcement off.
