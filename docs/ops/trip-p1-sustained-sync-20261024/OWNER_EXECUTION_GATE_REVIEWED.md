# One sustained Trip/P1 DEV vertical-slice authorization

**PENDING_OWNER_AUTHORIZATION — implementation candidate, not Cloud PASS.**

## Fixed deployment set

- Root code `1d0c979` integrates owning `2b5ed0c → 8e773ef → 9c093e4`, including the independently discovered Person JSON-null fix. Root-only later changes are tests/receipts/Gate documents, not the bundle.
- Existing DEV only: Supabase `tuqigdxrvrerfewsxqgm`, Backend `otr-dev-backend`, `https://api-dev.xoery.art`, AD5 `AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A`, original `com.xoery.otrmobile` identity/data.
- Candidate image `sha256:6b11b6ba350cdf0cf72a9776c4420f129cc51bcab1a74a82456994588738cc95`.
- Capture bundle SHA256 `a221ab978039fad46f7eb69914153692228c467ee2cd559280da1463b3ee02d9`; ordinary bundle `7c304662e9864e0e41488bcd0c510d5740f9eba1753f5368cf00b3ce45b93fff`.
- Rollback image `sha256:73d518d4aa573590a9fe43aa48b767b180d998d5cb6e341221ce2eed8e80ef30`, Capture bundle `95b9c8018b8bc516cf5fc27b5d6c857836d15ee3d44a4a3f092da8dc22ad3aec`. Fresh read-only baseline in receipts confirms current healthy image, unchanged environment/config hashes, three mounts and disabled external-provider switches.
- Candidate network-none Linux startup: development/ok, original uid10001/otr, six protected unauthenticated routes401. No actual DEV startup/Cloud claim.

## Exact additional authority requested

1. Install **only** the two SQL files and their listed ACL differences:
   - `20261024000200_trip_sustained_dev.sql` SHA256 `c9215ce88face89967cb5d3e32b6609498168cfb45112e7d53697442304f3009`.
   - `20261024000300_trip_person_cloud_create.sql`: exact SHA256 in `ARTIFACT_HASHES.json` (null-safe `9c093e4` version; never use the superseded8e SQL).
   The first adds private RLS Account rollout policy, identity guard and sustained scope/capability helpers, with disjoint branches in seven existing owning functions. The second adds private immutable Person-create receipts, command/result and guard; existing participation receipts cannot represent CREATE_PERSON. Only the reserved Person gateway gains narrow EXECUTE; no direct canonical table write, broad RLS policy, new login role, Invite/Claim or Source authority.
2. Activate the **four existing** dedicated Create / Metadata / Core / Person gateways for this DEV service: LOGIN, connection limit1, verified-primary TLS and service-managed credentials, permanent validity. Preserve memberships and nonsuperuser/noninherit/noncreatedb/noncreaterole/nonbypass/nonreplication flags. Core/Person current limit-1 changes explicitly to1. No service-role credential is used for business mutations.
3. Use the existing private `/run/otr/trip-create-runtime.json` as strict version3 `{version,enabled,tripPg,metadataPg,corePg,personPg}`, root-owned/gid999/mode0440. This is the only additional runtime mount; all original environment variables, three mounts, user, network, HostConfig restrictions and closed Provider/Source configurations remain unchanged. Transfer the fixed image through trusted SSH; no DEV rebuild.
4. Create at most two **new dedicated synthetic** Auth identities using the existing approved DEV Auth management path. Exact addresses: `otr.ad5.sustained.20261024.a@example.invalid` and `.b@example.invalid` (B full address `otr.ad5.sustained.20261024.b@example.invalid`). Before creation query exact existence and reconcile previous attempts; stop on UNKNOWN/foreign existing identity. At most two safe confirmed attempts per identity. Verify actual returned UUID then normal Auth login; never copy any historical/real session. Use existing legal profile initialization only if required, limited to these two identities. If its existing owning API/permission is unavailable, stop that dependency rather than inventing another authority.
5. Enable one revocable policy row for actual Synthetic A UUID, with immutable UTC adoption cutoff recorded immediately before new Native QA authoring. B remains unapproved for A's Trips and supplies Account-switch/cross-account negatives. **No fixed Trip/op list and no expiry** in this normal service policy; that is the necessary change from finite QA. The rollout remains limited to this synthetic Account, V2 self-created Trips after cutoff and current linked owner, with exact Creator-only P1 edits. Historical V1/name-only intents remain untouched.
6. Install/reload the reviewed Native JS candidate with SQLite73/74 additive migrations, preserving AD5 app/session/history. One-time existing Native scope config uses version2/current Synthetic A/cutoff, no Trip/op or dispatch expiry. Generic global queues remain quarantined. Use App Add Account and ordinary Form Save; no manual business dispatch.

## Execution, evidence and bounded QA

Coordinator is deployment/AD5 operator and rollback owner. Record actual UTC start/end for each service transition; reserve at least240 seconds of each maximum900-second deployment attempt for diagnostics/rollback. Independent watchdog closes/reverts an incomplete/unhealthy transition; successful acceptance hands service ownership to the revocable policy. **900 seconds is deployment safety, not a recurring business authorization window.** Normal service must continue after QA, otherwise continuous-sync acceptance fails.

Run only newly authored synthetic data, prefix `AD5 Sustained 20261024`: at most3 Trips,4 additional Persons,2 P1 Items; at most48 mutation attempts and192 application/business reads for initial acceptance. Count actual automatic calls, replay attempts and independent reads; stop rather than exceeding the limit. Ordinary safe retries/rebuilds within these reviewed boundaries are covered by this single authorization. UNKNOWN writes reconcile via exact owning result before any resend. No batch history upload.

Required matrix: Create Trip; Edit name/dates/full destinations add/remove/reorder; Pending Create→Edit; Add Traveler; Create P1; Edit P1 text/schedule/place/participation; offline/retry/idempotency/Account-switch. For every row keep actual Native action, SQLite/Queue state, immutable SERVER_ACCEPTED, independent Supabase owning readback, authenticated App re-read and cold restoration. Do not substitute previous finite QA or HTTP200. Native network-outage evidence must state whether actual connectivity was interrupted; cosmetic status-bar changes do not qualify.

## Closure and rollback

During setup/error, disable only the new policy, stop/remove only the new runtime mount and close the four gateway logins; verify zero sessions and all existing five finite/Source Gates CLOSED. Restore exact baseline image/config/three mounts and health. Retain new canonical data/immutable receipts/old Pending. SQL rollback is separately fixed, requires exact postimages and stopped principals, retains accepted data; never reset/delete or restore the wrong pre-c493 Source guard. An irreconcilable write/closure/rollback is RECONCILE_REQUIRED and stops execution.

On success, the **normal accepted Account policy and dedicated service stay active**, revocable by Coordinator/Owner; temporary admin material/watchdogs are retired, finite/Source/Provider gates stay CLOSED. Explicitly report this distinction instead of saying all gates closed while disabling future normal sync. Production, real users, Nelson, Invite/Claim/Profile features, Universal Provider activation and unrelated schema/ACL changes remain forbidden.

## Current evidence and remaining boundary

The exact actualDEV guard c493, three constraints, closed Gate/role baseline and Source helper were checked read-only. Independent review found the owning SQL null defect, now fixed; final Root integration review is being attached. L2/closed startup do not prove Native L1 or DEV L3. **Requested decision: authorize this fixed SQL/limited sustained DEV service/QA set as one complete vertical slice.** After approval execution resumes through real Native/Server/readback/recovery; no renewed coding assignment is needed.
