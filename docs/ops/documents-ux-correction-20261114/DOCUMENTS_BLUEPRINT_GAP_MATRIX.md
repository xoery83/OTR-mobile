# Documents Blueprint vs Current App — 14 November 2026

Scope: Slice5 branch, current product0302d534. Updated completion evidence: `../documents-slice5-completion-20261114/README.md`. This is a factual gap register, not approval to implement adjacent scope. No Main push, Provider request, Core Save or SQL change.

## Authoritative sources

Full text reviewed from `/Users/xoery/Downloads/Document Module Design V1`: Documents Product Delta; Trip Docs / Personal Inbox UI Blueprint; Document Detail Product Delta; Document Detail UI Blueprint; Documents Search Delta; Document Detail Batch Link Addendum; Import Activity Delta and UI Blueprint, all 2026-10-23. The Documents UX poster and Detail board were actually viewed. Later Owner V3 Local-First / no Cloud Sync decisions override historical cloud-file assumptions. Latest Owner scroll-only-filter instruction overrides the earlier compact retained header.

## Comparison

| Approved behavior | Current implementation / evidence | Gap and reason |
|---|---|---|
| Top-right search opens dedicated screen | New `/document-search`; normal full App navigation and query entered on iPhone | Previous inline form was an implementation omission. Corrected, no second search engine. |
| Scrolling releases vertical space | Existing directory scroll drives chrome visibility; filter row remains outside list | Toolbar lifecycle follow-up still needs final actual Native check; pure gesture regression passes. |
| Trip Docs / Personal Inbox / Activity navigation | Normal Documents entry, scoped tabs and working Trip context | Activity's complete Oct23 UX belongs to explicitly paused Slice6. Tab tap verified; full swipe acceptance remains unverified. |
| Authorized compact rows, format and privacy | Real Core metadata merged with local captures by exact content identity | Source channels not all integrated. Email/Link and EML/HTML/ICS are later scope, not supported just because a file decoder exists. |
| Separate persistent metadata from available file bytes | Phone has nine metadata rows and fourteen links but none of six B1 original files | Expected Local-First cross-device limitation; original bytes remain on original iPad. No automatic cloud download can be promised. |
| Open readable original, meaningful unavailable state | Existing viewer reused; missing-owner file now offers normal Files re-selection | Exact hash/length checked, same Document retained; no Analyze or new Item. Unit verification and actual iPhone JPEG selection→private retention→native content viewer→same Detail return pass. PDF normal Files re-selection and final0302 native two-page QuickLook now verified. Other members receive no unauthorized file action. |
| Dedicated Detail navigation / compact header | Independent `/document-detail` native stack; final PDF navigation verified | Corrected. Broader current-version interaction evidence remains separately qualified in completion report. |
| File identity, acquisition source/time, format summary | Title, format, size, privacy and linked objects rendered | Full summary icon/acquisition presentation incomplete; cloud metadata does not prove original acquisition channel. Never substitute Receipt time for acquisition time. |
| Same-import results distinct from direct links | Real Batch/Receipt projection exists, separate from direct Item relationships | Corrected: formal outcomes now in default Detail hierarchy, distinct from direct links. Unverified historical Batch is not declared successful. |
| Batch → other originals → Back | Exact account/Trip/digest/size plus retained Batch IDs | Verified holding-device evidence reused. Cross-device local Batch history absent; not inferred from matching filenames or times. |
| Compact official Item rows with type/date/place | Authorized canonical relationship reads and navigation exist | Corrected: type/date/time/place from readable canonical fields; unavailable values omitted. |
| Contextual More / File Information | Native More actions and canonical information sheet implemented | Actual dd9304 Native verified; current0302 code retains it. |
| Export readable file | Native original viewer supports system sharing when bytes are available | Dedicated export entry now wired with verified bytes, current-access fence and temporary cleanup. Native final export not verified. Never export inaccessible file metadata as actual original. |
| Rename Document | Creation metadata title exists | No normal owning Document rename command is currently wired/supported. Local snapshot mutation would fake cloud persistence; owning contract gap. |
| Share / Make Private with legitimate roles | Generic SET_OBJECT_VISIBILITY exists | Normal MANUAL command selector does not admit Document visibility target; normal writer/Receipt wiring absent. Existing Core capability plus wiring gap, not a reason to widen ACL. Runtime role matrix not verified. |
| Add / Move between Trip directories | Metadata remains Trip-scoped with account/Trip/content-derived identity | Owning directory relation and ordinary command path missing. Cannot implement by silently changing trip_id or duplicating canonical Items. Approved UX remains undelivered, not automatically deferred. |
| Safe remove / cleanup | No destructive action added | Custody and retained-operation semantics need owning implementation; never delete sole original or unresolved-operation evidence. |
| Cloud original state/download | LOCAL_ONLY / NOT_UPLOADED honored | Explicit later Owner deferral of Document Cloud Sync; intentional scope, not decoder failure. |
| Search scopes / facets / text | Authorized local scopes, filename, retained small TEXT, format/privacy/source/date/offline facets | Relation facets now use readable direct Item counts; local TEXT capped64KiB; unsynced remote catalogs not searched. Read adapter/UI gap, not write-permission issue. |
| Incremental directory browsing | Repository stable cursor now consumed incrementally,30 records per page | Targeted35-row30+5 cursor check PASS; near-end native interaction not verified. |
| Loading / empty / denied / unavailable | Loading, empty, denied, offline unknown and read failure projections present | Targeted distinctions PASS; missing-owner recovery uses normal Files exact-content validation. |
| Activity / Updates / AI sessions | Existing Capture Activity reused | Full source filters, counts, cross-module Activity/Updates navigation remain Slice6. Not reported as completed Slice5. |
| Dynamic Type / dark / keyboard / VoiceOver | Prior holding-device dark/large-text corrections validated; new screen reuses Foundation | Final new layout needs actual verification; complete VoiceOver and multi-account Native runtime matrix unverified, isolated account guards pass. |

## Code index

- `src/features/documents/DocumentsScreen.tsx`: toolbar, dedicated-search projection, Trip context, directory paging, filters and scroll chrome.
- `app/document-search.tsx`: existing screen reused as full-screen route.
- `src/features/documents/CoreDocumentDetail.tsx`: authorized detail, linked Items, Batch/readback projection and original actions.
- `src/data/operations/localItemImportOriginals.ts`: metadata, relationships, Batch/Receipt reads and exact-file local restoration.
- `src/data/repositories/importDocumentsRepository.ts`: authorized local directory indexes, retained TEXT bound and cursor.
- `src/features/documents/documentListPresentation.ts`: merge/filter/scroll projection.
- `src/domain/trip/tripCoreV2Commands.ts`: existing Document create/link, generic visibility and normal MANUAL selector boundaries.

## Verdict

Documents overall remains **PARTIAL**, not full Blueprint PASS. Current work corrects search/navigation density and the misleading unavailable-original action. It does not silently deliver rename, sharing, multi-Trip directory writes, cloud originals or Slice6. Missing data custody, missing owning commands, missing UI wiring and approved deferral are different causes and remain explicitly separated.
