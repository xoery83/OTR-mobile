**Status:** W0 CONTRACT FROZEN / OWNER CONTRACT REVIEW; implementation and activation not authorized.  
**Date:** 2026-10-11. **Verified canonical source:** `741579c8bac3f898669ca331875a28efc645cfa2` at `/Users/xoery/Project/otr-mobile`.  
**Namespace:** `otr-trip-core/2` (business/read/command v2); existing temporal contract remains v1.

# W0 Owner Contract Review

**Freeze status: COMPLETE FOR OWNER CONTRACT REVIEW.** D1–D4 are accepted final directions. No direct source/security contradiction requires reopening them. Schema, writes, read2 and Capture2 are specified; runtime remains CLOSED/not implemented. This report is a document acceptance target, not implementation activation.

## Owner review action

Accept or reject this nine-file W0 contract as the W1–W5 baseline. **Required unresolved product/security decisions: none.** The approval still needed is the explicitly requested Owner Contract Review, followed by separate implementation authorization; completion does not automatically start W1. Provider licensing, DEV custody/security activation and native/private-file validation remain their existing later gates, not new product architecture choices.

The contract closes: existing schedule authority, same-ID sparse Flight qualification, independently authorized participation/visibility/Booking/Ticket/originals, guarded auto admission, explicit N:M receipts/partial recovery, recoverable lifecycle/noncascade, P1–P6 read/Day semantics and minimum Flexible/TTR ports. Scope is [W1–W5 exact packages](W0_IMPLEMENTATION_PACKAGES.md). Capture can use candidate2/command2/receipt2/read2 now with mocked capabilities; actual output dispatch stays blocked until gates. W6 reads frozen DTO independently; minimum W7 Flight path does not await all renderers.

## Synthetic acceptance fixture set

These symbolic labels deliberately are NOT UUID wire payloads or private originals; fixture compiler in implementation must assign stable test UUIDs. Graph shape is executable-checkable independently of database. Dates/numbers are synthetic except product-shape examples already approved; no PNR/QR/person credential/provider call.

