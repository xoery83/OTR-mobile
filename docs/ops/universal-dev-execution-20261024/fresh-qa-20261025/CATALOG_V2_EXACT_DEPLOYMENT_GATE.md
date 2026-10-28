# Exact closed Catalog V2 Backend deployment

Status: BLOCKED_BY_AUTOMATIC_APPROVAL_REVIEW. The rejected command was not executed; no service replacement, SQL, role activation or paid call occurred. Owner had preauthorized database/DEV windows/budget and the new QA group. Automatic review requires explicit coverage of this newly built Backend image; this packet does not substitute local approval for that decision.

## Fixed reviewed candidate

- Code: `04a3197dcf0a86771858f24399ef00fe05d0620e`.
- New image: `sha256:40e998c31815a77452dd52dbbd6d8789ea8a815a6d1afba068029e97e919bbaa`.
- Current/rollback image: `sha256:99966a4069268e8f0bc4c200d08b7ac8443e35aa4858fac03cec1869c46091e4`.
- Existing DEV only: `otr-dev-backend`, Supabase `tuqigdxrvrerfewsxqgm`.
- Delta: existing authenticated Source Catalog accepts explicit V2 snapshot, preserving retained PENDING Run. Same Actor/Trip/owning read-only PG principal; V1 unchanged. No new Schema/RLS/GRANT/Authority.
- Exact image has been locally built and loaded via trusted SSH, not started in DEV. No DEV rebuild or dependency installation.

## One requested action

Approve one closed image replacement using the existing reviewed deployment/watchdog/rollback tool, adapted only to the above image and bundle hashes. Retain all existing environment, four mounts, running user, HostConfig, sustained Trip/P1 and closed Universal gates. Impact is one brief DEV service restart; no Production or real-user data.

Recheck actual closed preimages; seal a fresh UTC window <=900 seconds immediately before execution with >=240 seconds restoration reserve. Operator Unified Coordinator; independent existing watcher owns restoration. Verify exact image/bundles, development/ok Health, unchanged environment/mounts/HostConfig and unauthenticated401 protections. Any critical failure restores99966; unknown restoration is RECONCILE_REQUIRED, no automatic retry. Keep both images and prior immutable receipts.

This authorizes only the image update. Continue the already authorized same QA Batch5bafa531 and <=3 Sources/1 Run/1 Task after installation, under its existing finite Source/Provider watchdog, shared total1 paid call/4096 output tokens/USD1, additional Operator reads<=16 preserving original ledger. No extra QA group, Source objects, Auth users, Schema or Canonical Admission. New Task has NOT been created, so no immutable policy is being renewed.

## Evidence

94 Backend/transport tests;35 Native facade tests; Swift Foundation V1/V2 policy and actual Expo Simulator SDK compile PASS; integrated TypeScript PASS. Independent Catalog, sealed Native and deployment-tool reviews PASS. AD5 installed preserving SQLite/WAL/read-ledger hashes and simulated application identifier; original Session/My Trips recovered. Native real V2 Catalog and AI Results remain unpassed until DEV deployment/remaining Source qualification.

Fixed bundle hashes are in IMAGE_MANIFEST.json; reviewed deployment operator adaptation, baseline and proposed plan archived alongside this Gate. Proposed times are not valid execution authority and must be freshly sealed after approval.
