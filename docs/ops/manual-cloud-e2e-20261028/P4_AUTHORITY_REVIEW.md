# P4 Manual DEV authority candidate — NOT INSTALLED

Owner retains precise approval for sustained business authority expansion. This candidate reuses the approved normal P3 pattern; it does not borrow Import rights.

- Replace exactly four existing functions: trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text), trip_sustained_core_capabilities(uuid,uuid), trip_core_guard_write(), trip_core_finite_read_state_guard().
- Only Forms QA account `3f7e964e-79d3-4028-a585-470e798e41ec` and its normally created V2 Trips with receipt created on/after `2026-10-28T02:16:48Z`, additionally respecting existing policy cutoff/linked owner/principal checks. Same bounded account/Trip cohort as approved P3. Existing synthetic Trip `9a96becb-a10b-4c58-b50d-2547dd61b0b7` is reusable; older QA Trips remain excluded.
- Add narrow CORE_P4 selector and exact normal MANUAL P1/P3/P4 profile: CREATE_ITEM, SET_ITEM_TEXT, SET_ITEM_SCHEDULE, SET_ITEM_PLACE, SET_ITEM_PARTICIPATION, SET_STAY_DETAILS, SET_RENTAL_DETAILS. Core keeps SET_ITEM_PLACE invalid for P4; Rental endpoints use SET_RENTAL_DETAILS only. Backend also fences Stay/Rental commands to their own family and requires same Creator for Edit.
- New P4 writes touch existing Item, Rental details/places, participants/visibility, immutable receipt/read-state only. Pickup/Return remain independent, other endpoint and vehicle facts are preserved. Child event_id and place role cannot be reparented/renamed by UPDATE, even under valid gateway/writer context. No Booking/Ticket/media/custom authority.
- Preserve existing P1/P3 and reviewed Source branches. The read-state preimage is the actual Import-installed `c8d64a12edd7e92a738a536e34071fb4`, not obsolete P3 pre-Import text. Exact compare-and-swap applies to all four functions and rollback. Existing OID/owner/ACL are preserved; rollback retains accepted rows and Import postimage.
- Zero new table/function/role/RLS/GRANT, policy row changes, temporary admins, Provider activation or Production access. Ordinary Backend deployment will clone the latest actual retained DockerConfig and preserve its six mounts/Env; it must include current Import source, never redeploy an obsolete P3 image.

Validation:6 suites84PASS, types/scoped lint/default-CLOSED Backend build PASS. Network-none owned PG uses existing sustained/P3 harness with P4 selection: real PgPort Create/text/schedule/Rental details/participation, exact operation replay, full validated Reader, clocks11:00/18:00, retained Return/Supplier, wrongAccount/missing context rejection, raw-writer reparent/role rejection, data-preserving rollback and OID/owner/ACL PASS. Independent Review closed the Rental child identity finding; no remaining blocker. These are L2; P4 Native/DEV Cloud L3 remains pending approval/deployment.

SQL SHA256:
- install: `5eb86f885e799d8fd77c736fb5c189d54b73f2e9e274519154f21d73f3453e35`
- rollback: `69bfa5f029acbb4d0961d04092ee3d054b3bd6f8cfbdd8bd27e60f35d19233c5`

Evidence: `/private/tmp/otr-manual-cloud-20261028/p4-directed.log`, p4-types.log, p4-lint.log, p4-backend-build.log, p4-owned-pg.log. Shared DEV window currently belongs to Universal; installation waits for explicit handoff and fresh live preimage verification.