```json
[
  {
    "case": "A01",
    "title": "Air NZ two flights / one Booking",
    "trip": "SYNTHETIC-T",
    "items": ["F-out", "F-back"],
    "bookings": ["B-air"],
    "bookingItemLinks": [
      ["B-air", "F-out"],
      ["B-air", "F-back"]
    ],
    "entitlements": [],
    "entitlementItemLinks": [],
    "expected": "Two independent P2 items/dates; one commercial Booking; no global Flight root",
    "itemFacts": [
      {
        "id": "F-out",
        "family": "P2",
        "originDate": "2026-12-14",
        "flightNumberLiteral": "NZ0001"
      },
      {
        "id": "F-back",
        "family": "P2",
        "originDate": "2026-12-22",
        "flightNumberLiteral": "NZ0002"
      }
    ],
    "sourceLabel": "S-A01"
  },
  {
    "case": "A02",
    "title": "Thrifty same pickup / different returns",
    "trip": "SYNTHETIC-T",
    "items": ["R-small", "R-large"],
    "bookings": ["B-small", "B-large"],
    "bookingItemLinks": [
      ["B-small", "R-small"],
      ["B-large", "R-large"]
    ],
    "entitlements": [],
    "entitlementItemLinks": [],
    "expected": "Two rental UUIDs; one pickup shell, separate Dec20/Dec22 returns; price/due not paid",
    "itemFacts": [
      {
        "id": "R-small",
        "family": "P4",
        "startDate": "2026-12-14",
        "startLocalTime": "11:00",
        "endDate": "2026-12-20",
        "endLocalTime": "11:00",
        "zoneId": "Pacific/Auckland",
        "pickupPlaceLiteral": "Synthetic Nelson Airport",
        "reservedCategory": "Small car or similar",
        "startInstant": "2026-12-13T22:00:00Z",
        "clockPrecision": -1,
        "temporalQualification": "SYNTHETIC_EXACT_CIVIL",
        "endInstant": "2026-12-19T22:00:00Z"
      },
      {
        "id": "R-large",
        "family": "P4",
        "startDate": "2026-12-14",
        "startLocalTime": "11:00",
        "endDate": "2026-12-22",
        "endLocalTime": "11:00",
        "zoneId": "Pacific/Auckland",
        "pickupPlaceLiteral": "Synthetic Nelson Airport",
        "reservedCategory": "SUV or similar",
        "startInstant": "2026-12-13T22:00:00Z",
        "clockPrecision": -1,
        "temporalQualification": "SYNTHETIC_EXACT_CIVIL",
        "endInstant": "2026-12-21T22:00:00Z"
      }
    ],
    "sourceLabel": "S-A02",
    "bookingFacts": [
      {
        "id": "B-small",
        "due": {
          "minor": 60608,
          "currency": "NZD",
          "scale": 2
        },
        "paidEvidence": false
      },
      {
        "id": "B-large",
        "due": {
          "minor": 84738,
          "currency": "NZD",
          "scale": 2
        },
        "paidEvidence": false
      }
    ]
  },
  {
    "case": "A03",
    "title": "DOC one order / three Stays",
    "trip": "SYNTHETIC-T",
    "items": ["H-1", "H-2", "H-3"],
    "bookings": ["B-doc"],
    "bookingItemLinks": [
      ["B-doc", "H-1"],
      ["B-doc", "H-2"],
      ["B-doc", "H-3"]
    ],
    "entitlements": [],
    "entitlementItemLinks": [],
    "expected": "Three independent STAY ranges/places; no group Event",
    "itemFacts": [
      {
        "id": "H-1",
        "family": "P3",
        "startDate": "2026-12-15",
        "endDate": "2026-12-16",
        "propertyName": "Synthetic Hut 1"
      },
      {
        "id": "H-2",
        "family": "P3",
        "startDate": "2026-12-16",
        "endDate": "2026-12-17",
        "propertyName": "Synthetic Hut 2"
      },
      {
        "id": "H-3",
        "family": "P3",
        "startDate": "2026-12-17",
        "endDate": "2026-12-18",
        "propertyName": "Synthetic Hut 3"
      }
    ],
    "sourceLabel": "S-A03"
  },
  {
    "case": "A04",
    "title": "DOC supplementary order",
    "trip": "SYNTHETIC-T",
    "items": ["H-1", "H-2", "H-3"],
    "bookings": ["B-doc", "B-supp"],
    "bookingItemLinks": [
      ["B-doc", "H-1"],
      ["B-doc", "H-2"],
      ["B-doc", "H-3"],
      ["B-supp", "H-2"],
      ["B-supp", "H-3"]
    ],
    "entitlements": [],
    "entitlementItemLinks": [],
    "expected": "New supplemental Booking, same existing Stay IDs, N:M not duplicate stays",
    "itemFacts": [
      {
        "id": "H-1",
        "family": "P3",
        "startDate": "2026-12-15",
        "endDate": "2026-12-16",
        "propertyName": "Synthetic Hut 1"
      },
      {
        "id": "H-2",
        "family": "P3",
        "startDate": "2026-12-16",
        "endDate": "2026-12-17",
        "propertyName": "Synthetic Hut 2"
      },
      {
        "id": "H-3",
        "family": "P3",
        "startDate": "2026-12-17",
        "endDate": "2026-12-18",
        "propertyName": "Synthetic Hut 3"
      }
    ],
    "sourceLabel": "S-A04"
  },
  {
    "case": "A05",
    "title": "Water taxi different-date outbound/return",
    "trip": "SYNTHETIC-T",
    "items": ["W-out", "W-return"],
    "bookings": ["B-water"],
    "bookingItemLinks": [
      ["B-water", "W-out"],
      ["B-water", "W-return"]
    ],
    "entitlements": [],
    "entitlementItemLinks": [],
    "expected": "Dec16/Dec19 separate P5 segments, no repeated daily segment",
    "itemFacts": [
      {
        "id": "W-out",
        "family": "P5",
        "originDate": "2026-12-16",
        "serviceSubtype": "WATER_TAXI"
      },
      {
        "id": "W-return",
        "family": "P5",
        "originDate": "2026-12-19",
        "serviceSubtype": "WATER_TAXI"
      }
    ],
    "sourceLabel": "S-A05"
  },
  {
    "case": "A06",
    "title": "SNCF connected segments/shared ticket",
    "trip": "SYNTHETIC-T",
    "items": ["T-1", "T-2"],
    "bookings": ["B-train"],
    "bookingItemLinks": [
      ["B-train", "T-1"],
      ["B-train", "T-2"]
    ],
    "entitlements": ["E-train"],
    "entitlementItemLinks": [
      ["E-train", "T-1"],
      ["E-train", "T-2"]
    ],
    "expected": "Shared original, independent segment cards, edge-specific coach/seat, neutral interval",
    "itemFacts": [
      {
        "id": "T-1",
        "family": "P5",
        "originDate": "2026-12-14",
        "serviceSubtype": "TRAIN"
      },
      {
        "id": "T-2",
        "family": "P5",
        "originDate": "2026-12-14",
        "serviceSubtype": "TRAIN"
      }
    ],
    "sourceLabel": "S-A06"
  },
  {
    "case": "A07",
    "title": "Group ferry no required member assignment",
    "trip": "SYNTHETIC-T",
    "items": ["Ferry-1"],
    "bookings": ["B-ferry"],
    "bookingItemLinks": [["B-ferry", "Ferry-1"]],
    "entitlements": ["E-group"],
    "entitlementItemLinks": [["E-group", "Ferry-1"]],
    "expected": "quantity6, holders[], one original QR face, no synthesized persons/faces",
    "itemFacts": [
      {
        "id": "Ferry-1",
        "family": "P5",
        "originDate": "2026-12-14",
        "serviceSubtype": "FERRY"
      }
    ],
    "sourceLabel": "S-A07",
    "entitlementFacts": [
      {
        "id": "E-group",
        "quantity": 6,
        "holderPersonIds": [],
        "accessClass": "STATIC_ORIGINAL",
        "originalFaces": 1
      }
    ]
  },
  {
    "case": "A08",
    "title": "Long-validity pass / zero Item",
    "trip": "SYNTHETIC-T",
    "items": [],
    "bookings": [],
    "bookingItemLinks": [],
    "entitlements": ["E-pass"],
    "entitlementItemLinks": [],
    "expected": "DATE validity inclusive; no automatic Canonical Event or Day row",
    "itemFacts": [],
    "sourceLabel": "S-A08",
    "entitlementFacts": [
      {
        "id": "E-pass",
        "kind": "PASS",
        "validFromDate": "2026-12-01",
        "validUntilDate": "2027-03-31",
        "validityPrecision": "DATE"
      }
    ]
  },
  {
    "case": "A09",
    "title": "One Source / many Items / no Booking",
    "trip": "SYNTHETIC-T",
    "items": ["A-1", "A-2", "A-3"],
    "bookings": [],
    "bookingItemLinks": [],
    "entitlements": [],
    "entitlementItemLinks": [],
    "expected": "Shared private source provenance only, no fabricated reservation",
    "itemFacts": [
      {
        "id": "A-1",
        "family": "P1",
        "startDate": "2026-12-14",
        "title": "Synthetic activity 1"
      },
      {
        "id": "A-2",
        "family": "P1",
        "startDate": "2026-12-15",
        "title": "Synthetic activity 2"
      },
      {
        "id": "A-3",
        "family": "P1",
        "startDate": "2026-12-16",
        "title": "Synthetic activity 3"
      }
    ],
    "sourceLabel": "S-A09"
  }
]
```

