# Immutable Guest adoption recovery checkpoints

AUTH Final V1 requires restart/UNKNOWN recovery without deleting Guest originals
or guessing whether a server publication committed. Existing business repositories,
queues and Supabase Session authority remain unchanged.

Use Auth-owned immutable local checkpoints in an explicit Guest namespace,
`auth-guest-adoption/<sourceGuestLocalId>/<adoptionId>/`. They contain source/target
UUIDs, inventory digest and canonical P1 draft snapshots only; never Session,
JWT, OTP, provider secrets, copied SQLite or another Account's data. These files
are local recovery material, not cloud receipts, membership or upload authority.

Prepare must finish before protected transfer. A publish-request checkpoint must
finish before invoking publication; its presence always requires an authoritative
server status query after restart, even if the request was never transmitted.
Cancellation is local only before publish-request; afterwards it requires a future
server cancellation/status contract. No local terminal-success state is introduced.

All writes use the existing Account apply gate and source Guest/generation fences.
Write a new temporary file and move with overwrite=false into a fixed immutable
checkpoint. Never overwrite/delete earlier checkpoints: the installed Expo native
move implementation removes an existing target when overwrite=true. Matching
retries return the retained record; conflicting identities/content fail closed.
Temporary/incomplete files are never a committed checkpoint. Corrupt committed
files require recovery and retain originals. No production/Backend/Schema/RLS/GRANT
or login/upload consumer is activated by this local preparation.

Recovery control files are excluded from uploaded business-file inventory; they
must not recursively change their own source manifest digest. Capture/Document
originals remain separately owned. Import confirmed there is no accepted Guest
producer or Guest file collector; Account BLOB stores must not be borrowed.
Completing this journal does not remove the full-file/all-live-draft blockers.
