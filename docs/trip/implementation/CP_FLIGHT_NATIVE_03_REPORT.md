# CP-FLIGHT-NATIVE-03 — Owner Review

Status: **READY for canonical integration review; PDF activation remains CLOSED.** No canonical merge/push or full PDF → accepted Flight E2E PASS is claimed.

## Exact integration scope

- Branch: `codex/flight-native-03`, isolated managed worktree `flight-native-installed-simulator/otr-mobile-canonical`.
- Accepted Native: `b10e0768fb61f6acb6b2b8f8847d3b0941b3af23`, 32 files. Accepted preparation: `14a9041828f87881c9d76c24769317592cf6be66`, tree `5c9f16cd6649369b1b0f1d37edc2acf9b540f86d`, 35 files.
- Initial actual local canonical: `c0a69204fab3e663356a7f34406d580147869aeb`, including G2 DL1. Remote main reconfirmed by `git ls-remote`: `12693e3c1513d678bd3fe0190bb830d79f262b49`.
- Isolated reconciliation commit: `706fd35fabd4fa27882e09c206dd9d113c4d7670`, tree `c11ddb304eabde4b7bb9e7ad155bf9a51fa9af70`.
- Canonical advanced concurrently to `03794531a224f0a7046f2717a7a9960b1241fc4f` (CLOSED model-task integration). Reconciled in isolated commit `8ed6e8689b12f29dcdfb18bbe06ad9ccb4c3c568`, tree `5c8088aa7af13168adf9a3de8447870368ee2a3a`.
- Both reconciliations conflicted only in `docs/CURRENT_IMPLEMENTATION_STATE.md`: retain Native preparation prefix plus the complete newest canonical handoff. All other accepted preparation blobs and all newest canonical changed blobs are exact. Previously resolved Backend SQL fixture/runner TEXT and Native paths are preserved. No independent old Stage 1 17-file merge.
- New code is verification-only: headless installed entry, synthetic batch, owning SQL replay consumer, and one existing SQL runner selector. Production Native implementation is unchanged. No new dependency, tracked Podfile/lockfile, product UI, navigation, Lab, Publisher, Source seal, Canonical writer or sync engine.
- Exact final file list: `CP_FLIGHT_NATIVE_03_CHANGED_FILES.txt`. The final report/evidence commit and tree are returned with this report; the integration trees above are independently reproducible without self-referencing report hashes.

Latest accepted G2 DL2 canonical `40c5d29a9f3d6232003393af1ae516a339a46b56` was then preserved in isolated commit `691aa895a7443883e12051ab153a74ee64e312aa`, tree `1eae97d34b3ceb2b1d8bedacc8f17c123bbd0776`. Again only the combined handoff conflicted. Installed app evidence predates this final read-only DL2 integration; affected repository/Day tests and joined SQL are rerun on the final tree.

## Installed bridge / build correction

Normal Expo prebuild and CocoaPods tooling resolved the stale/offline metadata blocker. Reused the existing pinned Pods cache; `pod install --no-repo-update` completed. React Native remains 0.86.3, Expo 57.0.23. The installed official RN version properties and a fresh `npm pack react-native@0.86.3 --ignore-scripts` agree.

An initial legacy `RCT_HERMES_V1_ENABLED=0` attempt selected Hermes 0.17.0 instead of the accepted G2 250829098.0.17 roster. That task-owned build was stopped before installation. Correct supported invocation used `RCT_HERMES_V1_ENABLED=1` and `HERMES_ENGINE_TARBALL_PATH` pointing to the already cached 250829098.0.17 debug archive. All resulting pod names/versions exactly match G2's lock roster. No dependency version or tracked lockfile/Podfile changed. Local path/checksum metadata is generated build state only.

Both the normal Simulator build and the embedded offline diagnostic build report **BUILD SUCCEEDED**. Generated Expo provider registers ReceiptOcrModule; Xcode compiles ReceiptOcrModule.swift and FlightPdfExtractor.swift. Installed JS calls `requireNativeModule("ReceiptOcr").extractFlightPdf` successfully, rather than a JS mock.

Fresh owned simulator: `2026A66F-5D3B-47D9-AB21-6E9B65436CA4`, iPhone 18 Pro / iOS 27.0; isolated bundle `com.xoery.otrmobile.devtest`. Existing G2 apps/containers were untouched. Only ignored generated DEBUG AppDelegate used the embedded test bundle instead of Metro. Temporary root config selected the approved DEV Test bundle ID. Neither change is committed. The owned simulator is stopped with its installed app/data retained for review.

## Installed PDF / custody / recovery evidence

Supported format remains **selectable-text PDF**. Image/scanned PDF OCR is not activated by this checkpoint. A synthetic 8,393-byte two-page PDF was acquired through the actual native file URI reader and existing C2 streaming submission. SHA-256: `f193cd842ed36779c9087d9c6c0a1bd7c3859dbafbf1807227d29afdeaacc12c`.

First installed launch: `FIRST_PASS`, actual PDFKit invocation count 1. Two distinct Candidates: `214b51d6-0ef3-82ba-ab3a-bb3d482f4fec`, `40492636-283f-8d6c-afeb-2d9772de3c66`. Evidence page ranges are page 0 `[0,62]`, page 1 `[63,125]`; candidate spans intersect their actual pages. C2 Input `9bc34f6e-2c2f-47c2-b1eb-48a2304494e7` and Job `963f9fc7-0881-4760-8a30-173fc96f6b7d` persist with exact original custody.

Third launch, after terminate/relaunch **without reinstall**: `COLD_RESTART_PASS`. Original hash/bytes, C2 identities, prospective Source/representation/Run/Input/publication/plan/slot/operation/Item identities and two Candidates remain exact; native extraction is not repeated. A test assertion initially compared object key ordering; the assertion now uses the existing canonical JSON helper. No production identity code changed.

