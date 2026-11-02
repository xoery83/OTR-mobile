# Auth client integration gaps — 3 November 2026

Only actual differences from accepted paths; local/synthetic evidence is not Hosted PASS.

| Slice                    | Existing baseline                                                                                                              | Missing difference / owning writer                                                                                                                                 | Minimum cloud acceptance                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-C03 Profile         | Native local Profile/AKA save/cancel/cold/account isolation; private Profile HTTP/Supabase adapter; reviewed AKA SQL candidate | Root exact SQL install Gate + shared route; Auth strict-client AKA binding. Candidate install c84671f4 is not authorized by prior Gates.                           | Normal A self write/read/receipt, B denial, CAS/UNKNOWN, Native same-account cold read                                              |
| People roster            | Ordinary Account Add Traveler real cloud/main acceptance; Adopted Trip Person backend + Native reader evidence                 | Native actual adopted Add authoring/draft wiring; use existing tripPersonCloudCreate/roster repository                                                             | Same Person IDs, one receipt, native cold read and foreign-account denial                                                           |
| AUTH-C04 directed invite | executeMemberClaim, original receipt recovery, synthetic Confirm/Choose Another/Create New/Reject UX                           | Auth real serialized authority adapter; Root owning Person link/approval/Invite/receipt SQL and route; Native normal UX entry. New HTTP candidate stays unmounted. | A issue for explicit Person/exact B; B normal login and explicit Claim; independent link+receipt read; duplicate/lost-response safe |
| Formal member read       | Existing Core membership/Item visibility readers                                                                               | Root qualify existing journey_members.user_id/status/role semantics after atomic link; never use link response as read authority                                   | B shared Item accessible, private Item denied, C not admitted                                                                       |
| Post-Claim revoke        | Unclaimed invite revoke exists; Switch/Reset boundary documented                                                               | Auth/Core exact approved access-loss producer, preserved Person/history and cache-denial handoff. Invite revoke is not member removal.                             | Actual committed rights change, B reader denial, old response/receipt cannot restore access, Native cold isolation                  |

Golden Slice input: existing unlinked Person in A's synthetic Trip + B's independently
created normal DEV Account. Reuse existing OTP/Google; do not rerun their acceptance
suites or require Cloud Profile as a registration gate. No names/emails/AKA matching.
No new Repository/Sync engine, no Realtime dependency, no deployed permission change.

Evidence: people-add-traveler-20261031/REAL_GOLDEN_SLICE.json,
ADOPTED_PERSON_BACKEND_REAL_E2E.json and ADOPTED_PERSON_NATIVE_READER_REAL_E2E.json;
auth-directed-invite-20261102/INDEPENDENT_REVIEW.json;
auth-private-profile-aka-20261102/hosted-install-candidate/CANDIDATE_MANIFEST.json
(all under docs/ops). Current milestone evidence: docs/ops/auth-c04-20261103/.