| Case | Negative / recovery acceptance             | Expected result                                                                                                                                                                                                                                                                    |
| ---- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A10  | Offline sparse→qualified                   | Literal NZ0001 +2026-12-14 creates pending UUID Q once; restart/reconnect exact receipt; proof-bound qualification moves root date to ORIGIN same UUID, no extra Event; lookup failure retains sparse.                                                                             |
| A11  | User edits / explicit clear                | Manual changed departure date or cleared optional note is protected; stale auto update409, field untouched; UNKNOWN never clears; new reviewed resolution uses fresh operation.                                                                                                    |
| A12  | Lifecycle scope                            | Cancel one DOC stay leaves Booking/other stays active; whole Booking requires exact visible authorized graph; shared graph change409; exclusive hide option explicit; replace creates NEW Booking/history, stable Item schedule protected.                                         |
| A13  | Replay / partial output                    | Repeat Source+slot returns same UUID/receipt; domain succeeds/Booking fails leaves Item; EVIDENCE_PENDING resumes finalization only; lost HTTP response no duplicate.                                                                                                              |
| A14  | CrossTrip / SELF                           | Member M SELF PRIVATE hidden from organizer O and other Trip; own read succeeds; selected participation does not grant Document; account switch invalidates old certificate/queue delivery.                                                                                        |
| A15  | Document / Ledger noncascade               | Item hide/unlink/cancel/Booking replacement retains referenced Document bytes/Entitlement/expense and immutable receipts; source original private despite group Item; explicit authorized copy alone permits independent shared original.                                          |
| A16  | Static vs dynamic original                 | STATIC_ORIGINAL absent bytes offers authorized download; exact hash/version/bytes allows local VERIFIED/open original; invalid/evicted/revoked blocks; dynamic provider offlineExecutable=false, no synthesized QR/download/acceptance claim.                                      |
| A17  | Temporal / missing / bases                 | Date-only TNS no midnight; local clock no resolver remains nonComparable; GAP rejects/FOLD Review; exact microseconds and local labels retained; overlapping Stay gives no guessed base; missing terminal/time/plate omitted; same date unknown clock rentals not visually merged. |
| A18  | Flight identity / codeshares               | Marketing literal/date similarity cannot merge operating leg; verified operating/date/airports can share public provider observation cache, not Item/private source; strict proof coverage and transitive ancestry fail closed.                                                    |
| A19  | Certificate / interruption                 | Actor-filtered whole snapshot counts authorized only; mixed/partial/old access generation never absence-delete; SQLite interrupted install old generation intact, no UNASSIGNED v1 cert reuse.                                                                                     |
| A20  | Instruction correction / entitlement alone | Sensitive code PRIVATE on shared Stay; append/correct retains Source and prior entry/history, user correction protected; group ticket holder optional and long Pass visible only in authorized Wallet, no dated Item needed.                                                       |

