# WP05-C local Trip container — independent review candidate

2026-10-13. Isolated current-code baseline edcbd7d; later Capture-only main458337d
has no owned-path overlap. This is a real local persistence/user-entry implementation,
not completed server initialization, confirmed membership or full Beta user delivery.

SQLite58 `local_trip_containers` is reserved by the sole Integrator. Account/UUID and
creation-operation uniqueness fence local metadata; the same SQLite transaction
stores that record and a durable `CREATE_TRIP` operation. Replays require identical
canonical payload, failed queue writes or Account ABA roll back both. Operations
remain DEPENDENCY_BLOCKED until a qualified owning Backend initializer exists.
Startup owns migration installation; feature UI never initializes storage.

`TripRepository` implements local create/list/get and reuses Core2 enqueue/pending
for P1/P3. A date-only request carries UNKNOWN/no clock/zone/instant. Organizer
creation defaults are requested intent values, not a grant of authority: actual
Actor/Person and permissions remain server-owned; no accepted scope/certificate is
invented. Local pending requests remain outside the accepted Day projection. Core
worker is not enabled by this entry. Zero-night stays may be requested honestly.

No financial default is selected. Trip PostgreSQL root has no settlement-currency
field; local baseCurrency and ownerPersonId are null. Ledger settings require
explicit owning currency/scale/valuation initialization, separately. Existing
personal defaults or QA seed do not initialize this Trip. Pending copy refers to
this unresolved creation request, never global accepted authority.

`LocalTripWorkspace` mounts only in the existing Trip Home/list. Today and admitted
selected Day retain the original early-return/Composer/navigation. Native canonical
forms/picker, theme/tokens and both glossary-consistent dictionaries are reused.
It lists device-saved Trips, opens owned local metadata, saves P1/P3 pending requests
and displays their actual dates/state. Inaccessible explicit IDs do not expose local
metadata. Expired-token cached identity can use the existing local Auth rule; no
network refresh is added to launch/read/save. Independent visual observation is a
separate prerequisite; unit/static results are not Native acceptance.

Author affected checks: 5 actual test files /69 PASS, including5 new repository
cases with actual file SQLite close/reopen, duplicate/reuse, rollback, isolated
Accounts/ABA, existing blocked queue selection and date validation; 2 connected UI
regressions cover deferred repository resolution across account/scope remount, late
mutation fencing, independent busy ownership and the explicit My Trips/list/reopen
action. Generation and Trip identity key the workspace content; cleanup prevents
old requests from publishing or mutating after scope change. Typecheck,
scoped lint, Prettier, diff and UI guard PASS (473 legacy/92 strict representative
files, baseline unchanged). Fresh independent function Review and observed UI QA
are pending at this author report. Test identities are synthetic, not real Native
accounts or user delivery. No server/Hosted/new credential/device/install operation.

Actual-runtime prerequisite: current existing A1A recovery/com.xoery.otrmobile is
anonymous with no active/remembered session; Core DEV Read disabled. Existing
approved R3A6 actor evidence is historical/logged out, no approved opaque native
restore found. Owner/custodian must use an existing approved login/recovery path;
no private secret/session copying, fake Actor/Person or new-account grant inferred.
Anonymous layout/disabled controls may be independently observed within scope.
Full authenticated create/reopen/item/Day/offline runtime remains NOT VERIFIED.

Next smallest owning dependencies: Backend idempotent Trip creator request→actual
creator trigger owner/member truth→existing Core actor admission/read2→ordinary
Core command send/receipt/collection refresh→P1/P3 accepted adapter→existing Day
caller. Ledger initializes from explicit verified owning input; no default is
required for this local pending packet. Protected live environments/credentials
or account reset need their existing scoped grant/operator workflow; ordinary
DTO/worker/local integration remain delegated. No new architecture or approval
framework. Full real J1–J5 remains0; Source CLOSED mechanical chain1 is separate.
