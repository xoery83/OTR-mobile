# Auth client integration gaps — 4 November 2026

Only actual differences from accepted paths; local/synthetic evidence is not Hosted PASS.

| Slice                    | Existing baseline                                                                                                              | Missing difference / owning writer                                                                                                                                                                       | Minimum cloud acceptance                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-C03 Profile         | Native local Profile/AKA save/cancel/cold/account isolation; private Profile HTTP/Supabase adapter; reviewed AKA SQL candidate | Root exact SQL install Gate + shared route; Auth strict-client AKA binding. Candidate install c84671f4 is not authorized by prior Gates.                                                                 | Normal A self write/read/receipt, B denial, CAS/UNKNOWN, Native same-account cold read                                              |
| People roster            | Ordinary Account Add Traveler real cloud/main acceptance; Adopted Trip Person backend + Native reader evidence                 | Native actual adopted Add authoring/draft wiring; use existing tripPersonCloudCreate/roster repository                                                                                                   | Same Person IDs, one receipt, native cold read and foreign-account denial                                                           |
| AUTH-C04 directed invite | Formal PG/HTTP/Runtime installed; real A/B OTP, ISSUE/Claim, independent Receipt/Person link and confirmed idempotency PASS (d7ac98e1 / actual-1bf81) | Native normal Invite/Claim UI remains unintegrated; consumed QA window closed and own Sessions revoked | Retain existing Hosted PASS; normal Member Read, access loss and Native cold recovery remain separate |
| Formal member read | Existing Core projection/Account fences; Auth exact-GET shared90s probe5PASS/independent Review | Actual B linked membership denied by Owner-only sustained scope (Root2 c885bc35). Root1 read-only predicate/Reader candidate22bcaa1d, isolatedPG/final protected package pending; writes unchanged | A/B ordinary collection, exact B binding, qualified owner-private Item absent; no Claim retry or write-window reuse |
| Post-Claim revoke        | Unclaimed invite revoke exists; Switch/Reset boundary documented                                                               | Auth/Core exact approved access-loss producer, preserved Person/history and cache-denial handoff. Invite revoke is not member removal.                                                                   | Actual committed rights change, B reader denial, old response/receipt cannot restore access, Native cold isolation                  |

Golden Slice input: existing unlinked Person in A's synthetic Trip + B's independently
created normal DEV Account. Reuse existing OTP/Google; do not rerun their acceptance
suites or require Cloud Profile as a registration gate. No names/emails/AKA matching.
No new Repository/Sync engine, no Realtime dependency, no deployed permission change.

Evidence: people-add-traveler-20261031/REAL_GOLDEN_SLICE.json,
ADOPTED_PERSON_BACKEND_REAL_E2E.json and ADOPTED_PERSON_NATIVE_READER_REAL_E2E.json;
auth-directed-invite-20261102/INDEPENDENT_REVIEW.json;
auth-private-profile-aka-20261102/hosted-install-candidate/CANDIDATE_MANIFEST.json
(all under docs/ops). Current milestone evidence: docs/ops/auth-c04-20261103/.

## Native owning handoff — HEAD 5d202070

Native confirms no normal Invite/Claim UI or post-Claim callback exists yet.
`LocalTripWorkspace → TripMembersSheet` already owns roster/Add Traveler. After a
formal Claim, reuse `tripDownstreamCoordinator.refreshAccountTripReads()` for
Discovery and listed-Trip pulls, or `refreshTripFromCloud(tripId)` for the known
Trip. Both retain the existing CoreTransport/downstream accepted-snapshot path;
never install a fabricated local roster/Accepted result from the Claim response.
AccountGeneration/context/applyGate already fence Account changes. Existing cache
`denyExistingAcceptedScope`/`regrantExistingAcceptedScope` candidates have no normal
runtime caller; a real access-loss integration remains required, without converting
an Auth revision into Core accessRevision. Native currently owns conflicting
`LocalTripWorkspace.tsx` and its test under SYNC-C01. Auth will not edit these shared
files. No new device build or Realtime subscription is required for this handoff.

## C03 independent increment — 3 November 2026

- Private Profile original-operation recovery DTO/Repository/Backend adapter is
  locally qualified at5d292b63; no save replay, no accepted-draft overwrite and no
  current-name inference from receipt metadata. Hosted Profile remains unmounted.
- People connection display adapter is locally qualified (10new tests). Native
  delivered its accepted-cache Reader (c143/c9fb), consumed in
  auth-c03-20261103/NATIVE_READER_ACCEPTANCE.json. Normal shared page wiring
  remains separate; Auth does not claim whole People UI integration. No UUID/name matching,
  no other Account UUID exposed; missing/inactive/pending stays UNKNOWN.
- Native read port delivery is complete for the recorded contract. Actual
  Profile Cloud operation and normal Invite/Claim UI still need their owning
  integration; the limited Hosted Invite/Claim slice is now PASS.
  Trip Nickname write remains a distinct owning mutation/CAS gap; participation
  revision and Account Display Name cannot be substituted.
- C04 7734f3b0 local isolated PASS is preserved; approved Hosted install and later
  Claim read-state repair are installed. New Invite/Claim passed under consumed
  Gate2fad/window1bf81, independent readback and closure recorded in
  auth-c04-20261103/after-fix-fresh-invite-qa/actual-1bf81/. Member Read is blocked
  by the exact Core read qualification above; revoke and Native cold restore
  remain NOT_RUN. Further protected SQL requires its own fixed approval.
