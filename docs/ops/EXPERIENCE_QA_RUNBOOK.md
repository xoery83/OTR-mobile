# Experience QA — existing capability handoff

Owner standing authorization, 2026-10-15. Ordinary build/install/restart, existing
QA login, owned local fixtures and targeted Native smoke need no per-run approval.
Coordinator integrates main; Experience works only its approved correction packet.

## Device / build / Metro

- Worktree: `/private/tmp/otr-experience-correction-01`.
- Simulator: `AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A`, **OTR MT Correction 01 QA**.
- Bundle: `com.xoery.otrmobile`; scheme/workspace: `OTRMobile`.
- Always specify UDID. Never use `booted`, A1A, its source host, PID3554 or8081.
- Use current main plus the correction branch; retain dirty work. Shared Shell,
  Router and UI Foundation already merged at1f28453; do not overlay old whole UI
  files from historic QA unions. d5ff69b is a separate Experience follow-up.

Known working Release recipe (embedded JS; no Metro required):

```sh
cd /private/tmp/otr-experience-correction-01
xcodebuild -workspace ios/OTRMobile.xcworkspace -scheme OTRMobile -configuration Release -sdk iphonesimulator -destination id=AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A -derivedDataPath /private/tmp/otr-mt01-owner-preview/DerivedData CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- ONLY_ACTIVE_ARCH=YES ARCHS=arm64
xcrun simctl install AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A /private/tmp/otr-mt01-owner-preview/DerivedData/Build/Products/Release-iphonesimulator/OTRMobile.app
xcrun simctl launch AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A com.xoery.otrmobile
```

Cover-install same bundle; do not uninstall/erase. Ordinary terminate/launch is
allowed. For DEV-only clock testing use Debug, not Release. The installed Expo CLI
supports the following isolated recipe, now Native-verified on AD5. Reuse the
Experience-owned8082 Metro; if owned by another task, coordinate
that port only. Do not stop an unknown listener or fall back to8081.

```sh
cd /private/tmp/otr-experience-correction-01
EXPO_OFFLINE=1 node /Users/xoery/Project/otr-mobile/node_modules/expo/bin/cli start --dev-client --localhost --port 8082
# Another terminal, same worktree; skips dependency installation:
EXPO_OFFLINE=1 RCT_METRO_PORT=8082 node /Users/xoery/Project/otr-mobile/node_modules/expo/bin/cli run:ios --device AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A --configuration Debug --no-install --port 8082
```

Record actual source SHA, build and consumed JS. No full visual matrix before
Owner smoke feedback. Keep keyboard capture off except brief text entry.

## Existing identity / Reference / public configuration

Preserve the Simulator's normal Session; normal App refresh uses it. Expected QA
actor: `3a44420f-ec2b-4d7e-9770-410a5ed5e77e`. If normal login is required, use the
existing App login and approved account; Owner enters private credentials there.
No password export, account creation, SecureStore edits or Session/Token copying.
There is no delivered unattended credential-recovery mechanism.

Expo57 DEV virtual/env needs actual worktree public configuration, not merely
Metro process env. Restore only the two existing public Auth entries from the
approved local configuration source `/Users/xoery/Project/otr-mobile/.env.local`:
`EXPO_PUBLIC_OTR_DEV_SUPABASE_URL` and
`EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY`. Preserve an existing worktree env
file; never copy the full source file or print values. URL must be the existing
`https://tuqigdxrvrerfewsxqgm.supabase.co`; key must be the existing publishable/anon
key, never a service/secret key. Do not enable or change Sync/API mode for UI QA.
Record only presence/hash/target booleans. Do not copy C2 metadata or configuration.

Normal path: **My Trips → 冬日日本·东京与关西十二日 → Home → Day → Focus → Immersive**.
Stable V2 Trip: `b61b0000-0061-4000-8000-000000000001`, 2027-02-01…12,64 Items
(P1/P2/P3/P4/P5/P6=30/4 sparse/5/5/10/10). Old b61a/16-item data is historical.
Use existing Trip/Day repositories and actual current authorization. Check actual
projection revision separately from Item count;64 Items does not mean revision64.

