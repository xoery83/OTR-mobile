# Unified Beta Product Acceptance

Owner direction: 21 November 2026. Native is the single delivery lead after the MCP Main/Shared DEV handoff. This is the active product backlog; historical package evidence remains reference material. The goal is reliable Beta journeys, not clearing every historical TODO.

## Baseline and execution

- Remote Main fetched: `bedf24dc` (includes Managed MCP integration and `c138470d` shared Core lease).
- Native candidate: `codex/native-unified-prebeta-20261121`; upstream Main merged without committing while compatibility checks run. No Main push yet; Main/Hosted Writer returned by MC; final compatibility still in progress.
- One QA target: Forms QA `C0C23E00-5016-4289-B806-92C5484BD5BA`, `art.xoery.otr`; retain Session/SQLite80/history. Phone remains Build14 until MCP handoff.
- Formal installed client: Build19/source6164e295. Temporary Build20 Backend-transport fault test has ended; original source restored and normal19 reinstalled. This was not physical network isolation.
- Shared DEV is still reported as f692ea0d/2dda/25772109. Latest Main and Hosted software are not yet aligned. Root2 owns deployment/CAS/rollback; no Native Role/SQL changes.
- Ordinary approved fixes may be merged/pushed after focused checks and actual journey validation. No force push, Production, new authority, protected SQL or financial contract changes. TestFlight/App Store publication requires Owner approval.

## Prioritized journey backlog

| ID | Priority | Journey / user result | State | Evidence / next step |
|---|---|---|---|---|
| BETA-01 | P0 | Launch, Google/Apple login, account-specific cached Trips and restart | PASS on Build14; unified Main recheck pending | Real physical Google/Apple acceptance: `ops/unified-prebeta-20261121/FINAL_NATIVE_ACCEPTANCE.json`. Reuse provider evidence; smoke affected integrated startup/SQLite/profile paths. |
| BETA-02 | P0 | First-use Guest and transition to account | Initial-state coverage to qualify | Previously signed-in users cannot return to Guest: Owner rule, not a missing-entry bug. Do not reset the existing QA account to manufacture initial state. Reuse applicable Guest evidence, identify any remaining fresh-install-only proof honestly. |
| BETA-03 | P0 | Create/manage Trip and ordinary named travelers | Local UI / queue PASS; independent readback pending | Synthetic Trip a0bcf637… and normal companion creation retained. Verify server identity/fields with Root2; do not treat unlinked named people as linked accounts or invitations. |
| BETA-04 | P0 | Day Feed, Details and P1–P6 Create/Edit/Cancel/reopen | Local/device PARTIAL PASS | Six Creates restored; P1/P3/P4/P5/P6 Edit and cold restoration passed; P2 Sparse Cancel passed. P6 duplicate gutter fixed. Participant subset qualifications and P2 formal opt-in remain explicit limits, not silent feature removals. |
| BETA-05 | P0, first | Original manual cloud operations reach formal receipts and latest server fields | BUG | P3 original Edit5f7d0785…; P4/P5/P6 Create/Edit pending. Gateway connlimit2 conflict identified and restored1. After restore, P3 capabilities hit Core lease BUSY/15s; P4 receipt OTHER remains. Align approved single-manager Backend, then retry same IDs/independent readback/point disappearance/cold recovery. |
| BETA-06 | P0 | Backend outage Create/Edit/restart, then reliable recovery | Local/queue/device PASS; Create SERVER_VERIFIED; Edit recovery BLOCKED by BETA-05 | Temporary fault package: new P3 Itemd1e9d2f9…, Create2005a186…, Edit4aa434fa…; both cold restores retained. Normal recovery of original Create is APPLIED/independent PG verified (one Item, revision1); later Edit still has no receipt. `ops/prebeta-user-journey-20261121/qa-outage/`. No physical-offline claim; online recovery still required. |
| BETA-07 | P0 | Basic expense, payer/splits and restart | Local UI / normal queue PASS; independent readback pending | QA Harbour lunch NZD24, self share12, two equal splits; SYNCED/revision1 and cold UI. Verify independent server fields and no duplicate before final PASS. |
| BETA-08 | P0 security | Account/Trip isolation; minimum collaborative leave/revocation boundary | Existing evidence retained; current qualification pending | Reuse representative cross-account sync evidence only where contracts match. Auth/Core must establish current authoritative access-loss behavior; a404 is not revocation proof. Member Removal UI is deferred, not permission to leave unauthorized shared access. |
| BETA-09 | P1 | Universal/Type-scoped Import: custody → review → manual confirmation → saved item | Local custody/reopen/cold PASS; real processing/review NOT_VERIFIED this round | Original synthetic TEXT batchcda66d73… retained, no Analyze or Provider run. Reuse approved Import owning pipeline. Real processing requires actual legal capability/budget scope; no borrowed/expired Gate. |
| BETA-10 | P1 | Settlement readiness, understandable feedback, correction and safe confirmation | PARTIAL / BUG | Summary paid24/share12/owed12 cold PASS. Loading/disabled feedback fixed infa9512a8 and built19; actual readiness/failure feedback and final owning flow still to test. No money movement performed. |
| BETA-11 | P1 | Invite → explicit join → shared read, two-account isolation | Qualification / targeted QA pending | Auth owns Invite/Claim and scope qualification. Use normal identities and existing formal flow; preserve prior C04 UNKNOWN operations, do not resurrect old windows or copy sessions/tokens. |
| BETA-12 | P1 | Main UX regression and final physical delivery | PARTIAL | P6 gutter actual device PASS. Complete affected Main composition smoke and current journey bugs, then one unified phone update after MCP returns it; retain data/signing identity. |
| BETA-13 | P2 | Member Removal UI and non-blocking advanced features | TODO | Not a Beta feature-expansion task. BETA-08 security boundary must still be established. Realtime/private channels, paid Enrichment, advanced documents and unsupported owning fields stay separately scoped. |

## Current fixes retained for integration

- Local-First drafts:3d585cbf, unchanged authorization/target/retry fences;196+17 focused checks and independent NO_BLOCKER.
- P6 gutter:6dde1bb9;226 focused activity tests/UI guard and actual simulator visual PASS.
- Bounded Core dependency reason:10923e37;110 tests/scoped lint and independent NO_BLOCKER. Diagnostic metadata only; no dispatch or authorization change.
- Settlement loading feedback:fa9512a8; canonical localized loading label and disabled duplicate tap, guard/lint PASS; actual flow still pending.
- QA-only one-shot receipt consumer is temporary diagnostic code, not a release feature; retain its evidence and remove unused probe code before final Main integration.

## Completion contract

Every journey records PASS / BUG / BLOCKED / TODO and an actual source/build/environment. Local, queue, Backend receipt, independent readback and device recovery are separate facts. Fixed IDs survive UNKNOWN and retries. No ordinary user should need internal technical concepts to finish a task. Runtime release and Main handoff do not themselves prove product PASS. Final delivery includes Main SHA, actual journey evidence, deferred items/reasons and a Beta/TestFlight recommendation, with publication still Owner-controlled.
