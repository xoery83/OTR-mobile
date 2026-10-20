# Receipt upload dependency scheduling

Status: Accepted for the user-authorized receipt scheduling fix, 2026-10-05.

LINK_RECEIPT uses ledger_asset_operations.dependency_operation_id to reference
its same-account, same-asset UPLOAD_RECEIPT. The existing asset status constraint
is retained: PENDING + DEPENDENCY denotes waiting; FAILED + DEPENDENCY denotes
an upstream terminal failure. Neither consumes retry attempts. Runtime upload
readiness remains a second guard. Missing upload evidence stays non-dispatchable.

Repository eligibility and claim both enforce dependency readiness. Completing
an upload atomically releases dependency waits and narrowly identified legacy
"Receipt upload must complete first." failures. Actual LINK network failures
keep their original backoff. Existing operation IDs, keys and retry history stay
intact. The receipt coordinator drains newly eligible work in the same cycle;
the existing queue wake signal handles concurrently running cycles. Restart
reconciles waits from durable state. Failed upstream uploads block downstream
work; successful recovery releases the original downstream operation.

No schema migration, second scheduler, global retry change, auth change, UI
change, backend change or Production access is required.
