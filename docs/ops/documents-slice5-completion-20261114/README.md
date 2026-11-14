# Slice5 Documents completion — 2026-11-14

Product candidate: `0302d5340a2eeb97da59406bb623f8f877efb3b8` (on `codex/import-v3-slice5-documents`). Source parent `dd9304de`; neither merged nor pushed. Documentation may advance HEAD without changing this product tree.

## Result: PARTIAL / MERGE NO_GO

The remaining mandatory actual Native scroll-collapse interaction is not verified. This is an evidence blocker, not a proven product failure: DeviceHub AX taps work, but coordinate actions report `noWindowsAvailable` and drag/wheel attempts did not move the list. No test assertion was removed, no product restriction added to mask it. Do not mark full Slice5 or physical iPad PASS.

## Current implementation and validation

| Requirement | Status and evidence |
|---|---|
| Independent Document Detail navigation | Implemented; dd9304 full App native stack verified. Final0302 reopens PDF Detail and original. No embedded Directory Detail. |
| Summary, real source/time, default formal Batch outcomes | Implemented; default hierarchy separates directly linked Items from formal outcomes. No inferred acquisition time. Real iPad dd9304 14:43 Batch shows Created hotel / Linked walk; 20:50 history remains unverified. |
| Compact authorized Item rows | Implemented; existing reader supplies type, actual date/time and available place. Absent fields stay absent. Document→Item→Back actually verified on dd9304. |
| A→Batch→B→Back | Actual original iPad dd9304 PASS; final0302 rebuild/install PASS, this interaction not repeated on0302. |
| More / File Information | Actual dd9304 PASS; canonical sheet and native menu. Screenshot explicitly identifies older source. |
| Export | Byte verification, current-access fence and temporary cleanup targeted PASS. System Share entry wired; final native export not verified. |
| Top-right full-screen Search | Existing route retained and previously full-App verified. No inline Directory search form. Final incremental changes do not replace search. |
| Relation facets | Targeted PASS; only provable readable Item counts qualify. Unknown does not become zero. |
| Real cursor pagination | Targeted PASS:35 records returned30+5 without duplicate/binary reads; no eager while-loop. Native multi-page evidence not obtained. |
| Loading / Empty / Denied / Offline Unknown / Failure | Implemented presentation distinctions; targeted PASS. Offline unknown is not Empty or Save Failed. |
| Filter-only collapse / return positions | Pure helper tests PASS; actual current Native gesture BLOCKED as above. Return data retained during refresh; complete long-list gesture evidence missing. |
| PDF exact original recovery/open | Actual iPhone same public fixture selected via normal Files→Open, exact hash/length verified, no new Doc/Item. Final0302 QuickLook visibly displays both pages after full rebuild. |
| JPEG recovery preserved | Actual native content viewer PASS on preceding product; final baseline/private file preservation PASS. No old private originals copied across devices. |
| Dynamic Type | Actual0302 large-type filter height clipping corrected; default size restored3, keyboard capture off. Complete accessibility matrix not claimed. |
| Account/Trip isolation | Existing repository guards and targeted negative tests PASS; no new multi-account Native E2E or physical device result claimed. |
| Cold/rebuild data preservation | Final0302 iPhone9/9 and iPad30/30 prior private files unchanged; CoreDocs9/links14, queues13/33 COMPLETED unchanged. Two exact public fixture files deliberately retained on phone by normal user selection. |

Final targeted run90/90 in7files PASS. Scoped lint PASS. UI guard177PASS, legacy473 unchanged. Typecheck has exactly3 existing Main errors (two universalContinuationRuntime presentationTier, one browser react-dom/client declaration). One architecture timeout during concurrent Xcode load was rerun unchanged while idle and passed; no timeout/skip weakening.

Both final full Release native builds installed in place with original bundle IDs. Executable/JS/plist hashes included. No uninstall, Session/Keychain/SQLite/Queue copy or reset. Source staging reused the complete native project; not a JS-only old shell replacement.

## Scope and missing ownership

See `OWNING_CAPABILITY_GAPS.md` for Rename, Share/Private, Add/Move Trip and Safe Remove. UI makes them visibly unavailable; none is marked PASS. These require normal owning commands/Receipt semantics, not direct SQLite mutations. Cloud Sync remains approved deferred; full Activity/Updates remains Slice6. Search is authorized local metadata/retained TEXT, not PDF/image content indexing.

No new Provider/Analyze/Save, SQL, Core authority, shared DEV, Production, Main merge/push or Slice6. AUTH-C04 is separate and must not replace Import/Parent/Ledger composition.

## Next bounded action

Obtain current full-App gesture/export evidence through working native device input, then review only outstanding acceptance rows. Do not rerun B1, invent ownership ports or label historical screenshots current0302 PASS.
