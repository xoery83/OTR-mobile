# Auth client integration gaps

Updated 2026-11-01. Client tests and synthetic responses never prove server authority.
Photo retains shared DEV Backend/SQL/Provider/AD5 priority; no new shared release requested.

| Slice | Existing interface/evidence | Actual missing delta | Owning Writer | Minimum later acceptance |
| --- | --- | --- | --- | --- |
| Profile local page | AccountPrivateProfileScreen + existing AccountProfileRepository.local; save/cancel/SQLite reopen42 tests and independent Review | Normal Settings/route caller and committed-Account DB injection; SQLite77 definition is not registered (76 reserved Source) | Auth screen/repository; Native navigation/DB registry; Source76 owner | Normal Account UI edit/save/cancel/relaunch; A/B isolation; no fabricated cloud state |
| Private Cloud Profile | Normal-JWT API/repository + reviewed private SQL body; network-none PG10 domain and6 installer checks | Hosted private storage, runtime and worker remain unmounted/uninstalled; exact Owner Gate and fresh preflight not executed | Auth; unique Backend/SQL Writer | Normal OTP self save/read/receipt; foreign Account/resource-token negatives; conflict/idempotency/UNKNOWN recovery |
| Adopted Trip Add | Existing Person repository/queue and remote People candidate; actual adopted Person Backend+Native roster/cold proof | Adopted Add authoring caller not enabled; by-Trip parent reader SQL installed closed, Backend/Native reader inactive | Auth Person/UI port; Native caller; unique Backend Writer | Local draft/queue/close/recovery; later exact Person receipt and independent readback with foreign denial |
| Invite/Claim | Dormant tripMemberClaimAuthority commands; approved four-choice UX | Native incoming/status/review UI and synthetic dual-Account flow absent; no qualified Hosted authority/read/receipt port | Auth UI/identity; Native entry; unique server authority Writer | Synthetic client isolation only now; later normal two-Account invite/claim/revoke with atomic authorization and receipt |
| Settings | Existing Settings route; chooseUiLocale/hydrateUiLocale; system theme; existing Auth session/account switching | Profile entry; Appearance preference and startup restore; complete feedback and ownership checks | Auth preference/client; Native Settings/navigation/startup | Local preference restart; no Account-private cache leakage; existing normal logout/switch evidence reused |
| Account AI Usage | Existing Provider Usage/Cost Meter receipts | Account-scoped client DTO/read adapter/page not wired; no approved allowance numbers or commercial policy | Auth client/entitlement; existing Usage owning reader | Truthful actual usage or no-data/unknown; account isolation; default-off enforcement; later real receipt aggregation |

## Release and evidence limits

- Main `4e1bedfc` is source-only/default-closed, normally pushed and remote verified.
- Profile local candidate `346c3e4b`; exact install preparation `3d0b705a` is not approval.
- New permission installation requires a concrete exact Owner Gate; ordinary client coding does not.
- Account/Trip identity comes from existing scoped repositories; names/AKA never establish a connection.
- Sensitive Claim/role/link/revoke operations remain online/server-authorized; no offline optimistic permission queue.
