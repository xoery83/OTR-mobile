# Dormant one-shot Reader credential Builder

Status: Owner authorized Builder only; Independent Security Review required.

Keep the accepted SQL Principal and Backend Driver. Reuse bound transaction-local
settings and a fixed anonymous DO; add explicit cancellation handling and checked,
transaction-local diagnostic suppression. A small Python/libpq fixture module
discards result/connection error text and notices at the native boundary, including
before authentication. It has no Hosted endpoint, CLI, runtime caller or deployment.
Python stdlib supplies root-private atomic custody, Linux dumpability/core controls
and a durable UNKNOWN journal. libpq is a deployment prerequisite requiring review,
not a new application package or credential service.

UNKNOWN blocks mutation retries. Authorized role-state observation plus candidate
SCRAM authentication reconcile a committed attempt; otherwise explicit emergency
disable is required. Rotation fences LOGIN, terminates and observes old sessions
before the password change. Disable removes LOGIN/password and terminates sessions;
finite expiry metadata remains because ALTER ROLE does not accept VALID UNTIL NULL.
No system-catalog update or shared ACL change is introduced.

Privileged transient memory, PANIC/server dumps and database verifier/WAL/backup
custody remain security boundaries. Synthetic PASS is not Hosted build equivalence.
See the [Builder report](../architecture/OTR_PLATFORM_R3A3B_HARDENED_PROVISIONING_BUILDER_REPORT.md)
for measured results, exact handoff requirements and closed activation gates.

## F1/F2 correction checkpoint

Owner authorized targeted correction after the independent review. Preserve the
existing private staging/atomic rename mechanism; explicitly recover checked stale
journal staging with durable restricted hash/length evidence and validate canonical
journal schema. Do not archive arbitrary malformed plaintext. Emergency disable
uses verified fixture project/administrator/Reader observation, not journal authority.
Retire all actual tool-owned secret names (candidate, candidate.new, active) before
DORMANT; unsafe or unsuccessful cleanup is CUSTODY_INCOMPLETE. No glob or unrelated
credential deletion. Actual role state gates recovery; uncertain mutation/promotion
remains UNKNOWN. This adds no Hosted activation or wider credential framework.

## F3 fail-closed custody checkpoint

Owner selected a strict bounded metadata allowlist; reject unknown/unsafe entries
without opening their contents or deleting them. Preserve checked hash-only journal
history. Local history failure cannot prevent independently authorized database
revocation/session retirement. Existing advisory locking cannot exclude an
uncooperative privileged writer, so even a clean inventory returns UNAVAILABLE
and retains CUSTODY_INCOMPLETE, never complete DORMANT. This intentionally blocks
complete-custody acceptance rather than introducing a filesystem or secret service.
Targeted independent recheck and a separate Owner decision remain required.
