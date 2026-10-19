# Independent HOME-COVERS combined review — 2026-10-19

What this change does: Reuses the frozen Cover Lab matching package to suggest bundled covers and adds a finite Native gallery. Recommendations remain display-only; explicit manual cover choices retain precedence and save through the existing owning repository.

**Verdict: Code Review PASS for `21df3051d55cb7df6d2cdd803ee581da7002177a`; isolated Hermes Export PASS. Native install / Native VQA / UX Accepted remain NOT VERIFIED.** No must-fix found in this bounded combination.

## Exact candidate

Started at requested `6c1597fd354d19055fb8ffd3189220393458cd6f`, based on ER02 `c58f8064` plus reviewed Core pick `9bd21394` (source `3a2b4fac`). During review author fixed one missing test import at final `21df3051`. Independently checked `6c..21`: only `coverDecision.test.ts` imports the already-used `nativeTripCoverAllowlistSha256`; product/runtime bytes are unchanged. Original6c had a real failing assertion/compile dependency and is not recorded as final full-check PASS.

## Findings and boundaries checked

- Vendored ten original TypeScript files match both `FROZEN_SOURCE.json` and actual Lab `src/` bytes at frozen `9555ed42197bb0c955f12146317d2889757a7fd8`. Ten adjacent JS hashes and five data hashes match. Independent regression reproduces all ten JS files with installed TypeScript6.0.3 `transpileModule`, ES2020/ESNext. Compiler/Node filesystem APIs occur only in tests, not the App import graph.
- All48 new JPEGs match the immutable allowlist bytes and actual Lab candidate image bytes; static resource map has exactly52 literal requires (legacy4 plus approved candidate48). No Owner22 images/raw source images/remote image fetching are added.
- Native consumer calls the frozen `rankCoverAssets` and configures frozen GeoIndex once. It does not rewrite ranking. Its `allowPendingLandmarkPreview:true` is explicit in this isolated preview consumer; byte-exact vendor production eligibility remains default false. Rights/human/crop states remain pending; no acceptance field is changed.
- Raw NULL alone enables automatic suggestions. Known manual IDs always win; unknown raw and uncertified undefined retain an unavailable-manual fallback and are not treated as AUTO. Automatic recommendations do not call a writer or populate a persistent draft from a resolved image.
- Metadata Editor passes no cover tuple for metadata-only saves, stages explicit cover changes until Save, uses exact raw before value for CAS and keeps Cancel out of persistence. Workspace updates selected/raw only when an explicit tuple exists. Existing local-only direct cover capability remains separate for metadata-read-only Trips. Combined Editor/SQLite tests retain atomic failure/retry/CAS and same Trip identity.
- Create identity, create/save payload, schema, Hosted permissions and sync transport are unchanged. Cover registry/atomic repository reuse the earlier reviewed Core candidate; no duplicate storage model.
- Gallery uses FlatList with bounded initial/batch/window settings (6/6/5), bundled images, canonical SheetHeader/buttons/text, semantic colors/typography and localized EN/ZH copy. Credits toggle in the reachable ListHeader exposes per-asset author/licence/attribution and source/licence links plus GeoNames/Wikidata credits. These links are user initiated; no automatic network request is introduced.

## Independent checks

- Four relevant suites (`coverDecision`, `TripBasicEditor`, `TripEditorMembers.integration`, `LocalTripWorkspace`): **41 tests / 4 suites PASS**, start23:16:11 NZDT; includes byte/hash/type-erasure reproduction and Editor staging/unknown preservation/cancel/failure contracts. This is separate from author's reported99/9.
- Whole `tsc --noEmit`: **PASS**, closing the earlier Core-only missing48 assets / old four-ID consumer failures.
- `npm run ui:guard`: **PASS**,124 representative files. No product-code edits made by reviewer.
- Root's final isolated export log `/private/tmp/otr-covers-export-final-20261019.log` ends `Exported: /private/tmp/otr-covers-export-final-20261019`. Independently inspected artifacts: assetmap contains all52 cover resources, including48v2. One Hermes bundle `entry-a767a9aba522f058c607e172d63482cb.hbc`,11,819,565 bytes, SHA256 `ad115aac0d1738e96ba1a62bc7073da6ab3cddde2958d436a0462d18f57b0169`. Log SHA256 `e27af42f43e251d3bee7874eae08bd2b7a971be18e6b5d2e91073d3a189890da`. Export not rerun by reviewer.

## Remaining gates

- Installation/Owner preview requires the separate device authorization. No Simulator, account, Hosted or Backend operation performed in this review.
- Native startup/index latency, memory, Gallery scroll/decode, Dynamic Type/Dark Mode and Editor interaction remain to be measured on the installed App. GeoJSON is6.2MB and synchronous initial indexing plus JS objects are a material Native performance risk; Root's ~49.6MB heap /248.6ms cold-index numbers are Node references only, not Native acceptance.
- Release/IPA size delta, rights/human/crop acceptance and final Owner UX remain open. Bundled candidate eligibility must not be relabeled approved asset rights or verified destination photograph beyond the frozen matching policy.

No blocking Code finding. Ship only to the separately authorized isolated preview gate; do not mark Native/UX PASS from this report.
