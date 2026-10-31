# PNG owning acknowledgement focused repair

Actual same-Source upload d2f59e69/attempt077c0f34 reached RUNNING, then Native
PNG_ORIGINAL reported an unconfirmed local failure at2026-10-31T06:14:09.645Z.
Source06:17 readback remained IO_ACTIVE/RUNNING with no terminal. Acquire and
PREPARE were APPLIED; no paid Vision or Task observed. Do not re-dispatch or
create another replacement. Window10/7ffab2d4 is independently CLOSED:
Source before/after, runtime, worker inactive/physical TERMINATED, timers stopped.

Code inspection found repeated fresh Auth/Trip calls: composer before/after,
broker three times, mutation pre-STATUS and unconditional IPC pre-STATUS. Normal
worker path can produce70 Auth/Trip groups and14 Source transactions. Gateway
uses auth.getUser plus3 Trip queries per group. This proves amplification, not
unique timing attribution for the actual failure (no per-phase timing captured).

Small ordinary software fix retains fresh Auth/Trip inside each canonical broker
transaction, exact SQL principal/guard/CAS and a mandatory synchronous capability/
lifetime/abort fence before/after. Composer uses this fence; IPC explicit current
still reads owning STATUS. Mutation callbacks rely on their own authoritative CAS
and fresh broker authorization. No cross-request permission cache, SQL/authority,
Provider, budget or90s limit change. Normal worker path counts fall to8 Auth/Trip
groups and8 transactions; actual DEV performance remains unverified.

RED counted3 broker authorizations instead of1 and5 IPC current calls instead of2.
Five focused suites41PASS, full npm run typecheck(exit0), scoped ESLint PASS.
Required-fence follow-up broker11PASS. Root independently reviewed fixed trust
boundaries and all production callers; NO_BLOCKER. Not deployed yet.

The retained interrupted upload still lacks a formal negative-quiescence/retry
entry in the PNG operation wrapper. Prepare one precise same-operation change;
reuse canonical execution terminal/release/cleaned, attempt_observe and
attempt_start. Never fabricate PARSE_PASS, reset old rows or replace the Source.
