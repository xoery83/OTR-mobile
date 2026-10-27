# Sustained policy checkpoint — not DEV deployment

Replaces finite 24h QA acceptance with a separate normal service policy. `trip_sustained_dev_policy` has no Trip ID, operation ID or expiry: enabled Actor Accounts and immutable adoption cutoff are explicitly configured by the authorized operator. Every Create/Metadata/Core command/result/read checks current enabled policy, actual owning gateway session, immutable self-created V2 Trip receipt, current creator and linked owner. Revocation rejects reads as well as new writes. Cutoff/Actor cannot be silently changed or deleted to reopen history. No rows are enabled or principals logged in by migration.

`createSustainedDevTripPorts(..., enabled=false)` is opt-in CLOSED and has no QA Actor/window/clock. Backend composition must construct the existing Pg storage/readers with `{sustainedDev:true}` so capabilities come from the actual owning SQL helper, never a fabricated DTO. This option is explicit and leaves legacy finite queries untouched. Only the same five MANUAL P1 commands are exposed; existing creator restrictions and row/receipt guards remain. Source/Custody/Review ports are not returned.

## Exact pending SQL/ACL Gate

Install candidate `20261024000200_trip_sustained_dev.sql` only after exact seven function and three constraint preimages and CLOSED existing roles/Gates pass. Changes:

- New private RLS policy table `trip_sustained_dev_policy`; no gateway direct CRUD grant.
- New scope helper `trip_sustained_dev_scope_allowed`, capabilities reader `trip_sustained_core_capabilities`, and immutable-policy trigger function.
- Seven existing Create/Metadata/Core scope/command/write/read-state functions receive a disjoint sustained branch. Original finite branches and constraints are retained.
- EXECUTE of capabilities reader to existing Core gateway, helper to existing Core writer. No new role, broad table grant, business model or new Sync engine.
- SQL rollback verifies exact candidate function postimages, requires principals CLOSED and restores original functions. Accepted Trip/Core data and immutable receipts survive. Policy configuration is removed only after service shutdown; no business row cleanup.

Service LOGIN/credential deployment, permanent DEV policy rollout, Auth/route composition and independent close/revocation verification require Owner Gate. This candidate grants no deployment authority. An operator may revoke a policy and stop the service without resetting user data. Production is excluded.

## Owning scheduler fixes

Readback continuation uses a unique claim token. Any live PROCESSING lease cannot be stolen even by a newer trigger; that trigger retains a follow-up marker. Completion/retry compare the claim, preventing late old ACKs from changing a newer read. AUTH rows do not create timer wakes; external normal Auth recovery retains existing queue semantics. Ordinary one-Trip failure is isolated; Account/revocation fencing still aborts the whole obsolete wake.

## Evidence

41 targeted scheduler/readback/wake/runtime/Core tests PASS; Typecheck and scoped production lint PASS. Network-none PG17: 17 checks, including Create/Edit/full destinations/replay/CAS/negative ownership, five actual P1 mutations/replays/full owning collection, independent full-list snapshot using accepted Create operation, revocation, immutable adoption cutoff and rollback data/receipt retention. Not a real Supabase DEV or Native result.

Formal Person create/receipt/readback and originating AddTraveler wiring are still in progress as a separate explicit owning delta in this same Writer. Existing v1 private names remain untouched. Root owns Native/shared Backend composition and the single timer; this checkpoint changes neither AD5 nor remote services.
