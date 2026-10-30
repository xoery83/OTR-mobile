# Strict empty Guest Session installation

Status: implementation candidate reviewed; Native first-use validation pending.

The normal Provider flow verifies OTP before Account activation. The existing
Guest-marker guard rejected every Guest, including a fresh installation with no
saved data. A verified Provider result did not imply a committed local Session;
the consumed OTP must not be verified again.

The normal Account coordinator now optionally prepares installation before taking
its transition lease or clearing UI memory. The canonical Guest workspace freezes
strictly empty Trip/P1 draft registries before that clear. Nonempty, changed or
already-frozen registries reject. Under the exact active Account transition, the
same Guest and immediately succeeding generation are required. Direct read-only
queries verify schema74, zero rows in every non-bookkeeping table and no retained
recovery attempt or publication hold. Only schema_migrations/sqlite_sequence are
bookkeeping. Unknown nonempty families reject. This relies on the current Guest
capability's absence of registered file producers; it does not claim the physical
disk is empty or inspect another Account's files.

Only that owning qualification can install a fresh normal per-Account Session.
No Account index, legacy credential, Guest verification record or pre-existing
target Session slot may exist. Qualification, exact lease and cancellation are
checked before the Session slot and before the Account index visibility commit.
Precommit failure may clean only the exact newly staged credential after readback
proves the original Guest and absent index; uncertain/committed outcomes remain
with existing transition recovery. The original Guest DB/files are never copied,
cleared, published or marked Server Accepted. The direct Guest write guard stays
closed. Retained data still requires full Adoption.

Empty-registry locks release before Account/recovery UI bootstrap and before any
network restart, with idempotent finally cleanup for failed preparation or stale
transitions. No database schema, role, GRANT, RLS, backend authority or native
library changes are included.
