# Synthetic Auth recovery — proposed Gate, not authorization

Status: PREPARED_FOR_INDEPENDENT_REVIEW. No creation, login, profile write, role/gate activation, deployment or business write is authorized by this document. The 22:30–22:45 UTC C window is expired and must never be reused.

## Observed facts

The original 22:34:22 UTC A provisioning attempt remains UNKNOWN. Its script discarded HTTP status/error details. At 2026-10-22T22:42:57.513670Z, one authorized Management CLI query returned zero `auth.users` rows for the exact A email. This establishes ABSENT at that query time only, not the original request's outcome or failure cause. B was not queried. No Auth listing, credential probe, login, mutation or retry occurred during recovery.

Query: `EXACT_A_READONLY.sql`, SHA256 `5951ed2ba596c3afeb7d0aadc66ffac3ca3879988e50dea24a5f81385643e28e`. BEGIN READ ONLY / exact WHERE / id,email,created_at only / ROLLBACK. Actual response retained in the adjacent receipt. The old execution report/UNKNOWN record is unchanged.

## Minimal diagnostic correction

The existing provision transport now records each reserved attempt's HTTP status, finite status category, UUID-only `sb-request-id` / `x-request-id`, and a small explicit allowlist of SDK error codes. HTTP response, transport exception and pre-dispatch guard refusal remain distinct. HTTP 2xx alone never proves a user was created; only the existing validated returned identity creates a receipt. Network throw still means unknown outcome. Non-allowlisted/missing codes and request IDs are null. No response body, error message, arbitrary headers, passwords, keys or tokens enter diagnostics. Partial confirmed A receipts remain retained if B fails. Duplicate email/third attempts are denied before outbound fetch and never refunded.

No changes to emails, credentials source, account adoption, normal authentication, backend, schema, permission, business contracts, budgets, retry policy, watchdog or recovery logic. No new configuration alternative or automatic retry.

## Exact future Owner approval required

1. Fix reviewed code SHA, combined source hash manifest, future startsAt/expiresAt (positive <=900 seconds), owner-authorized gate digest, canonical DEV project `tuqigdxrvrerfewsxqgm`, operator and rollback owner. Reattest exact healthy B image4c8d/bundlea912/environment/three mounts and dormant SQL. No new deployment or migration.
2. Explicitly authorize fresh exact-email-only readonly checks for A and B immediately before new provisioning. Current A observation is time-bounded; B eligibility is NOT_VERIFIED. If either exists, STOP: no takeover, password reset, login attempt against an existing identity or delete/recreate. Report a specific reconciliation Gate instead.
3. Authorize at most two new createUser outbound attempts, one for each unchanged exact synthetic A/B email, using the already qualified canonical `.env.backend` DEV administrative channel. Historical A attempt1 remains separately counted in the old run; the new limit must be explicitly approved as a new run, not a budget refund. No alternative key, permission change, new credential or extra validity probe. Failure stops immediately; diagnostics classify only the observed response, not an inferred root cause.
4. Only actual returned new identity IDs may bind the next plan. If Owner approves full C resumption in the same fresh window, retain at most two normal sign-ins, two server getUser verifications, two ordinary absent-own free_user initializations; eight business mutation attempts and sixteen business reads. Use existing repository/queue/worker/typed readback, exact QA IDs/scalars/request hashes, memory-only passwords/tokens, independent watchdog before LOGIN/gates, >=240s service-change reserve. No extra Auth or refresh. If insufficient time or qualification fails, stop without business activation.
5. Any partial creation, network/unknown outcome or safe-close uncertainty must retain receipts/data and stop; no automatic retry, enumeration or cleanup. Exact close/return to current B and RECONCILE_REQUIRED rules remain unchanged. A separate approved investigation is needed if this fails again.

Future commands (NOT RUN here): existing `provision.ts --execute <new signed-by-hash Owner gate>` with private stdin; existing plan.py / run.ts / control.py only after valid new identities and explicit C authorization. No new execution entry point.

## Evidence scope / Data Path Checklist

- Data ownership: finite administrative diagnostic metadata; original synthetic identity lifecycle unchanged.
- Local storage: private operational receipts only; no key/token/password persistence. No SQLite schema/product change.
- Sync/backend contract: unchanged; diagnostics do not create business authority.
- Conflict/offline: existing no-retry/exact identity and original operation semantics retained; unknown Auth never replayed automatically.
- Required evidence: L2 isolated SDK/loopback and scoped SQLite regressions; no Native L1 or new real Auth/business L3 claim.
- Remaining Delta: independent Review, new explicit Owner window/Gate, fresh exact A/B existence qualification and actual new Auth outcome. Four business paths remain NOT_RUN/CLOUD_PENDING.
