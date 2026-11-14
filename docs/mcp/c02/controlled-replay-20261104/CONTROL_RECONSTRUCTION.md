# Reconstructed normal-control entry (local only)

Original626e96ac source was lost and Auth confirmed NOT_RETAINED. This replacement
is new source, with its own hash and review; it does not inherit original qualification.
It calls the same pinned Auth withRegisteredQaHostSession helper. No new Auth,
Principal, OAuth implementation or business API is introduced.

The approved launcher is static/c02-normal-control.py, not a direct invocation of
the .mts file. It verifies actual new human-source binding, Gate, Scope/resource
eligibility and owning dependency pins before opening a fresh normal own QA session.
Root2 must inspect current actual authorization independently; no synthetic fixture,
old GET approval, model answer or this document is authority.

Control directory is the exact fresh /private/tmp/otr-auth-consumer-control-c02-
c2d7c9bc03cb413ca7d082ccf8338f0c (one uninterrupted path without the line break).
The entry creates it exclusively, owner-only0700. Safe, exclusive0600 status-N.json
files report CONTROL_READY, GRANT_ABSENT_VERIFIED, then OWN_SESSION_CLEANUP_PASS.
Root2/MCP must read the current files; historical metadata is not readiness.

REVOKE and FINISH are owner-created regular0600 single-link files with <=64 bytes.
No symlinks are accepted. REVOKE checks fixed Client835 grant absence, sends at most
one DELETE if present, then reads back absence. FINISH reconciles the grant first
and exits into the owning Auth Session cleanup. Unknown GET/DELETE never blindly
retries; owning Auth still attempts its own Session cleanup. Failed cleanup must be
reported from the owning journal and independently reconciled by the lawful owner.

The35minute monotonic control cap starts before owning Auth login; waiting ends
at33minutes with two minutes reserved for grant/Session cleanup, not an extension of
the separate immutable30minute business deadline. Root2 watchdog/Issuer/runtime
closure is independent and mandatory. No access token/OTP/session/HTTP body or
private input is emitted in status files. The control has no business Trip API.

Actual offline checks:12 lifecycle cases exercise absent/present grant, unknown
DELETE, visible-after-DELETE, rejected/malformed GET including non-UUID IDs, uppercase selected-client matching, wrong identity/client before
IO deadline cleanup and exhausted-setup rejection before READY. They use no actual Auth/credentials/session/network.
