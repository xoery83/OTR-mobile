# Capture Flight-first implementation

Date: 2026-10-11 (Pacific/Auckland). Owner-authorized continuous development.
Base: canonical main `5076174470d58993c5fe5b17edbb0d4bd0ae5b62`.

## Delivered boundary

- **A / D:** `assessFlightAdmission` projects the existing FlightCandidateSet through
  the accepted CP13B/CP13A owning assessor. It snapshots caller choices/settings,
  preserves exact Candidate/evidence/lineage and target revision observations,
  validates the returned assessment binding and fences Account generation before
  and after asynchronous work. It allocates no identity and executes no preparation
  or command. READY reports `REVIEW_REQUIRED`, never automatic consent.
- **B:** seven reusable synthetic relationship vectors cover Air NZ return,
  DOC three Stays/supplemental Booking, Thrifty separate Rentals/ambiguous reference,
  SNCF shared Ticket/two Segments, water taxi return, group credential/standalone
  permit and unrelated Document/Ticket attachment. Tokens are proposal-local;
  these are contract vectors, not implemented P3–P6 extraction or persistence.
- **C:** `projectFlightEvidenceCoverage` retains exact private input material,
  pins/revisions, deferred Booking/Ticket/Passenger/Seat/Baggage evidence and ignored
  structured text. It checks digests/bytes, unique complete inputs, bounds, UTF-8
  locators and Account generation. An attachment mention never creates an Input.
  PAGE/REGION evidence remains a locator, without fabricated textual content.
- **E:** actual isolated SQLite repositories install admitted synthetic Source/Run/
  Candidate catalogs, assess two return-flight Candidates with duplicate-source
  consolidation, prepare one reviewed Flight, replay it and recover the identical
  intent after file restart. Sparse Flight and contradictions retain evidence with
  no preparation. Reviewed title edits preserve the original extracted proposal.
  Canonical Event count stays zero throughout these new vertical tests.

## Material Core dependency discovered

After the first Segment's preparation, the existing Run-wide UNKNOWN claim fence
blocks preparation of its sibling with `CLOSURE_REVIEW_REQUIRED`; replay/restart
retain that fence and one queued preparation. Two READY assessments are a snapshot,
not permission to bypass current owning claims. No claim filtering, DISTINCT_OUTPUT
lineage, writer or proof rules were changed. Core must supply an accepted way to
represent independently distinct sibling output purposes before both Segments can
be prepared while the first outcome remains unresolved.

Owner has accepted G0/G1 progression. The available G1 files still label detailed
D1–D4/interface proposals as proposed, and no newer approved executable Core
Capture/mutation interface was located on inspected main. Integration therefore
uses the already accepted closed CP13 assessor/preparer only. Automatic policy,
sparse canonical save, participation/object access, field-level background edit
protection and time/place authority remain Core-owned. The adapter explicitly
reports `automaticAdmission=NOT_AUTHORIZED` and `userEditProtection=CORE_REQUIRED`;
it does not claim those missing policies are implemented.

## Validation and integration

- Focused nine suites: **313 tests PASS**. Includes CP13 interpretation, owning
  admission/closure, durable preparation/recovery, Account and sync-denial
  regressions, dormant composer, new projection/coverage and relationship vectors.
- Typecheck, touched ESLint/Prettier, UI guard and whitespace checks PASS.
- All tests use synthetic material and isolated local fixtures. No real supplier
  originals, provider, Hosted DEV/Production, Mobile business runtime or gate
  activation. SQLite1–53/server84, configuration and dependencies are unchanged.
- Flight adapter/evidence/vertical tests: commit `ac46a90`. Relationship vectors
  and this note form the next coherent unit. The isolated branch is
  `codex/capture-flight-assessment`; final integration refs are recorded in the
  completion message rather than a self-referential report hash.

Next: Core supplies the accepted sibling-output preparation contract and any
new owning Capture DTO. Connect that interface and extend the same return-flight
fixture to two independent preparations. Real canonical execution still requires
its accepted Source, command/recovery and runtime gates; no blanket activation is
implied by these tests.
