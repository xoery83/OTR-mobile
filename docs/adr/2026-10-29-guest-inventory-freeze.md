# Guest inventory freeze on the existing workspace

Status: internal pre-publication inventory port only, no Native caller activation.

The existing Guest Trip/Core/P1 repositories recheck their account getter inside
apply-gated writes. Add an Auth-owned freeze there, shared across Guest workspace
instances in this process, instead of adding another repository or sync engine.
Acquire the freeze on the same apply gate after earlier writes finish. While it is
held, ordinary Guest workspace access fails closed; read-only census and owning
Capture inventory use the original identity getter and remain available to the
lease. Live P1 editor fields still require the separate owning draft freeze port.

The lease checks exact scope/generation/token before and after inventory reads.
Concurrent acquisition is rejected; release is idempotent and an old release cannot
unlock a newer lease. Release resumes the same existing repository/draft objects.
No cache copy, Account/Person reassignment, upload, SQL or Session installation.

This process-local inventory fence is not a durable publication lock. It must not
be used to authorize publishing. Full-file proof, combined draft/source snapshot,
manifest recheck and persistent PUBLISH_REQUESTED recovery remain required before
any publisher or Native adoption flow can be activated. Current publisher stays
closed; cold Guest Local Foundation behavior remains unchanged.

A new current Guest scope may discard only an obsolete generation of this
pre-publication inventory fence inside the apply gate. Old scopes cannot inspect
or release a new token. Durable publication recovery must precede this step in
any future enabled publication flow.
