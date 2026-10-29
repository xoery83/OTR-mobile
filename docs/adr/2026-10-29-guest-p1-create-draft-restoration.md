# Guest P1 Create draft restoration

Restore only CREATE snapshots validated by the existing durable journal schema.
Use the existing P1 Repository open/current transaction, creator/Person roster,
WeakMap draft authorization and normal Save/Queue. Keep original Item UUID, raw
unfinished fields and optional initialFields baseline; the existing opened editor
channel consumes them without a second draft repository or new navigation.

Require the committed Guest kind/UUID, current generation, same repository actor
and no publication hold. Refuse an existing Item. Recheck Guest identity in the
normal write transaction result so identity loss rolls back writes. Other families
and v1 EDIT remain closed: EDIT checkpoints lack the owning original revision and
must not be silently rebound to a newer revision.

This is local component integration. Production Native recovery selection/routing,
actual GUI reconstruction, provider/adoption orchestration and cloud publication
remain unmounted and unverified. No Account or Guest data is copied or discarded.
