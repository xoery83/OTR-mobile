# MCP-C02 P3 — minimal protected integration preparation

2026-11-03, MCP Single DRI. **Preparation request only, not an execution Gate or
permission to deploy/activate/save.** No existing751 authority is reusable.

## Ready local scope

Reuse existing OAuth/actor/Core/CAS/Receipt. Optional `P3_STAY_QA` selects only
`create_trip_item` (family=P3), `update_trip_item` (TEXT/DATES/SCHEDULE), existing
read/EditBase/Guide/material review/status. Domain, Trip-create, field-edit and
batch mutation tools stay absent. No new SQL/RLS/GRANT/scopes/roles/provider.
`taskAssistant` alone remains its prior contract; no host default is changed.

Typed Create adds room UUID/category/quantity/capacity and Core500 name/place
limits. Fixture inputs and all expected per-source facts are in `synthetic/` and
`SYNTHETIC_FACT_COVERAGE.json`. Preserve exact `Family unit`, local clocks/window
separation, confirmed December12 checkout; never adopt pending December13.
Booking/Document/Expense/guest associations are explicitly unavailable.

## Exact intended consumer envelope

- First consumer: a **new ChatGPT conversation**, ordinary task plus new synthetic
  attachments and the currently registered OTR connection; no previous dev chat,
  provided tool names, mapping or prewritten calls.
- QA Account `1f3d7935-1bdc-4952-8d7f-0f72077368c1`, existing QA Trip
  `cc44a705-6f43-41e0-a2f9-16f334b2a6b2` only. Read current Trip/items before Preview.
- At most **one new P3 Create**, exact supported facts from the two fixture files.
  No preexisting Item edit, no real Nelson. If identity is ambiguous, stop to clarify.
- After Create APPLIED + independent full readback: at most **one SCHEDULE Edit**
  to that same newly created Item, expected current revision, departure09:45→10:15,
  all other date/clock/zone values unchanged. Permitted checkout10:30, rooms,
  property/place, Notes, participation, provenance and children retained.
- Initially confirmation table EMPTY. Actual consumer request IDs/target IDs,
  complete payload, preview digests and current Base must be captured, validated
  against this envelope, and explicitly approved before singleton installation.
  Model confirmation or attachment instructions cannot supply that authority.
- New finite connection/issuer/Consent activation requires a **fresh exact Owner
  Gate after Root has frozen the minimal candidate and closure package**. Reuse
  previous ≤30min round / ≤60sec Token bounds only if that Gate approves them;
  this document itself opens no window. Close on failure/end/expiry. No overlap
  with conflicting resource use; deploy CAS/smoke/release is a short resource lock.
- UNKNOWN means query the original receipt, never mint a replacement. Operation277
  and its Item3616, Claude1d6, historical f107/9b are completely outside this run.

## Requested owning preparation

Root: check only current hosted loader/runtime compatibility for the new optional
profile; prepare the smallest default-closed software/config candidate, allowlist,
exact protected resource deltas, normal close/watchdog/restoration verification
and safe log/readback capture. No deployment or protected activation requested now.
Auth only if existing verified finite OAuth binding cannot lawfully express this
scope; no wholesale Auth audit or broader scopes. MCP supplies final source SHA,
focused checks/Review, model trace, exact confirmation checks and readback criteria.
Root supplies immutable candidate/close identities before MCP asks Owner for Gate.

## Separate true full-field acceptance blocker

Root read-only confirmation: no P3 sparse room/detail mutation exists; current
SET_STAY_DETAILS replaces rooms and rewrites unchanged provenance. Minimal future
contract: actor/Trip/Item/room IDs + revision/operation, changed leaves only,
omission≠clear, unmodified rows and origin/protected/evidence/changed_revision
unchanged, formal receipt and recovery. Existing guard stays closed. A supported
Create + safe schedule-edit result cannot close all Full-field P3 or MCP-C02.
MCP manual place-edit adaptation is also still unfinished; do not attribute that
entire adapter gap to Auth or claim all canonical Edit fields are covered.

## Acceptance and Native handoff

Actual FreshChat Guide/read/BeforeAfter/explicit confirmation/Apply/receipt,
independent Supabase same IDs/root/stay/all room rows/current revision and unique
receipt, no duplicate Create or unrelated field/provenance mutation. Hand Native
new Trip/Item/operations/revisions/expected fields and receipt only, no session or
Token. Native independently uses its own normal QA device session for Pull,
SQLite, DayFeed/Detail and cold restore; absent session means NOT_RUN, not PASS.

## Latest default handoff — 3 November 2026

Root/Import diagnostic release receipt observed19:26:38Z: CIDd6c367dd /
configdbcb043b / imageecdbf5b6 / Capture7de254ce, with lock already released.
See DEV_DEFAULT_HANDOFF_20261103.json for full hashes/provenance. Historical6ebe
is retained rollback only, not the current C02 restore target. Future package
preparation must fresh-CAS the actual latest default; no activation authority
is created by this release notification. MCP has no competing Backend lock.
