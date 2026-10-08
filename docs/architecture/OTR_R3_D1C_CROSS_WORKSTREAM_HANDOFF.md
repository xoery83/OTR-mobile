# R3-D1c accepted cross-workstream handoff

Date: 2026-10-08 (Pacific/Auckland).

**R3-D1c ACCEPTED WITH LIMITATIONS.** Owner authorization covers this documentation
closure, its commit and normal push only. Baseline is freshly fetched canonical
`9c77433958ae0d04589aa24242bc8a743b89ef97`. This records accepted historical results;
it performs no new Hosted DEV or device verification and grants no runtime activation.

## Accepted scope

- Hosted DEV same-project CLOSED-only rebuild, forward Ledger initialization and
  **36 Hosted checks accepted**. Retained DEV identity is `tuqigdxrvrerfewsxqgm`;
  original rebuild/forward transactions must never be rerun. Catalog, lineage,
  financial fixtures, Auth/Storage and CLOSED evidence remain historical acceptance.
- **`com.xoery.otrmobile.devtest` is the shared future DEV device-testing bundle.**
  D1b signed artifact uses its own Keychain namespace and isolated container, with
  DEV API/Auth bindings. This policy does not change canonical app configuration or
  authorize a new build/install. **`com.xoery.otrmobile` protects historical data and
  must remain quarantined**, with original Accounts, files and outboxes preserved.
- SQLite migrations **1–51**, integrity and foreign-key checks accepted. D1b fresh
  initialization had all85 business tables empty; later fixture hydration and
  Account isolation passed. Signed namespace/observed projections are accepted;
  direct dormant Keychain-item absence and adversarial transport denial were not tested.
- A1 and A2 login, expected Account-scoped Trip/Expense visibility and **A→B→A
  accepted**. Global cache rows for both Accounts coexist intentionally; filtered
  views and scoped actor mappings establish the observed isolation.
- Exactly one new synthetic QA Expense: **CREATE and UPDATE accepted**, both
  COMPLETED without duplicate creation. Existing seed Expense identities, revisions
  and amounts/currencies remain preserved.
- Ordinary new camera Receipt **offline save, devtest restart, reconnect/upload,
  link and visible render accepted**. JPEG size/hash matched metadata;
  UPLOAD_RECEIPT and LINK_RECEIPT completed. Final two sync/two receipt operations
  were COMPLETED; pending/retryable/failed/UNKNOWN/in-flight counts were zero.
  Completed history remains retained. This receipt path did not enqueue OCR.

## Six preserved limitations

1. **Invalid synthetic PNG and incomplete useful-rendering proof.** Existing1×1
   seed PNG downloaded with exact accepted size/hash, but its IDAT CRC is invalid
   and Owner saw black. Useful existing-Receipt rendering is not accepted. Native
   decoder diagnostics were not collected, so a renderer defect is not ruled out.
   New camera JPEG rendering passed separately; no fixture replacement occurred.
2. **Account-switch latency unmeasured.** A→B→A completed but felt slow. No timings,
   performance diagnosis or latency acceptance are claimed.
3. **Active-upload interruption and UNKNOWN recovery untested.** Recovery covered
   offline save→restart→reconnect→completion. It did not cover a crash/interruption
   during active upload or ambiguous server-commit recovery.
4. **One unsaved synthetic draft retained.** One unsubmitted A1 JPEG remains in
   receipt-drafts; its provenance is not independently established. It is not an
   uploaded Receipt. No draft, file or queue cleanup was performed or authorized.
5. **Expected Settlement `ADJUSTMENT_REQUIRED`.** The new QA Expense changed the
   derived adjustment state from CURRENT. Finalized identity, revision, digest and
   immutable finalization fields remain unchanged; the whole row is not unchanged.
   No adjustment Settlement or finalized snapshot edit is accepted/authorized.
6. **Original-app network quarantine and observation limitations.** Primary denial
   was Owner-confirmed original cellular OFF with Wi-Fi/alternate routes absent.
   CoreDevice cannot independently attest those switches or every network attempt.
   Sampled equality of all387 metadata entries does not prove zero intervening
   writes/network activity; process presence alone proves neither dispatch nor writes.
   D1b observation failure was recovered; no isolation failure was observed. Actual
   connectivity-window duration was not independently measured. Owner confirmed final
   Airplane Mode ON, global Cellular Data OFF, Wi-Fi OFF and no alternate route.

