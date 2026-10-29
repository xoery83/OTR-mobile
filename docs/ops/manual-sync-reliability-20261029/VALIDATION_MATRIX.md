# Manual Sync Reliability — 2026-10-29

| Capability | Native Local | Queue / L2 | Backend | Independent readback | Cold recovery |
| -- | -- | -- | -- | -- | -- |
| Offline Create (P3) | PASS, normal Create + Edit during simulated Core Transport outage | Original two operations persisted; dependency ordering PASS | Two APPLIED | One Item, revision 2, dates/name/Everyone match | Outage pending/latest fields and accepted recovery PASS |
| Lost response / unknown outcome (P2 Sparse) | Validated real APPLIED response withheld once | Original operation/item/idempotency identity retained | Original Create APPLIED; subsequent details APPLIED | One Item, revision 2; one Create receipt | Pending before recovery and Accepted Details after recovery PASS |
| Replay / idempotency | No replacement Save | Receipt-first retry; exactly one Create POST in actual trace; deterministic regression PASS | Original receipt resolves retry | No duplicate Item or receipt | Original pending survives restart |
| Account / Trip isolation (P6 target) | Normal B login; immediate/cold My Trips excludes A | A pending unchanged and not dispatched while B, even after fault removed | Private Trip read and cross-Trip edit: 404 NOT_VISIBLE | A unchanged, zero probe receipts | B isolated; normal remembered A restores four Trips |
| Creator / permission negative (unshared B) | Private A fields not shown to B | No false APPLIED or local loss | Unauthorized edit: 404 NOT_VISIBLE | A revision 3 unchanged while B; original A pending accepted only after A return, revision 4 | A latest data retained |

## Evidence and code

- Exact operation/item identities, APPLIED receipts, denial results and independent readbacks: `REPRESENTATIVE_RECEIPTS.json`.
- Metadata-only operation trace: `SAFE_OPERATION_TRACE.json`; private fault source/build hashes: `FAULT_INJECTION_MANIFEST.json`.
- Existing phone93 P2 and phone60 P1/P3/P4/P5/P6 physical App-cellular-offline Edit evidence remains under `../manual-cloud-e2e-20261028/`; reused as historical proof, not repeated or relabeled Offline Create.
- Shared regression: 9 suites / 181 tests; other Manual repositories: 4 / 60. After accepted main merge: Native contracts 14 / 256 and Backend contracts 6 / 94; typecheck, UI guard, Backend build and scoped lint PASS.
- Independent final review: NO_BLOCKER, Repository/Codec/Worker/Transport 4 suites / 86 tests PASS; actual evidence summaries and trace independently matched.
- Only two test changes in this closure: Sparse number/date-only durable operation IDs and Codec mock aligned with existing batched Reader. No new Queue, repository, runtime authority or DEV deployment.
- Ordinary no-hook Build96 restored in place from source752241d4, JS SHA2567bbf49be2690b0551254f4b441c98b02b0a7cb3cb44654e99ff896833d0d1906; actual cold four Trips/P3/P2/P6 latest Details/Everyone/noPending PASS. Same three Item IDs, five original operations COMPLETED, schema_migrations MAX(id)=74 and integrity OK. Original Native52 binary retained: no claim of newer Source Swift parity. See `ORDINARY96_SMOKE.json`.
- Accepted main901cf456 safely merged at752241d4. Final evidence-only checkpoint follows this source; ordinary product code is identical. Main serial FF/Push is verified separately at completion.

## Limits

This round uses real Native operations and DEV acceptance with simulated Core Transport outage and response withholding, not physical network disconnection or packet loss. Live retry resolves the original receipt without a second Create POST; deliberate duplicate POST is covered by existing isolated Core/PG replay tests, not claimed as newly exercised on DEV. Unknown outcome is retained in the existing retryable Queue state, not a new UNKNOWN status.

Live authorization negatives cover an unshared second account and cross-Trip target. Same-Trip Organizer/non-Creator/selected-private-participant variants were not enabled. Backend HTTP authorization was exercised; this is not a separate direct SQL RLS-role test. No Production, Provider, Schema/RLS/GRANT, Session copy or historical QA cleanup was performed. Form AI Scan remains out of scope.
