# Current Implementation State

Date: 2026-09-13

## Current Milestone

Ledger 2.0 Stage 7.3, **Export & Integrated Acceptance**, passed automated,
two-client Simulator, and physical iPhone Release acceptance on 2026-09-13.
Stages 7.1, 7.2A, 7.2B, and 7.3 are complete; Stage 7 is complete.

Current local SQLite schema version: 15.

## Stage 7.3 Delivered

- one pure normalized `SettlementStatement` built from repository-backed frozen
  root + Adjustment lineage facts;
- deterministic Statement digest and one shared export-row model consumed by
  both PDF and long-form CSV without independent financial calculation;
- authenticated online current-final generation gate requiring expense/payment
  sync, forced canonical bootstrap, exact local/server lineage match, no pending
  financial operations, `CURRENT`, and fully settled lineage;
- durable app-owned document storage keyed by root/head/Statement digest, with
  temporary print files confined to cache storage;
- SQLite v15 local export manifest with schema/digest/root/head/privacy/format,
  generated-file hash, URI, and generation time; it is not financial truth and
  is not synchronized;
- immutable current and historical export versions, offline viewing/sharing of
  cached files, integrity verification before sharing, and native system share;
- member and export-local de-identified privacy modes; private account/actor,
  payment-note, evidence, token, path, and payload data are excluded;
- RFC 4180 CSV escaping, UTF-8 BOM, integer minor/currency/scale columns, and
  spreadsheet formula-injection protection for user-controlled text;
- integrated Settlement explainability, frozen-input drill-down, outstanding
  projection, export generation, current/history labeling, preview, and share UI;
- retirement of the reserved Stage 7 server binary-export endpoint. PDF/CSV are
  generated on-device; no public link or upload is introduced.

Stage 7.1/7.2A/7.2B financial semantics were not changed. Export, regenerate,
preview, and share create no canonical Settlement audit event or revision.

## Validation Status

- `npm test`: 44 files / 147 tests pass; typecheck and lint pass.
- Repository formatting reports only the pre-existing unrelated `AGENTS.md` and
  `src/hooks/useStage4BPhysicalSmoke.ts` formatting debt.
- iOS Simulator Release build succeeds with `ExpoPrint` and `ExpoSharing`
  linked.
- Two authenticated Simulator clients converged on the same 5-row lineage after
  a new zero-transfer Adjustment. Both produced Statement digest
  `9a1abfe494f0c4925a4a080e96bcdc2853e944c156bfbebcc9278b326362b674`
  and identical financial fingerprint
  `cefd1774fc126c6aeec42b935d2d4be8863ed4d8366f929f6d6abfca4c477329`.
- Member and de-identified CSV files were byte-identical across the two devices.
  Their SHA-256 values are respectively
  `42b914a312cc12732c373de0a2d8d29d386709fad219a2886b3c4a10b3b92b55`
  and `08d2d324b42161dab7f70e0bce8f6e4397d4e9360863e48066c8e85b10e4ceb5`.
- Cross-device normalized PDF text was identical in both privacy modes; rendered
  first/last pages showed no clipping, overlap, or privacy leak. Raw PDF bytes
  were intentionally not compared because print metadata is nondeterministic.
- Export generation left all financial row counts/revisions/audit facts
  unchanged. Member and de-identified privacy scans passed on both clients.
- After the new Adjustment, the original digest `aca904ad9328…` remained as four
  historical manifests/files and the new digest became four current artifacts;
  both sets retained valid digest-keyed paths and generated-file hashes.
- A Release app reinstall exposed and gated an iOS container-path migration
  regression. Export reads now rebase manifest URIs onto the current app document
  directory while preserving the immutable digest suffix. With Backend stopped,
  all eight files survived reinstall, cached CSV opened the native share sheet,
  and Ledger counts/revisions/audit remained `5|11|2|8|3|6|3|11|24` before and
  after sharing.
- `expo-doctor` passes 20/21 checks. The remaining compatibility risk is an
  existing one-patch SDK 57 lag across Expo core packages; the newly added
  `expo-print` and `expo-sharing` versions match the installed SDK requirement.
- Physical Release acceptance passed on Leon's iPhone 16 Pro running iOS 26.6
  against approved Hosted Dev. The current fully settled eight-row lineage had
  head `1b837227-1bfa-4179-9cc0-b0db3ddbca01` and Statement digest
  `71777715442ffc72bedd87a1c4f714696cb7c98d985aa6e52e88e9f34368a734`.
- Member and de-identified PDF/CSV generation, durable reopen after force-quit
  and Release reinstall, Chinese/long-name/emoji rendering, long-table
  pagination, CSV formula protection, system share, Save to Files, practical
  AirDrop flow, Dynamic Type, and critical VoiceOver labels passed.
- With Backend unavailable, cached artifacts remained viewable/shareable. After
  reconnect, `PRAGMA integrity_check` was `ok`, schema migration 15 was present,
  all 16 manifest URIs resolved in the current container, all file hashes
  matched, and there were four current plus twelve historical artifacts with no
  duplicate root/head/digest/privacy/format identity.
- Generate/preview/share left financial state unchanged at Settlements `8|14`,
  inputs `33`, balances `2`, Adjustment deltas `14`, Transfers `2|8`, Payments
  `3|6`, Discharges `3`, and audit `14|27` (row count|revision sum where
  applicable). Final Member-private-field and de-identified identity scans
  passed.
- A physical-only independent-route scrolling defect was fixed by giving the
  standalone Settlement screen a native scroll container while keeping the
  Ledger-embedded variant non-nested. The affected Release Simulator build,
  physical Release reinstall, typecheck, lint, formatting, and all 44/147 tests
  passed.

## Authoritative Stage 7 Sources

- `docs/ledger/LEDGER_2_0_IMPLEMENTATION_PLAN.md`
- `docs/ledger/LEDGER_2_0_API_CONTRACT.md`
- `docs/adr/0014-ledger-stage-7-2-payment-and-adjustment.md`
- `docs/adr/0015-ledger-stage-7-3-device-export.md`

## Next Checkpoint

Stage 7 is complete. Stop before Stage 8 or Production work and wait for a new
approved checkpoint. Server-side rendering, public share links, payment-provider
integration, and legacy Web changes remain out of scope.

## Safety Notes

Production and legacy OTR Web were not inspected or modified. SQLite remains the
Mobile local source of truth, remote business writes remain behind the Backend
contract, and all historical Settlement/Adjustment/Transfer/Payment/Discharge
facts remain immutable. App-owned export documents survive normal offline use
but are not external archival storage and may be removed when the app is deleted.