## Required implementation assertions

1. Graph FK/sameTrip/unique edges; optional no-Item/no-Booking admission; one Source many targets. Shared cancellation/hide/replace never removes other targets or Ledger.
2. Exact-source matching and CP13A proof/codeshare/ancestry protections; sparse same ID and date under CAS; any protected field conflict preserves accepted/manual intent.
3. Actor-sensitive collection/direct read/RLS/service-role gateway/open-original all deny unauthorized SELF/private Source. Each independent object grant checked; no hidden association count/ID.
4. Temporal tuple precision/resolution and local date preserved; date-only/missing omitted; P3 occupancy/bases and P4/P5 independent cards derive from original Item, no extra Events.
5. Durable exact receipt replay/source-slot claim/account fence/partial finalization and full read install; interrupted transaction old accepted generation remains.
6. Device bytes/hash/version/access verify before readiness; dynamic ticket never advertised offline original; Source loss does not erase historic accepted facts.

W0's checks below cover static documents and synthetic graph invariants only. They do not prove implemented SQL/RLS/admission/native behavior; implementation packages must turn all twenty targets into actual focused tests and native evidence. Prior G0 exact-source14 suites/610 PASS is historical unchanged-baseline evidence, not a test of W0's proposed v2.

## Evidence and validation record

- Final canonical HEAD reverified `741579c8bac3f898669ca331875a28efc645cfa2` on2026-10-11. G0/G1 baseline remains5076174; concurrent ac46a90/741579c changes were read and reconciled, no later source commit overwritten. Chat checkout's earlier dirty work preserved.
- Owner request SHA256 `744cdb90460d83d16197a02c7ce9591441e2cb2ee1c536950408ef0e5b99829a`; all eight G0/G1 inputs retained unchanged. G0 source hashes/lineage remain audit authority.
- W0 static validation: exactly nine outputs; CSV unique entity/field and typed physical owner; all generated table column sets unique; all relative contract links resolve; referenced material source paths exist at verified HEAD; no duplicate schedule column authority; finite command/version/Capture/read gates cross-consistent. Final measured result: **9 outputs /463 unique field rows /11 resolved relative links /13 verified material source paths /9 synthetic graph fixtures /20 acceptance targets — PASS**. The private assert checker also validated synthetic ACL/protection/date-range oracles; these are specification checks, not product implementation tests.
- Synthetic graph assertions A01–A09 verify endpoint existence, unique N:M edges, required graph counts and zero-Item Pass/no-Booking Source; temporal/protection/ACL/lifecycle/recovery specifications A10–A20 checked for presence and consistent required outcomes, not claimed as executed product tests.
- Markdown formatting and whitespace checks required before delivery. No runtime tests rerun for documentation-only changes. No SQL executed, database queried/written, private original imported, provider/native activated or Git commit/merge/push/deploy performed.

**STOP: Owner Contract Review.** If accepted, authorize the package scope rather than reopening field ownership. If code implementation later proves a real contradiction, cite exact evidence and stop only the affected gate; preserve unrelated progress and final D1–D4 directions.

Final HEAD adds the concrete sibling-preparation dependency; W0 freezes purpose certificate2 rather than relaxing v1 UNKNOWN claims. No unresolved Owner decision; implementation must prove this gate. New source baseline is741579c, audit baseline5076174 remains historical.
