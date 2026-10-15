# TCL01 local Trip Ledger initialization

Owner approved offline Create Trip → Ledger → New Expense → local Save → cold
reopen, including repair of existing creator intent through the normal repository.

SQLite68 records an account-scoped local creator Person binding separately from
Hosted receipt ownership and Core certified Person bindings. The owning Trip
repository atomically creates the local Ledger journey, owner and actor context
with the Trip intent. An explicit idempotent repository entry repairs older local
Trips only after matching their retained CREATE_TRIP operation and payload. It
never manufactures accepted_at, a remote membership, participation revision or
Core certificate. Existing remote actors/settings are never overwritten.

Local Ledger settings match the accepted fresh-Journey NZD/scale2/REFERENCE_RATE
defaults in `supabase/dev-forward/r3-v1/202610080001_fresh_trip_ledger_initialization.sql`.
Account display currency preferences do not authorize different financial settings.
The creator's current local account name
is retained as the Person display name. Local Expense operations use the existing
queue and depend on the original CREATE_TRIP operation.

TCL02 must reconcile the retained local Person to the Hosted receipt Person and
rewrite dependent Expense identity references atomically before releasing their
dependency. No Hosted dispatch, Backend deployment or device acceptance is part
of TCL01. Local binding retention is not proof of current Hosted authorization.
