# One QA Guest Trip/P1 window

Status: OFFLINE CANDIDATE. No Host/SQL activation has been performed.

1. Owner approves the exact negative-only shutdown Gate; Root fresh-checks DEV,
   installs it while CLOSED, runs close-gate-postcheck.sql and verify_close_gate.py
   against the saved pre-install495 metadata. Other functions/roles/RLS/ACL and
   business/evidence counts must match; only one function/EXEC is added.
2. Root confirms no other Auth timer/window is active, no Photo/Core writes, and
   actual baseline65b/4d/Ab5, full Config d6b5, Host e89, mounts747/6 and all
   17 Compose/4 runtime file hashes match baseline.json. Independent close-only
   helper verify must be CLOSED. Do not reuse a stale plan or old GUI READY.
3. Auth restores the SAME existing target71b confirmation panel, reports fresh
   READY and owns FormsQA claim. No new OTP or Add. Only then Root freezes expiry
   (at most30 minutes from READY, preferably20) and closed Policy xmin from a fresh
   READ ONLY query. Compile the standalone control, then freeze.py creates a new
   private /private/tmp output; upload only its files to the exact hostRoot it
   returns, root-owned0700 directory and0600 files. Pin HASHES/plan SHA.

   Build: `npx esbuild scripts/auth/qa-policy-close.ts --bundle --platform=node --target=node24 --format=cjs --alias:@=./src --outfile=/private/tmp/otr-auth-qa-close-control.cjs`

   Freeze arguments: `--out <new /private/tmp directory> --ready-at <fresh UTC Z> --expires-at <UTC Z> --closed-policy-xmin <actual value> --close-bundle /private/tmp/otr-auth-qa-close-control.cjs`.

4. Root runs runtime.py stage, then arm, with exact plan path/SHA. Stage creates
   but never starts the candidate. Arm verifies SQL CLOSED and installs an
   independent close-only systemd timer. Inspect its unit, executable/hash,
   timeout and exact deadline before enabling anything. No shell/UI-dependent
   shutdown process is accepted. No new mounts/images/roles/credentials.
5. Root sets the documented SQL session intent GUCs and executes frozen
   policy-open.sql via its existing management channel. Save active_policy_xmin;
   unknown COMMIT is reconciled read-only, never blindly re-opened. The global
   Policy is not single-QA isolation: the normal JWT and runtime Account/Guest
   filter provide that boundary. Then set OTR_AUTH_QA_SERIAL_WINDOW_ACK to the
   windowId and run runtime.py start. On any exception the controller attempts SQL
   closure, exact65b restoration and fresh SQL verification independently.
6. Only after Root reports actual healthy finite runtime + armed timer + exact
   Actor/Guest/expiry does Auth click Add through normal UI. Actual Failure →
   smallest repair; do not fabricate publication or release source on UNKNOWN.
   Root independently reads back only this synthetic Trip/P1 and owning receipts.
7. Finish early with runtime.py close. It tries SQL close, always attempts runtime
   restoration, then verifies SQL in a separate Node process/READ ONLY session.
   SQL failure cannot skip runtime containment; unconfirmed steps never report
   CLOSED. Timer runs the same close even if desktop/operator disappears, with
   bounded calls per attempt and close-only retries until verified closure.
   Start-limit is disabled so lock contention cannot exhaust the shutdown job. Retain every source, grant, receipt and business row.
8. Root independently runs policy-verify.sql from a fresh privileged READ ONLY
   connection, and compares owning roles/membership/ACL/RLS/public parent hashes
   with the approved metadata (allow legitimate scoped evidence counts; never
   delete evidence or fake zeros). Stop/reset only this window's timer after
   CLOSED is verified. Verify65b/4d/Ab5/settings and ordinary QA read path. Return
   claims/Writer. Actual cold/UNKNOWN/isolation evidence still required.

Root's direct policy-close.sql.in has a separate active-xmin CAS path; render_close.py
binds the actual activation xmin after policy-open receipt. Host shutdown does not
need this receipt and can close safely even if the open reply was lost. An old
window must be verified closed and its timer retired before starting another.
A different future Policy version is never changed by this helper.

Runtime rollback defaults to65b, so Auth status/receipt HTTP is temporarily CLOSED.
UNKNOWN retains source. If needed, Root later mounts the same expired, bound
read-only recovery scope with Policy CLOSED; do not claim cold recovery until
normal authenticated status/receipt + owning readback and original Session
transition actually finish. This package does not implement payments or a new
Auth/Repository/Queue engine.
