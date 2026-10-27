# Settled Results recovery — actual failure and safe closure

Status: RESULTS_E2E_BLOCKED; FAILED_RUNTIME_ROLLED_BACK; read consumption UNKNOWN.

- Owner-approved33272c2a closed deployment actually passed. Finite window2026-10-24T23:43:36Z–23:53:36Z, outer23:58:36Z.
- First failing boundary: settled Host bootstrap. Loader retained the existing publication Catalog connection but bootstrap received none and attempted a second singleton pool. Candidate exited1 before the recovery CLI or Native Results request. Closed-only smoke had not exercised this selected path.
- Docker restart policy produced12 start events. One startup read was reserved after the previous42 entries. Events are not proof of exact business-read count. Conservatively retain UNKNOWN; do not erase/refund ledger entries or claim remaining allowance.
- Source/call roles and exact finite reader scope closed. Original mount-specific restore rejected the approved recovery mount; original RECONCILE_REQUIRED receipt is retained. Independently reviewed exact-target reconciliation restored the retained container and removed temporary mount. The Gate-required final image rollback40e998 completed with health/config verification.
- One original DeepSeek success remains3457tokens/USD0.00099012. No extra Provider request, Source/Task/Attempt or canonical object was created. Same immutable raw/completion retained; Native Results and cold recovery remain unverified.
- Local repair: pass owning Catalog pool to bootstrap, fail closed on explicitly selected recovery load failure, enforce anchored atomic HOST/OPERATOR startup claims before Auth/DB/Catalog reads, and bind closure to the sealed approved mount target. Final combined review/build pending.
- Any further real attempt needs a fixed reviewed image and bounded read authorization accounting for the unknown restart consumption; no activation or business reads meanwhile.

Historical execution receipts are preserved separately from successful rollback receipts. This is not a runtime or Admission PASS.
