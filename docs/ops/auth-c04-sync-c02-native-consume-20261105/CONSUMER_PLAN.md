# AUTH-C04 → SYNC-C02 minimum Native consumption

Golden Slice: **B normal login/own cached restore → My Trips → discovered shared Trip → original Reader/Repository → 6 November shared P1 → same-B App restart/local readback**. No B write. A/B switching is a separately qualified follow-up, not the first slice's prerequisite.

No Auth code delta was found. Existing normal `/v2/trips` discovery includes linked `journey_members` and current `canReadTrip`; Native already has `refreshAccountTripReads()` and `refreshTripFromCloud()`. Original `refreshTripDiscovery`, account-scoped cache, validated Core collection and `CoreRepository.refresh/acceptedSnapshot` cover discovery, persistence and recovery. Reuse e315/32722/F02. No second discovery, Repository, queue or authority is needed.

This is source support, **not** fresh Hosted discovery or Native acceptance. The sealed Host run queried known-Trip collections, not normal My Trips discovery; a known UUID direct read cannot prove normal entry. The first actual Native run must record normal B discovery returning the Trip before selecting it. Discovery summaries are not data authorization or local creator records; never synthesize a B local Trip/Owner to make it appear.

The real shared Item/Account/Person reference is in `IDENTITY_REFERENCE.json`, derived from5fee/759 and parent0dd. It deliberately is **not a server DTO**: raw FULL receipt/collections were not retained. Never import the reported receipt ID/hash as a FULL receipt, insert synthetic accepted records, or hardcode revision1. Capture actual current manifest/Item revision and actor binding through the original Reader, then compare actual persisted data on cold read. Capture a fresh process AccountRequestContext; do not serialize/reuse runtime generation across restart.

## First concrete gap

`NATIVE_B_CONTEXT_AND_DEVICE_READ_QUALIFICATION`, request `AUTH-C04-NATIVE-B-READ-COLD-QUALIFICATION-20261105-01`.

Native's reported candidate0e7a39da / planned14750, bundle `com.xoery.otrmobile.visionemptycurrent`, is **Guest-only**, not B login/cloud qualification. Empty My Trips in old14674 does not prove SQLite/principal/assets empty. Preserve saved/live Guest P3 and its unsupported-Adoption blocker; an upgrade grants no reset. Do not clear Guest, skip handoff, copy Sessions or create another device.

Native must supply a lawful existing B context or an existing QA context proved empty using existing qualification, a fixed complete Native+JS build and owned device claim, plus current normal B read/login/restore scope. Valid own cached B must remain offline-accessible without forced network login. All Host Sessions and its10-minute authority are closed/consumed; no Token is available to borrow. Root2's current read qualification can be prepared independently, but its exact Native initial-context/build fields are still pending. Auth does not own those files or devices.

## Minimal assertions

1. Current approved principal/Guest assets and read-only scope are established before login. No old Pending/UNKNOWN, Source/Provider or unrelated mutation dispatch during the slice; preserve all existing IDs/queues.
2. B's normal My Trips discovery contains the exact Trip. F02 restoring/unknown must not display confirmed-empty; qualified cached trips remain visible on transient failure.
3. Normal selected-Trip Reader validates current B/Trip/binding/hash. Original Repository atomically persists the accepted certificate and account-partitioned graph; existing People reader identifies B's correct Person without matching names/email.
4. Day/Detail on6November shows the exact shared Item, ownerA, GROUP visibility, expected title/description/date/whole-group participation. Those semantics do not grant B edit rights. No B mutation is tested.
5. Same-B normal process restart retains Session and SQLite read through original Repository. No uninstall/reset/DB or Keychain copying. Offline cold read compares actual captured certificate/fields; later legal online revision advancement is allowed, never assumed `+1`.
6. Existing access-loss path is conditional only: real403/404 triggers B-self observation; only validated `ACCESS_REVOKED` invokes own scoped revoke. Generic404/503/network or unavailable formal port is not revocation/empty-sync proof. Full Member Revoke is not a positive-read prerequisite.
7. Close only this current Native scope as authorized, retaining Item/receipt/reservation and historical UNKNOWN. Both A and B legitimately read this Item: its presence after a later authorized switch is not a private leak, nor proof of proper cache scope. Check actual Account/Person/certificate and stale-generation rejection. Private isolation has no qualified fixture here and remains unproved.

No source/UI/shared file, test, credential, network, SQL, device or business action was performed for this plan. Native alone coordinates downstream/UI/Startup/SQLite files. No Auth patch is being requested. `NORMAL_READ_COLD_PLAN.json` is the machine-readable acceptance/qualification packet; parent coordinates the one remaining context/read qualification.

## Same-C0 independent QA package option

`CONTEXT_OPTION_CONTRACT.json` confirms conditional source compatibility of normal Email OTP on a genuinely isolated QA package. It does not certify same0e native binary re-signing. Native owns appidentifier/entitlements/default keychain groups/private sandbox/embedded Expo config + complete JS/API/runtime/URL registration and actual empty proof; a CFBundleIdentifier rename alone is insufficient.

Source0e Email uses direct OTP code verify, not Magic Link/OAuth callback/nonce. But source still offers Google with fixed original clients and no inspected Email-only disable gate; do not claim app-level Google disabled. The permitted QA sequence must make no Google action, and new package must not duplicate original Google/generic URL registrations. No new Google client or Secret is required/authorized.

Normal bootstrap can resume manual/Trip/Ledger mutation queues. A fresh bundle label is not a read-only guard: prove private namespace and actual empty/no-outbound eligibility through existing qualification, retain normal discovery, and bind current B-only scope. Old126/149 and Guest14750 remain unavailable as evidence of safe emptiness. No new flag, reset, copy or execution is authorized.
