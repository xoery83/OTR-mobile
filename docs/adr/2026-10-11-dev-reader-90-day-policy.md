# DEV Catalog Reader 90-day credential policy

Status: Accepted by Owner, 2026-10-11.

The existing fixed DEV Catalog Reader uses 90-day validity from original credential
creation, with immediate rotation upon suspected compromise and an Owner reminder
14 days before expiry. Mandatory day-14 rotation is removed. Production policy is
unchanged.

Reuse the accepted private custody and atomic operation journal. An expiry-only
adjustment changes only PostgreSQL VALID UNTIL and nonsecret lifecycle metadata;
it neither regenerates the password nor retires healthy sessions. Reject any
Hosted/custody disagreement before changing state.

The authorized Backend integration reads a root-owned private tmpfs file through
a read-only mount. Its runtime retires the Reader at expiry, rearming Node timers
to support the 90-day lifetime. Cold connection checkout is bounded at three
seconds within the existing five-second overall Catalog deadline after the actual
one-second connection timeout was reproduced. Fixed identity, Direct Primary TLS,
Pool max1, same-lease checks, protected Auth/Actor/Trip and all write gates remain.

Policy and actual dates: [DEV Reader policy](../architecture/OTR_DEV_CATALOG_READER_CREDENTIAL_POLICY.md).
