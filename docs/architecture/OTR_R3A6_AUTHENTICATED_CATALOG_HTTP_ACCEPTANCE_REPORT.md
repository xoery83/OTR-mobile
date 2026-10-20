# R3-A6 dedicated DEV authenticated Catalog HTTP acceptance

Date: 2026-10-11 (Pacific/Auckland). Source inspected and focused tests executed
at canonical `8b5c6034d5070d61192842282816dc08d44fc10a`.

**PASS.** Owner authorized one isolated DEV test identity and disposable Trip.
No historical A1 credentials, Simulator/Device accounts or Production were used.

## Fixture and admission

- Name: `R3-A6 disposable Catalog HTTP acceptance`.
- Actor: `3a44420f-ec2b-4d7e-9770-410a5ed5e77e`.
- Trip: `3b109c56-7a56-4af5-8364-12e081133e7d`.
- Existing DEV Auth admin provisioning returned200. A freshly generated strong
  credential was retained only in root-private DEV test custody. Normal Supabase
  `/auth/v1/token?grant_type=password` returned200 and the exact created user ID.
- Self-Profile and Trip were created through ordinary authenticated PostgREST,
  each201. No direct protected membership insert or RLS bypass occurred.
- Live accepted creator-trigger SHA256 matched
  `73de5cd814b1b1feafc4bf08418a3c402708c80fd87e38119b64f7d1104ada1c`;
  authenticated insert grants and the installed trigger were verified before
  provisioning. The ordinary Trip path produced linked owner admission without
  changing any CLOSED gate.
- Exactly six task-linked initialization rows were observed: one Profile, Trip,
  journey owner membership, legacy Trip owner membership, Ledger settings row
  (NZD/scale2/REFERENCE_RATE), and Trip collection-state row. The latter two
  membership/collection initialization paths are existing accepted triggers.

## Actual HTTPS acceptance

| Check                                                           | Result                                           |
| --------------------------------------------------------------- | ------------------------------------------------ |
| Dedicated Actor / own Trip Catalog                              | 200 PASS                                         |
| Canonical source schema, exact Actor/Trip, exact canonical JSON | PASS                                             |
| Wire body / roster limits                                       | 510 bytes;13 empty rosters; within4MiB/64 bounds |
| Dedicated Actor / existing A1 Trip                              | 403 `TRIP_READ_FORBIDDEN`                        |
| Dedicated Actor / nonexistent Trip                              | 403 `TRIP_READ_FORBIDDEN`                        |
| Unauthenticated Catalog                                         | 401                                              |
| Malformed Trip                                                  | 400                                              |
| Cache headers                                                   | private,no-store;Vary Authorization              |
| Reader idle retirement                                          | zero sessions                                    |

All53 scoped public business-table row digests were identical immediately before
and after the HTTP checks. This no-write comparison covers the HTTP acceptance
window after fixture admission; it does not represent fixture creation as a
no-write operation. Original A1 and other identities were never reset or targeted.
Unrelated Auth user/session digests were unchanged across the HTTP/cleanup window.

The own-session logout returned204; actual `auth.sessions` count for the dedicated
Actor became0. Access/refresh tokens were removed from its private fixture record.
No unrelated user, Trip or session was deleted. Identity/Trip and the private
password remain explicitly task-owned and reusable; there is no active test session.

## Preservation, evidence and validation

Accepted Backend container/image, Host mode, read-only root filesystem/private
Reader mount, exact configured environment/API-key selection, Reader password
artifact/journal, and Caddy PID/config were preserved. Reader remains
ACTIVE/APPLIED, LOGIN/SCRAM/limit1, expiry2027-01-09T02:03:36.084144Z.
Credential-absence comparisons passed for task output, sampled Backend logs and
Docker configuration. Passwords/tokens never entered argv, Git or public config.
No deployment, restart, schema/RLS change, provider call or operational
business-command activation occurred.

Focused exact-source suites: DEV Auth, session access-token provider, Catalog
transport and Backend Catalog read: **4 files /100 tests PASS**. Controller syntax
and runtime assertions passed. No new test framework/dependency or product source
change was required; no commit/push/merge was performed.

An initial controller attempt stopped before writes on a missing Python import.
The provisioning attempt then stopped on an overly narrow expected-write check:
ordinary Trip creation also initializes legacy membership and collection state.
Read-only diagnosis confirmed the existing initialization paths; the same single
fixture/session was reused to complete HTTP acceptance. No duplicate identity or
Trip was created, and no permission/gate was weakened.

Root-private DEV custody/evidence:
`/opt/otr/dev-backend/env/r3a6-catalog-20261011-de9c8caed0eb43148dd5a31e57b33c8d`.
`fixture.json` is private0600 and must never be printed or uploaded;
`http-baseline.json` and `http-result.json` retain bounded task evidence. Local
public controller/validator and exact-source test snapshot are under
`/private/tmp/otr-r3a6-*`. No private HTTP payload is included in this report.

## Native/SQLite53 next action

Native/SQLite53 activation remains **CLOSED**. The smallest next integration is
one explicitly invoked Account/Trip-fenced read: existing Native Receiver →
`createTripPublicationCatalogTransport` → CLOSED membership reader → existing
transactional SQLite53 repository install. Reuse the current token provider,
semantic validation and Account apply gate; add no scheduler/provider/business
activation. Then verify actual isolated Expo SQLite52→53 preservation, restart,
offline reuse and Account A→B→A rejection of stale work.

Not checked: populated live Catalog rosters, native runtime/upgrade, complete
Supabase service-log/retention audit or full regression. Empty live rosters certify
authenticated transport/schema/authorization, not populated semantic installation.

**STOP — R3-A6 DEDICATED DEV TEST IDENTITY ACCEPTANCE COMPLETE.**