## Future / Today / Past: existing code, current seam gap

Existing Reference-only helper:
`/private/tmp/otr-beta-owner-ui70-caf-union-source61/candidate/src/features/day-feed/referenceQaViewClock.ts`.
It binds only the above actor/Trip, current normal read, account generation, epoch,
access revision and exact revision70/manifest225f. It rejects other Trips, revoked,
historical, stale or Production reads. Original64 helper/presets are under
`/private/tmp/otr-beta-reference-v2-view-clock-61-r2/`; never mix64 and70 pins.

| Scenario | QA instant (UTC) | Trip-local date / zone |
|---|---|---|
| Future | 2027-01-20T03:00:00Z | 2027-01-20 / Asia/Tokyo |
| Active / Today | 2027-02-06T03:00:00Z | 2027-02-06 / Asia/Tokyo |
| Past | 2027-02-20T03:00:00Z | 2027-02-20 / Asia/Tokyo |

**Not a main/Release switch.** AD5 temporary Debug overlay now verifies MyTrips/
Home Active against the exact70 profile (see evidence below). Remaining UI seam:
reuse this helper after a successful normal Reference read; pass its qualified
clock into My Trips/Home presentation and Day's explicit query/initial view.
Adapt only the old caller hunks in MyTripsList/TripScreen/LocalTripWorkspace to
current UI; do not replace whole files. Experience owns those UI callers and may
prepare this bounded DEV-only adaptation in its isolated packet, with independent
review and directed smoke. Coordinator owns any actual reader-contract change;
no Backend/schema design or per-run Gate is needed. If current data does not match
a qualified profile, report the exact mismatch; do not weaken pins.

No system Date/global clock/lifecycle-rule edits. No R3-A6 real-date edit to force
Active. Auth TTL, writes and Sync retain real time. No fabricated trustworthy
TodayWidget/OpenToday producer; a Reference clock is not Hosted/real-user PASS.

## Initialization / recovery / cleanup

Normal restart preserves current data; use it first. Existing V2 normal-repository
importer/artifact are in `/private/tmp/otr-beta-reference-v2-device-apply-61/overlay/`;
its contract is `/private/tmp/otr-beta-reference-v2-device-apply-61/contract.json`.
The strict70 follow-up provenance is in the qualified owner-ui70 union manifests.
These are existing version-pinned preparation artifacts, **not a ready general
Experience reset CLI**. Do not run historical A1A commands against AD5 or claim the
artifact alone installed data. One-time remaining owning seam is to expose the
matching existing normal-repository importer/follow-up to the Experience DEV build,
with its same authorization/identity guards and a precise owned-data reset recipe.
Source/Coordinator owns that adapter; no new data model/platform is requested.

Until that seam exists, preserve current AD5 data. No direct SQLite writes,
DB/WAL/container copies, broad reset or deletion. Existing read-only visual fixture
manifest: `/private/tmp/otr-vqa-mt-cap-pre-01/fixture-overlay/manifest.json`; renderer
fixtures remain explicitly synthetic and do not substitute for Reference data.
Track only each packet's own temporary overlays/files and restore exact preimages;
do not remove historical evidence or unknown resources. Never touch C2 Batch
`e046f37a-61ac-444a-b05b-0a991d59e006` or Coordinator A1A data.

## Current limits / evidence

Release build/normal Reference navigation: prior targeted Native PASS, not a new
run. Debug8082 + temporary DEV-only clock overlay: Active MyTrips/Home Native PASS
on AD5, exact revision70.0/access1/manifest225f and64 Items; real dates unchanged.
Receipt: `/private/tmp/otr-experience-active-preflight-20261015/final-receipt.json`.
Temporary overlay remains only in Experience worktree for liveMetro; do not commit
whole worktree or restore it before Owner preview. Day query/AcceptedToday producer
not adapted; reusable owned-data setup/reset seam remains NOT READY.
P2 remains sparse; Accepted Day/TodayWidget, Documents originals and other owning
Runtime gaps must remain separate. Capture native host/text/Clipboard/Camera and
conditional Active Imports also retain their existing PARTIAL status.
