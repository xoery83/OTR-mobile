# Unified Beta Product Acceptance

Owner direction: 21 November 2026. Native is the single delivery lead after the MCP Main/Shared DEV handoff. This is the active product backlog; historical package evidence remains reference material. The goal is reliable Beta journeys, not clearing every historical TODO.

## Baseline and execution

- Remote Main verified after safe push: `825907f3` (previousbedf24dc remains ancestor; includes Managed MCP/c138470d and verified Native fixes).
- Native candidate: `codex/native-unified-prebeta-20261121`; candidate HEAD825907f3 safely pushed to Main; remoteSHA verified. Pending pre-acceptance currency changes remain outside Main. Main/Hosted Writer returned by MC.
- One QA target: Forms QA `C0C23E00-5016-4289-B806-92C5484BD5BA`, `art.xoery.otr`; retain Session/SQLite81/history. Phone remains Build14 until MCP handoff.
- Installed client: Build24/source9363055a, same Session and SQLite81 retained; latest original-item edits recovered on cold start. Phone Build14 unchanged.
- Shared DEV current Root2 release c89a4e06/image2f25e788; shared lease and exact normal capability profile restored without SQL/authority changes.
- Ordinary approved fixes may be merged/pushed after focused checks and actual journey validation. No force push, Production, new authority, protected SQL or financial contract changes. TestFlight/App Store publication requires Owner approval.

## Prioritized journey backlog

Ledger acceptance focus (Owner clarification, 21 November): reuse the existing expense, split and settlement functional evidence. Remaining checks concern wiring: the selected Trip, current Account/Actor, canonical Member roster and payer identity, Trip currency settings, expense draft defaults, independent settings readback and restart. Account/Trip changes must invalidate stale currency previews and confirmations. Test currency changes on an independent empty owned QA Trip; do not finalize settlements or change existing expense currency merely to exercise this wiring. No new financial calculation or consistency contract is authorized by this check.

| ID | Priority | Journey / user result | State | Evidence / next step |
|---|---|---|---|---|
| BETA-01 | P0 | Launch, Google/Apple login, account-specific cached Trips and restart | PASS on Build14; unified Main recheck pending | Real physical Google/Apple acceptance: `ops/unified-prebeta-20261121/FINAL_NATIVE_ACCEPTANCE.json`. Reuse provider evidence; smoke affected integrated startup/SQLite/profile paths. |
| BETA-02 | P0 | First-use Guest and transition to account | Initial-state coverage to qualify | Previously signed-in users cannot return to Guest: Owner rule, not a missing-entry bug. Do not reset the existing QA account to manufacture initial state. Reuse applicable Guest evidence, identify any remaining fresh-install-only proof honestly. |
| BETA-03 | P0 | Create/manage Trip and ordinary named travelers | PASS for original synthetic journey | Normal Create/companion queues and independent readback retained. Named travelers remain distinct from linked accounts/invitations. |
| BETA-04 | P0 | Day Feed, Details and P1–P6 Create/Edit/Cancel/reopen | Local/device PARTIAL PASS | Six Creates restored; P1/P3/P4/P5/P6 Edit and cold restoration passed; P2 Sparse Cancel passed. P6 duplicate gutter fixed. Participant subset qualifications and P2 formal opt-in remain explicit limits, not silent feature removals. |
| BETA-05 | P0 | Original manual operations reach formal receipts and latest server fields | PASS for P1/P3/P4/P5/P6 original Create/Edit; P2 formal slice pending | Original seven Edits COMPLETED/APPLIED and independent readback; same Item/revisions/no duplicate. Build24 cold Day retains latest fields. P2 original local operation is not Cloud PASS. BUILD24_RECOVERY_AND_CURRENCY_WIRING.json. |
| BETA-06 | P0 | Backend outage Create/Edit/restart, then reliable recovery | PASS — controlled transport fault, not physical network isolation | Original Create2005a186 and Edit4aa434fa APPLIED/independent readback, same Itemd1e9d2f9 and cold latest Edit1. No replacement operations. |
| BETA-07 | P0 | Basic expense, payer/splits and restart | PASS — Native/Queue/independent server/cold | QA Harbour lunch NZD24, self share12, two equal splits; SYNCED/revision1 and cold UI. Root2 independently verified formalAPPLIED receipt4f02ea28…, exactsameexpense, oneobject, NZD2400/1200+1200/Bpayer/rev1. Build22 cold UI retains the same values; BETA-07 PASS. |
| BETA-08 | P0 security | Account/Trip isolation; minimum collaborative leave/revocation boundary | Account isolation evidence retained; Hosted access-loss qualification BLOCKED | Reuse representative cross-account sync evidence only where contracts match. Auth/Core must establish current authoritative access-loss behavior; a404 is not revocation proof. Member Removal UI is deferred, not permission to leave unauthorized shared access. Current normal composition does not enable memberAccess and ordinary Leave/Removal is absent; Native authoritative consumer exists but Hosted port/E2E is unqualified. See BETA08_ACCESS_LOSS_READINESS.json. |
| BETA-09 | P1 | Universal/Type-scoped Import: custody → review → manual confirmation → saved item | Local custody/reopen/cold PASS; real processing/review NOT_VERIFIED this round | Original synthetic TEXT batchcda66d73… retained, no Analyze or Provider run. Reuse approved Import owning pipeline. Real processing requires actual legal capability/budget scope; no borrowed/expired Gate. |
| BETA-10 | P1 | Ledger Trip/Account/Member/Currency wiring | Normal cloud/cold/draft wiring PASS; pre-acceptance UX BUG | Reuse historical Ledger functional evidence. Build24 AccountScope repair reviewed. Initial preview preceded Trip acceptance and403; explicit preview after acceptance succeeds. One normalUSD commit/revision2 independently verified, cold TripUSD, LedgerUSD and draftUSD/You retained; original TripNZD/expense unchanged. Fix pre-acceptance timing/feedback, no financial math change. |
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
