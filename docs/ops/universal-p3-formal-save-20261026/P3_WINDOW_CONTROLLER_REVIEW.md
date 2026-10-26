# P3 prepared window controller — independent review

/root/p1_source_review_independent read-only NO_BLOCKER. Not an arm permit.

Local arm/activate require ownerApproved=true and exact Gate200ef78c receipt (currently absent). SQL package hashes checked. Arm reads already-armed remote deadline, requires600..900seconds remaining and fixes closeAt=deadline-240. Activate uses that exact UTC deadline, reserved cleanup time, claimed independent closer, exclusive activation file and close lock; closed windows cannot reopen. Close runs exact SQL, independently reads false/null and verifies remote default-off rollback before recording success. Cleanup failures remain RECONCILE_REQUIRED with bounded attempts.

Remote arm is exclusive,900second independent rollback, no accept path. Deadline mode is read-only. Swap/rollback retain exact container/image/config/mount hashes, only known created HostConfig null→false normalization; no business deletion. Existing SqlTransport linked DEV tree reused, no new identity/secret access.

Self-test PASS, no network: idempotent closure and closed-window activation refusal. Before real arm: Owner receipt, script/package hashes, actual healthy runtime plan/manifest and independent watchdog readiness required. No controller or business window has been armed.