## Cross-workstream reconciliation and CLOSED gates

Capture C2 is installed canonical capability at the baseline merge, retaining
accepted local durable intake, SQLite51 and its original Owner/device evidence.
C3 Activity/discovery remains unaccepted and uninstalled. Integrated C4 is not
installed or accepted by C2/R3 device success.

Accepted Platform P2/C4a remains a dormant strict JSON-text pure assessment;
accepted P4a remains DEV/Debug-gated read-only local Operations. Neither supplies
Capture processing, durable semantic composition, preparation or domain admission.
Their original reports/rechecks and the newer C2 integration evidence are unchanged.

**C4/C5/C9 and provider/runtime gates remain CLOSED.** CP15B/LIVE-W startup,
provider activation, Source/Run publication, Import execution and canonical command
admission receive no new authority. READY/preparation is not canonical acceptance.
Existing ordinary Expense/Receipt acceptance does not open these processing gates.

No Capture C3 integration, Integrated C4, Hosted operation, device operation,
original-app re-enable, old outbox replay/cleanup, provider activation or migration
execution is part of this closure. Later testing requires its own bounded scope
and original-app quarantine verification; this handoff is not execution approval.

## Retained evidence and provenance

Canonical accepted Hosted reports and prior closure handoff:

- [R3 same-project DEV rebuild](OTR_R3_SAME_PROJECT_DEV_REBUILD_REPORT.md).
- [Fresh Trip/Ledger correction](OTR_R3_FRESH_TRIP_LEDGER_INITIALIZATION_CORRECTION_REPORT.md).
- [Earlier documentation closure proposal](OTR_R3_DOCUMENTATION_CLOSURE_PROPOSAL.md).

The accepted D1b/D1c reports remain byte-for-byte at their existing local location,
`/Users/xoery/Project/otr-mobile-canonical/docs/architecture/`. They are retained
source evidence, not copied into canonical Git by this two-file closure:

- `OTR_R3_D1B_ISOLATED_DEV_BUNDLE_BUILDER_REPORT.md`.
- `OTR_R3_D1B_OFFLINE_FIRST_LAUNCH_REPORT.md` (final Owner Login/SQLite acceptance).
- `OTR_R3_D1B_ONLINE_FIRST_SYNC_REPORT.md` (A1/fixture hydration and limits).
- `OTR_R3_D1C_FINAL_DEVICE_ACCEPTANCE_REPORT.md` (final device scope/six limitations).

Private original verification evidence remains in its existing local locations,
including `/private/tmp/otr-r3-d1c-ji8k4ug_`; no credentials, images, device database,
private QA IDs or operation payloads are committed. Temporary evidence is not a
permanent backup. Earlier pending device-gate wording in unchanged historical
reports is superseded only for the isolated accepted scope recorded here; original
historical-app/outbox quarantine remains in force.

Current workstream references:

- [C2 canonical integration](OTR_CAPTURE_C2_CANONICAL_INTEGRATION_REPORT.md) and
  [independent review](OTR_CAPTURE_C2_CANONICAL_INDEPENDENT_REVIEW.md).
- [P2/C4a canonical integration](OTR_PLATFORM_P2_C4A_CANONICAL_INTEGRATION_REPORT.md).
- [P4a Builder](OTR_PLATFORM_P4A_LOCAL_OPERATIONS_BUILDER_REPORT.md) and
  [independent recheck](OTR_PLATFORM_P4A_LOCAL_OPERATIONS_INDEPENDENT_REVIEW.md).

Only this handoff and `docs/CURRENT_IMPLEMENTATION_STATE.md` change. All accepted
reports, original evidence, application code, migrations, tests, configuration and
dependencies remain preserved. Markdown formatting, whitespace, exact two-file
diff and preservation checks are required before publication; current main must
be re-fetched and unchanged before commit/push.

**STOP — R3 CROSS-WORKSTREAM DOCUMENTATION CLOSURE COMPLETE.**
