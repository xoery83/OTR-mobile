# PDF Source runtime ports — default closed

Reuse the existing V4 upload command, causal journal, Actor/Trip checks and V2
verification/registration/seal. Optional reserve/finish HTTP actions accept the
frozen Source command; Backend allocates private resource identities. Native uses
the existing normal Account/Session transport and exact durable operation. Only
strict matching Source receipts may return; UNKNOWN never causes a write retry.

An explicit continuous-context option establishes a transaction-local Source
locator on the same held Source lease before existing writing RPCs. It defaults
off. Inventory stays a normal read, and prior immutable receipts are read before
fresh execution where the existing protocol permits it. The future SQL issuer,
SourceGateway EXEC and scoped PDF authority require a separate protected packet;
this software does not supply them or enable any startup caller.

The existing Storage producer also has an explicitly scoped original-byte port.
It reuses bounded GET, fixes Actor/Trip in the producer fingerprint, verifies
MIME/length/hash, rejects encoded/partial/redirect responses and returns no custody
receipt. Only an owning SQL-qualified caller may supply Source metadata. Missing
scope is closed; the legacy producer gains no byte-reader API. Actual Secret
purpose/worker/runtime configuration is still pending qualification and approval.

Nine directed suites155 tests passed with one conditional Worker test skipped;
types/lint and independent Review passed in the delivery tree. Joined-main tests
are recorded separately. No SQL, RLS, table GRANT, role, Provider budget, DEV
service or runtime capability is changed by this increment. Full PDF and Photo
Source→Save E2E are not claimed.

An explicit PREPARE action now transports the existing six-pin owning command
before upload admission. Its exact parent receipt remains distinct from the upload
receipt. The same scoped transaction invokes the existing SQL issuer; no parent is
synthesized and no Source/Task authority is duplicated. Startup remains unbound.
Five affected suites97 passed; six conditional SQL tests skipped. The separate
27-check isolated owning protocol result covers reservation and synthetic local
stage/dispatch/UNKNOWN only, not Storage execution. Independent software Review
found no blocker.

Normal Backend Auth exposes request revalidation, not a persistent Account/Session
epoch. A versioned `SOURCE_REQUEST_LIFETIME_V1` Source adapter may issue a private
in-memory request fence while retaining independent normal Auth/Trip checks.
That fence has no authorization meaning, is never serialized into SQL/receipts,
and cannot prove continuity across requests, workers or restarts. Abort and close
invalidate it. Every access revalidates the same trusted Actor/Trip; SQL remains
the final mutation authority. Pre/post checks do not promise atomic revocation.
Legacy V3 and non-continuous V4 reject this adapter. No Auth/Session interface is
changed, and normal startup remains unbound pending qualified composition.

The request version requires a synchronous liveness guard inside the held Source
lease, around scope/owning queries and before commit; raw rollback still runs
after closure. Four deferred lease/enter negatives reproduced stale writes and
passed after repair. The per-request Storage producer checks normal access and
liveness immediately around HTTP too: a separate decode→POST race was reproduced
and fixed. Its stable provider fingerprint excludes this ephemeral guard. A
request already sent or committed may complete; closure cannot undo remote writes.
Eleven affected suites180 PASS/one conditional skip, types/lint/capture bundle
PASS; independent Review NO_BLOCKER. No Auth principal, SQL or DEV activation.

Native continuation reuses the existing V2 verify/register/seal endpoints. Move
only their frozen request/receipt schemas into the existing domain layer, without
Node/Linux imports, and keep Backend re-exports for all current callers. The
Backend still checks its real decoder/profile fingerprint at construction; no
Native result issues custody or Source authority. This is contract placement,
not a new Source/queue/verification protocol or runtime activation.

The explicit single-PDF Start continuation reuses the existing Source admission
queue and immutable acquisition receipt. Deterministic phase proposals are checked
against the actual SQL codecs in the isolated fixture. Unknown dispatch is read
before any continuation; only a successful owning seal and catalog refresh allow
Task Prepare. Local PDFKit text is discarded; the Backend fixed decoder remains
the derivative producer. The Native PDF flag is off by default.

V2 verify/register/seal optionally compose the same request-lifetime fence under
normal Auth/Trip. Lease acquisition, every SQL statement, custody reads, worker
completion and COMMIT are guarded. BEGIN post-check failure performs raw rollback
before the caller can set its transaction flag; rollback failure retires the
lease. A sent COMMIT remains potentially accepted even if the response is withheld.

The existing Source 5-second idle timeout is below the fixed worker's 20-second
wall ceiling plus two bounded Storage reads. A separate, dormant PDF Source
connection may use a 65-second idle / 75-second total lease under the same Source
gateway, TLS, 5-second SQL query/statement and 1-second lock defaults. Ordinary
Source/Core/Person/Trip connections retain their original limits. This is a
bounded software profile, with no new principal or database permission and no
startup activation. Runtime qualification must use this profile before opening
PDF writes; Native's existing 90-second request budget stays unchanged.

The optional continuous runtime now injects both timeout profiles through one
existing Source FIFO (backlog4/wait10s), preserving rolconnlimit1. PDF does not
construct an independent connection. The dedicated private config is hash-pinned,
root:999/0440, exact DEV QA Actor/Trip and existing expiry; absent flag performs
no PDF config/Secret-purpose/connection/worker access. Bad PDF config closes only
PDF. Both request factories remain behind that off-by-default switch.

Host candidate uses the existing fixed image's Node24.21.0 binary (SHA256
7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c),
not a downloaded runtime. Dedicated root:999/0750 Unix directory and0660 socket
expose only the existing parse-only service. The Backend gets no Docker socket.
The existing durable worker lease retains UNKNOWN across restart. Host process,
paths, socket mount and limited original-custody Secret purpose require the
combined protected approval; none is installed by this software change.

PDF closure must not depend on retaining temporary administrator authority. The
combined candidate therefore includes one fixed-QA SourceGateway definer port
with only CLOSE and read-only CLOSED verification. It can set the PDF bit false
or read it; no argument can enable it, alter other policy fields, expand scope,
or touch retained business data. Independent readback uses a fresh READ ONLY
transaction. This new function/EXEC purpose belongs to the same protected Gate,
not an implicit ordinary software authorization.
