# MCP-C02 — P4 Rental independent local coverage

Existing Package MCP-C02 remains IN_PROGRESS. This is a details-only local
verification increment, not a new Hosted slice or P4 full-field Consumer PASS.
No dependency on S1 protected deployment or S2 room interface.

| Field group | Existing MCP/Core path | Evidence/remaining scope |
| --- | --- | --- |
| supplier | rental Create / RENTAL details | Local standard SDK Create/Edit/Receipt/Readback PASS; omitted source Supplier preservation also covered |
| reserved_category | same | Local SDK Create/Edit/Receipt/Readback PASS; literal only, no class inference |
| or_similar | same | Local SDK Create/Edit PASS, including explicit true→false; omission remains distinct |
| actual_vehicle_model | same | Local SDK Create/Edit PASS; separately confirmed explicit null clears only this value |
| verified_plate | same | Local SDK Create/Edit/Receipt/Readback PASS, plus prior source-preservation slice |
| start/end dates and civil clocks | existing schedule path | Existing qualified-time safeguards remain; no new temporal qualification |
| pickup/return text and structured Place | RENTAL_PLACE / existing SET_RENTAL_DETAILS | Local manual authored-field edit/SDK/Receipt/Recovery PASS; matched/source selected places remain blocked |
| accepted/provider Place identity/coordinates | owning Place capability | No Provider or matcher implementation in MCP |
| Booking/Source/Expense/people | respective owning contracts | Not Rental field storage or authorization |

Core SET_RENTAL_DETAILS uses partial details and only mutates explicitly present
pickup/return members. This differs from S2's full-room replacement: no new sparse
Core interface is needed to edit one Rental detail while omitting others. Native
whole-detail submissions do not prove sparse MCP provenance; this narrow test
checks the actual MCP partial command and unchanged field_state directly.

MCP's existing goldenReadback verifier previously rejected SET_RENTAL_DETAILS as
an unsupported expected command. The new narrow branch keeps formal receipt hash,
intent hash, Actor/Trip/target/revision checks, requires places={}, and validates
the current Rental child event_id/trip_id and explicit changed fields. Missing or
wrong-identity child rows and wrong values reject. Historical receipt results remain
HISTORICAL_RECEIPT_VERIFIED_CURRENT_ADVANCED and do not prove old child values in a
new current revision. Endpoint readback stays unsupported rather than guessed.

Evidence: mutation.test.ts "P4 details-only edit". Synthetic local real Core:
Create complete five-field Rental → mark existing omitted Supplier as SOURCE in
fixture → explicit verified_plate update → simulated lost response → original-ID
APPLIED recovery → formal readback. Exactly2 POST including setup. All omitted
Rental facts, field_state and pickup/return rows preserved. Wrong plate/Item/Trip
or missing Rental row fail. Source state is synthetic fixture data, not a new
Source Admission path. Local test1 PASS, Typecheck/scoped lint and focused Review
recorded separately; no real QA actor/session or Supabase query was used.

## Independent SDK follow-through

The actual local Streamable HTTP Handler and official MCP Client now execute
`P4 standard SDK creates all supported rental facts and sparsely edits each detail
with original receipt recovery` in mutation.test.ts. Custom fetch stays in process:
no network, OAuth, real QA Session, Supabase or Provider is used.

The client discovers the existing tool schemas and five rental Guide paths, then
previews a Create containing all five details, both pickup/return text+addresses,
civil dates/clocks/zones and Notes. Apply without trusted confirmation is refused;
confirmed Create returns formal APPLIED and passes the independent readback
verifier against local Core rows/Receipt. This is protocol verification, not a
blank-context model understanding or real consumer test.

Five single-field edits and an explicit model clear each read a fresh EditBase,
Preview, refuse unconfirmed Apply, simulate a lost response, and recover APPLIED
using the original operation identity. One Item reaches revision7 with exactly7
canonical POSTs total: Create plus six edits, with no retry POST. Every step checks
the complete remaining detail row, both pickup/return rows, unchanged root facts
and omitted field_state entries. Each formal readback rejects a deliberately
wrong value for the changed field. False is saved as false; explicit null clears
the known model and is not substituted for an omitted unknown value.

No production adapter or Core implementation change was needed. The retained
details-only test additionally covers omitted synthetic SOURCE provenance.
Scoped results: two P4 tests PASS, MCP Typecheck/scoped ESLint/Diff Check PASS.

Acceptance: LOCAL_STANDARD_SDK_RENTAL_SCALARS_CREATE_SPARSE_EDIT_RECOVERY_READBACK_PASS.
Hosted, Consumer, independent Supabase and Native remain NOT_RUN.
This does not qualify P4 endpoint Edit or all-field consumer CRUD.
Next: manual pickup/return full-Base
adapter while keeping matched/source preservation closed. Reuse existing Core;
do not route Rental places through root Item SET_ITEM_PLACE.

## Manual pickup/return adapter follow-through

`RENTAL_PLACE` now selects PICKUP or RETURN through the existing field-update
schema. It uses the unchanged full EditBase, exact Item revision and the same
nine authored Place fields as STRUCTURED_PLACE. Only explicitly present patch
members change; null clears and omission retains. Selected place and Rental
Details rows must already exist with correct Trip/Item identity; duplicate or
unknown roles reject. Accepted/provider facts, source/evidence provenance and
missing state for a non-null selected value reject. The opposite role may have
source provenance because it is omitted entirely from the Core payload.

Reuse is SET_RENTAL_DETAILS with details={} and exactly one full selected Place
member. Core reasserts that selected place group's MANUAL/protected tracking;
Preview discloses this. No Core/Provider contract, permissions or Hosted profile
changes. Execution re-reads the full Base, verifies its digest and re-maps the
original patch before POST; existing original-ID receipt recovery runs first.

Local tests cover both roles, clear/retain semantics, hidden-field concurrent
drift, payload tampering, foreign/duplicate/missing children, matched/source/
missing-provenance rejection, omitted opposite source role and all unrelated
facts/state preservation. Formal readback now checks exactly one selected role,
Trip/Item identity and every payload Place value, rejecting tampered proof.
An actual standard SDK/Handler test discovers RENTAL_PLACE and its Guide, refuses
unconfirmed Apply, then edits both endpoints with lost-response/original-ID
recovery: one Item revision1→3, exactly3 POSTs including Create. This is local
protocol/real Core evidence, not a blank-context model or consumer OAuth test.

Acceptance: LOCAL_MANUAL_RENTAL_ENDPOINT_EDIT_RECOVERY_READBACK_PASS.
Hosted / Consumer / Supabase / Native: NOT_RUN. S1's frozen P3-only runtime is
unchanged. Entire MCP-C02 remains IN_PROGRESS.

Final review found and fixed an independent readback ambiguity: omitted role and
explicit whole-role null are now distinct. This slice rejects whole-role null
readback as UNSUPPORTED rather than claiming verification without checking Place
values. Each role's focused regression uses an actual Core clear/APPLIED Receipt
and proves that refusal. Provider-negative cases use valid UUIDs so they exercise
the preservation guard rather than string validation.

Validation: affected two-file regression62 PASS plus3 existing HTTP tests initially
blocked by sandbox loopback listen EPERM; those3 passed with local-listen permission.
After the review fix both changed role tests passed again. MCP Typecheck, scoped
ESLint, build and diff check PASS. Final independent review: ENDPOINT_REVIEW.json.
