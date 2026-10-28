# Guest local Trip and P1 vault

Owner requires normal unauthenticated Native Trip/P1 creation and cold recovery
before Guest adoption. Golden Slice A uses an isolated SQLite file named
`otr-guest-<local UUID>.db`. It reuses the existing migration runner, transaction
serializer, Trip/Core/Manual P1 repositories and local Day reader. It never opens
`otr-mobile.db`, copies another database or installs a formal Session.

The persisted Guest principal supplies a vault-local owner UUID. Existing SQL
columns named `account_id` retain that local correlation value inside this file;
it is not a Supabase Account or evidence of server authorization. Local creator
Person and pending operations retain the owning repositories' existing semantics.
No Accepted projection, receipt, normal sync worker or transport is assembled.
The public Guest port excludes cloud receipt/dispatch methods and photo storage.

Every asynchronous repository access rechecks Guest kind, UUID and the existing
Account transition generation. Even an identical UUID in an Account principal
invalidates Guest handles. A failed transition preserves the vault but requires
a newly bound handle. Initial startup chooses the principal; read-only consumers
do not create a new Guest after logout or adopt legacy credentials.

Native owns startup, navigation and public repository consumer changes; Auth owns
the separate scope and assembly port. Headless SQLite checks are development
evidence only. Acceptance requires the real Native UI and terminate/relaunch in
an independent QA app sandbox without borrowing a formal Account Session.

Golden Slice B must inventory original data and reconcile identity/operation
lineage through the approved adoption authority. This decision does not authorize
file copying, rewriting Guest rows into an Account, cloud upload or deletion.
P2–P6, Ledger UI, Capture, Documents, attachments, drafts and pending intents remain
subject to their owning contracts and inventory; A does not silently migrate them.
