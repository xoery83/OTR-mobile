# Guest Trip live draft inventory

AUTH Final V1 requires retaining actual unsaved Trip and P1 input during login,
cancellation and recovery. The existing P1 registry already supplies scoped
freeze/resume, revision fencing and canonical snapshots. Reuse that lifecycle for
Trip Create/Edit instead of introducing a second form, repository or sync engine.

Trip snapshots must retain raw visible fields, stable draft/Trip/operation IDs,
initial metadata/destinations, explicit local Person slots and pending save identity.
Open child pickers/name editors and in-flight/UNKNOWN saves block handoff until
the owning form can retain their complete state. Never claim full live-draft
coverage from the P1 registry or SQLite alone. Frozen controls keep their original
values; same-Guest foreground reads preserve the already mounted presentation.

This is local recovery preparation only. No login/adoption/publisher consumer,
Account activation, commercial policy or protected SQL authority is enabled.

Recovery version2 retains both original P1 and strictly typed Trip snapshots in the
existing immutable journal. Version1 remains P1-only. A Trip Create draft is still
unsubmitted UI intent: its Trip ID must be absent from the persisted-business
Trip list and it creates no remote shell. Trip Edit/P1 snapshots must reference a
Trip already in that list. All snapshots retain canonical bytes/hash and target
binding. Each transition must match its preparation's exact journal version.
