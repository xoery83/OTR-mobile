# Auth → Native client integration

Golden Slice A **PASS**: normal App menu → Settings → Profile → Edit → local Save → process restart → same-Account readback. Golden Slice B **PASS, DRAFT ONLY**: real adopted Trip → Members → Add traveler → type private draft → process restart → restore → Cancel → reopen blank. No traveler was submitted.

## Fixed candidate and device

Product source `4e9a2d2e` follows exact Auth integration `ae8b796f`, real menu context repair `5d00dc3e`, and Metro config isolation `564772ab`. Base main `4e1bedfc`; no Auth long-branch merge, main update or push. See PATCHES.json for exact handoff hashes from `dfb35d88`.

iPad QA140, `com.xoery.otrmobile.ipadqa`, JS SHA256 `563af64c1b204a6181902276bcaeccb7522a62fb143b0bfa5ed02f251f4a6db9`. Same accepted127/128 Native executable/profile, JS repackage, not a new full Native build. In-place installation, no uninstall/reset/container/Session/SQLite copy. Fresh device OS read is **iPadOS27.2**, correcting stale26.0.1 metadata; Native performed no OS upgrade. QA135 artifact retained. Current device Account A restored by normal OTP, English/System appearance restored, four historical Trip cards still visible. Own agent-device session closed normally; no iPhone/AD5/DeviceHub GUI use.

## Actual results

| Check | Result / evidence boundary |
|---|---|
| Profile normal Save and cold readback | PASS QA136 and current QA140; Chinese name, decomposed accented given name, private AKA retained |
| Profile Cancel | PASS QA136; unsaved replacement discarded, saved name retained |
| Nullable Display Name | PASS; clear+Save, restart remains blank with document-name/AKA retained |
| Appearance and locale startup | PASS QA136; Dark + Chinese survive restart; restored English/System afterwards; does not certify all Form dark/Chinese UI |
| SQLite75→76→77 | PASS real SQLite migration tests, including late76 after77 and repeat startup; history/PENDING row/private77 row/FKs preserved. QA140 normal diagnostics independently displays77, online Auth, pending0 |
| Account A→B→A | PASS normal Native Email OTP; B's empty Profile does not show A's document-name/AKA; save distinct B name; restore A, original blank Display/name/AKA survive again after process restart |
| Actual adopted Trip draft | PASS Account B26876e6e / Trip9d10b9d7-6744-4355-b05d-728bf929d208; inherited Auth actual adoption evidence, not invented from summary title |
| Draft-only submission | PASS actual Save disabled, private-draft explanation visible; type `Native Draft 同行人 é`, process restart restores exact visible input; Cancel/reopen blank. Existing roster unchanged. Deterministic tests additionally prove no UUID/operation allocation and preserve existing submitted attempts. No device DB queue-diff claim beyond diagnostics pending0 |
| Account/Trip/generation fences | PASS scoped deterministic tests, original Auth private Repo tests; device A/B Profile isolation above. Cross-Trip late response is test coverage, not a separate hardware race test |
| Independent Review | Auth bounded source NO_BLOCKER for initial integration and both real consumer fixes; Metro independent NO_BLOCKER/1test. No Hosted/revocation/Cloud qualification inferred |

## Actual failures and minimal fixes

1. GlobalMenu omitted Members context, disabling the normal entry. Forward its existing current Trip/generation-qualified context; no `onSave` means draft-only.
2. Real adopted Trip was downloaded, not locally authored; authored-container existence check rejected it. Reuse existing current-Account `listJourneys()` exact Trip+`hasActor`, then original committed-Account/generation-checked draft loader. No new Reader or authoring permission.
3. Private packaging QA133–137 omitted three accepted128 Native public configuration flags (`dev` transport, normal Cloud enable, formal P2 flag); normal OTP failed **before Send**, while cached local UI results remained valid. Restored only accepted128 values. Metro had reused stale inlined transforms; cache key now includes a digest of sorted public env values, excludes private env. QA139/140 independently checked inlined dev config and completed normal OTP. No shared runtime/config changed.
4. First received QA139 OTP was discarded after the automation tool rejected `--record-as` before input dispatch. Explicit replacement normal Send used stdin/`--no-record`; no code, key, password or Session in logs/artifacts. QA140 A restoration also used normal OTP, not cached Session injection.

## Validation and remaining interfaces

Reused unchanged handoff validation:12suites102PASS; caller/migration3suites12PASS; existing Workspace+Person2suites87PASS and Members3PASS. Normal-menu caller regression4suites37PASS overlaps prior results. Final adopted-reader/Sheet2suites21PASS; targeted types, lint, UI guard and iOS JS export PASS. Counts overlap and are not a unique total. Final independent Native affected-scope Review NO_BLOCKER,4suites15PASS (startup/routes/migrations/callers); hardware results remain Native-observed. Auth review scope and exact hash receipt are in AUTH_REVIEW.json. Screenshot/log paths and hashes are in EVIDENCE.json; raw personal device metadata, credentials and codes are excluded.

Profile/AKA remain device-private, no Hosted Profile or Person link. Adopted Trip formal parent authoring/Invite/Claim remain Auth/Core owning followups; this menu path is intentionally draft-only. Real Scan, private Realtime, paid Enrichment, AI Usage and Hosted changes remain closed. Prior V2 device Edit/dark/Chinese Form deltas remain unverified. Native client integration is ready as a fixed candidate; no shared Backend release or main integration is claimed.
