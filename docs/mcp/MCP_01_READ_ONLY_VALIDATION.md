# MCP-01 Read-only Validation

Date2026-10-29; base main `ee246658`. **LOCAL_PASS; public activation and complete
MCP-01 PASS remain BLOCKED_BY_OWNING_INTERFACE.** Evidence below is scoped;
synthetic tests are never labelled real DEV or ChatGPT/Claude acceptance.

## Local protocol / contract evidence

- `npm --prefix mcp test`:2 suites/14 tests PASS. Official SDK2.4.0 Client performs
  actual loopback HTTP discovery and four tools through actual Backend HTTP
  boundaries, synthetic Auth/graph. Unknown/missing/foreign Item and Trip ACL,
  Account A/B, alternate client name, wrong resource/expiry/scope, no-auth, Origin,
  invalid dates/ranges/limits, UUID pagination, stale access generation, empty
  collections, timeout and no mutation path are covered.
- All six Item families produced by existing Core domain commands; sparse Flight,
  date-only values and P3/P4/P5 cross-date overlap retained; internal identity/
  field-state/participant fields stripped. Full read2 hashes/rosters/graph validated.
- `npm --prefix mcp run typecheck`, affected TypeScript ESLint, package build PASS.
  `npm run ui:guard` PASS:161 representative files,473 existing legacy occurrences.
- Direct owning regressions:4 suites/48 tests PASS — tripDiscovery,
  tripCoreV2Http, tripCoreV2PgRead, tripCoreV2Views. No new owning code change.
- Whole-repository typecheck reaches only two existing missing dependency errors:
  @react-native-google-signin/google-signin in googleSignIn.ts and
  GoogleSignInButton.tsx. The reused primary node_modules lacks that dependency;
  no shared install or unrelated source edit was performed. MCP scoped types pass.
- Independent review: NO_BLOCKER for closed foundation + explicit internal runner;
  package test-path and client cleanup issues corrected and independently rechecked.
  Reviewer independently reran14 tests + types and verified fixed tool/error logs.
  Reviewer did not access live credentials or qualify public OAuth/DEV/main.

## Real DEV evidence / limits

Public HTTPS `/health`:200 development. GET `/v2/trips` missing credential401
AUTH_REQUIRED; synthetic invalid bearer401 INVALID_SESSION, no Trip content.
No deployment, schema, RLS, GRANT, DB credential or service-role access.

Owner authorized normal dedicated QA A/B login. `mcp/dev-e2e.ts` reads only public
DEV configuration from existing environment, requests/verifies normal OTP through
the existing Auth helper, holds sessions in process memory and never installs a
Session or reads SecureStore/Keychain. It pins DEV origins and existing synthetic
Trip825f79b2-4a9d-4535-a62e-43000ca50c4a, performs standard Client calls and separate
Backend hash readback, and attempts only own-session scope=local revocation.
No refresh, copied old session, business mutation, permission change or fixture
creation. Initial A code rejected; new normal A login verified Account38e4c610-
4a53-4bd2-976e-42de679a8f9b, matching accepted Google identity. B independently
verified Account4ebd0cbd-6fbb-41fb-8322-7eca5a563cb4. Both standard SDK clients
connected to the internal Streamable HTTP server with their separate normally
verified sessions. A tools discovery PASS (four tools); list_trips PASS with
independent direct Backend list hash comparison. get_trip for the fixed Import
synthetic Trip returned NOT_VISIBLE; runner reported BLOCKED_BY_OWNING_INTERFACE /
FIXED_SYNTHETIC_TRIP_NOT_VISIBLE_TO_ACCOUNT_A. It deliberately stopped before
claiming Item/family consistency or B cross-Item negatives. No Item content was
returned. Both own fresh sessions subsequently revoked successfully via the
existing scope=local endpoint; process retains no session file. No expired/public
resource-token or OAuth/client-product PASS is inferred from these logins.

The fixed Import fixture belongs to QA Accountf4b059c5; A's normal Google Account
must not be assumed to own it. Missing visible fixture is an owning-data delta,
not permission to add membership, copy a Session or create six Items. Public
wrong-audience/revocation evidence remains absent until resource-bound tokens
exist. Current injected negatives prove handler behavior only.

## Integration Delta / closure

| Owner                     | Remaining condition                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Auth                      | Approved resource-bound OAuth verifier/issuer/PKCE/metadata/client grants/revocation; current port absent, handler closed        |
| Native / fixture owner    | An existing authorized Account-visible real P1–P6 synthetic Trip for this lane, without new membership/ACL changes               |
| MCP                       | Complete real A/B calls and independent readback/no-side-effects scope; keep public-client status honest                         |
| Serial main writer        | Rebase/recheck reviewed candidate against current main; integrate only in granted serial window, preserve all dirty primary work |
| Operations / client owner | Approved HTTPS mount, deployment window and actual ChatGPT/Claude client connections; no shared DEV deployment requested         |

Candidate source is on `codex/mcp-01-read-only`, initial commit18b6cbe6;
no main merge/push or public mount has occurred. Source size:684 lines for
contract/read/server/internal modules +44-line internal listener;254-line
assertion-based DEV runner,488 directed test lines (plus config/docs/lockfile).
No database migration or Mobile package change.

Current state handoff and this task are the tracker; no second management system.

Data Path Checklist: (1) owning Cloud-shared Trip/Core facts, transient responses;
(2) no local storage/migration/cache; (3) Backend discovery/read2/detail unchanged,
no queue or mutation DTO; (4) offline returns unavailable, cursor detects snapshot/
access drift and newer local intent is never touched; (5) L1 Native N/A, local
protocol/L2 evidence above, real DEV and public OAuth coverage explicitly bounded;
(6) remaining Auth/fixture/main/client integration delta above.