Local schema is 55 (Core collection schema remains SQLite54). Synthetic installed Account generation A→B→A and foreign Trip denial pass. The embedded entry rejects fetch and reports zero network attempts on every successful launch. This proves local persistence under the closed application network seam, not OS radio/network isolation, real Auth UI switching, or the system Files picker interaction.

The test entry uses the existing private preparation repository and explicit synthetic admitted-catalog fixture. It registers no authoritative Source: Sources 0, accepted Items 0, queued operations 0. All Source/Run/import Input and proposed Item UUIDs in the evidence are **prospective private preparation**, not Canonical acceptance. The production Day reader returns no accepted Items. Unknown fields retain the existing unknown/REVIEW behavior; no qualification workaround is added.

## Authority and exact installed-packet replay

`--native-installed` sends the packet read from the installed SQLite preparation to the existing owning publication/preparation SQL path. Existing test-only source metadata bootstrap is explicitly synthetic; it implements no derivative seal. No Candidates are rebuilt. Both installed Candidate IDs return **REVIEW / CONTRACT_UNSUPPORTED**, with **zero ready commands**. Repeated publication/preparation preserves the exact installed publication/plan identities. PDF qualification remains dependent on Agent 3's unfinished PDF Derivative Authority / Source/Core contract.

This is a disposable CLOSED SQL fixture, not an app request to Core DEV or Hosted success. Normal accepted queue/read2/SQLite54 paths are unchanged. The independent accepted ORIGINAL TEXT fixture covers publication, command recovery and collection installation without a second writer.

## Verification matrix

| Evidence                           | Result and scope                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Fixture                            | PASS: 11 focused suites, 141 tests; 1 SQL-only test skipped in ordinary Vitest, covered in owning SQL mode |
| Owning Native SQL                  | PASS: 13 tests; existing review/replay/recovery                                                            |
| Exact installed packet owning SQL  | PASS: 1 test; two REVIEW, zero commands                                                                    |
| Joined SQL → SQLite54 → Day        | PASS: 1 test; accepted ORIGINAL TEXT fixture only, lost collection response and file cold reopen           |
| CP-FLIGHT-DEV-02 local HTTP/PG/TLS | PASS: 1 test; five backend restarts, one original, no private leakage, Hosted false                        |
| Installed Simulator                | PASS: real bridge/PDFKit, C2 custody, private preparation, three launches, no-reinstall cold recovery      |
| Physical Device                    | NOT RUN                                                                                                    |
| Core DEV Read                      | NOT RUN                                                                                                    |
| G2 shared native presentation      | Existing G2 unchanged; no new Flight Lab or visual certification                                           |

Typecheck, full lint/UI guard and Backend build PASS after model-task reconciliation; concurrent model-task/Flight host tests: 57 PASS, 2 intentionally skipped. Final DL2 typecheck, full lint/UI guard and Backend build PASS; affected Native/Core/G2 tests: 60 PASS, 1 SQL-only skip; joined owning SQL → SQLite → Day: 1 PASS. Formatting and diff checks PASS for changed files. Disposable SQL runs preserve 329 historical functions and CLOSED/RLS gates. No unrelated Ledger, G2 or TTR production file changes.

## Minimal G2 handoff

Experience/G2 remains sole Lab owner. Use its existing fixture injection and production Core read2 → SQLite54 → Day reader; no Native navigation/Composer/fixture gallery.

The installed PDF's accepted read projection is **empty**. Do not inject its proposed Item UUIDs as accepted, and do not enable DEV DATA mode on this evidence.

For independent accepted Flight presentation, the joined existing synthetic ORIGINAL TEXT projection expects:

| Accepted Item UUID                     | semanticRevision | localDate  |
| -------------------------------------- | ---------------- | ---------- |
| `5b7b7973-79e1-4c93-af14-1f2558cc2f23` | 2                | 2026-12-20 |
| `fccd4012-eb48-46fa-9358-49f3d7fb54d1` | 2                | 2026-12-17 |

Account `00000000-0000-4000-8000-000000000001`, Trip `10000000-0000-4000-8000-000000000001`; access revision 1. The captured run has epoch `19b531e7-2310-4777-ab4d-76f6a6f99d1f` and manifest SHA `66b85aadf7e4253e19a5c424f921fa861c36fc9bb65ec52454e5207dfed4eb8f`; epoch/manifest belong to that exact captured collection and must not be hard-coded for a new run. Preserve Focus/NOW/scroll and TTR boundaries. DL2 now exposes `createTripDayFeedLabReader` over `acceptedTripIds` and `acceptedSnapshot`, requiring an adopted session and complete accepted certificates; Native adds no injection or auth bypass. This document supplies the handoff without messaging another chat.

## Remaining gates / Owner decision

The installed Expo bridge blocker is resolved without a dependency upgrade or security-sensitive configuration. No concrete new production read/Lab seam is missing; PDF accepted-read activation is blocked by Source/Core derivative authority, not by a second Day writer.

Owner may review the isolated reconciled tree for canonical merge separately. Agent 3 authority approval, real-device Files acquisition/Auth switching/OS offline calibration, and separately authorized Core DEV read/shared G2 native presentation remain activation gates. No Hosted, Provider, paid LLM, Production, unrestricted runtime, C5/C9 or DEV DATA activation occurred. STOP AT OWNER REVIEW.

Local detailed logs and installed packet: `/private/tmp/otr-flight-native03`; committed synthetic evidence: `CP_FLIGHT_NATIVE_03_EVIDENCE.json`. Reproduction instructions: `scripts/trip/native-flight-03/README.md`.
