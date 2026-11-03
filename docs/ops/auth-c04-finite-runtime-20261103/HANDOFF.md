# AUTH-C04 finite runtime controller — prepared, not authorized

This additive Root control reuses the existing Auth phase2 retained-container
sequence, private plan IO, common short service lock and independent systemd
close timer. It only changes OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG in a staged
container using the same image/HostConfig/mounts as the exact retained default.
It does not invoke SQL, Provider, business commands, receipt deletion or data undo.

No executable plan or time is supplied. Root must later inject and seal the exact
fresh baseline CID/image/Config/Host/Env/mount+file hashes, fixed A/B Case, UTC
opens/invite/close timestamps, actual approved Gate and Owner receipt hashes.
Maximum runtime is30min; invitation at most10min from open and no later than close.
The separate approval/qualification is not conferred by parsing a plan. The
existing normal Auth gateway and owning PG checks remain authoritative.

Root stages the same-image candidate, arms the independent absolute-deadline
close timer, then starts under the existing common short lock. Unknown create or
arm disposition requires reconciliation, not blind repeated creation. On a
post-create or partial-stop/rename/start failure, rollback attempts exact retained
identity restoration and independently reads back healthy default/absent selector.
If any current container, candidate, baseline, config, mounts or files drift, it
refuses to replace a newer deployment; output is RECONCILE_REQUIRED. A rollback
never means NoCommit: preserve original operation/digest and recover its receipt
under separately qualified access. A late result cannot authorize a new operation.

Before real use: independent review; exact Owner finite execution Gate; normal A/B
sessions and quota readiness; approved existing Person/Trip preimage; fresh Host
CAS; actual timer+failure-close/readback qualification. The source template omits
timestamps intentionally. No Host/SQL/device test or activation is performed here.

Deployment layout (Root later): copy this runtime and exact QA_CASE_TEMPLATE.json
beside plan.json/state.json; copy the existing phase2 runtime as
`auth-phase2-runtime.py` (SHA014844d4…). The loader verifies that reuse hash and
case-template SHA98cc4472… before running. Source tests fall back to the original
repository path; Host must supply the sibling helper. No credentials are bundled.

Local validation:13 focused tests PASS, including four partial-mutation failures,
failed stage state persistence, unknown create, expiry close/idempotence, stale
foreign current deployment, baseline/candidate drift and missing/mismatched timer.
All Docker/systemd/plan IO is replaced with an in-memory fixture. The template
contains no real times or executable plan. Status: LOCAL_PASS_NOT_ACTIVATED.
