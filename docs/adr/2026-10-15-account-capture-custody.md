# Account-owned Capture original custody

Status: isolated candidate under the Owner's C1–C6 R0/R1 authorization.

Reuse the accepted Input UUID as private custody reservation/reference. Its existing
Account/Batch/Job/Capture/payload/revision/hash/length tuple remains the identity;
no Source or Trip is allocated. A strict immutable Capture association in the
existing anchored custody root is installed only after exact original put/verify
in the existing private `trip-source-material` DEV Storage bucket. Capture bytes
never enter the Linux material store. A single opaque binary adapter reuses the
existing fixed-origin/credential-injection/no-upsert pattern, without PDF parsing.
Deterministic `capture/<Account>/<Input>` keys preserve original bytes and scope.
Reads require that association, not an arbitrary material reference. Interrupted
installation withholds reads; exact same-ID PUT safely completes registration.
Atomic link/exact-replay primitives fence collisions and concurrent registration.

Mobile reads accepted CP11 originals through repositories, outside network I/O,
and fences every asynchronous phase with the original Account generation. Unknown
PUT outcomes recover by same-binding GET/PUT, never new identity. No local remote
success flag or new table is needed. Media signature checks are byte-container
checks, not semantic verification. No normalization or content is logged.

Explicit PUT/GET uses existing Auth and bounded streaming. Default composition has
no injected custody port. No SQL, role, migration, second byte store, scheduler,
Trip Source admission, Provider or runtime activation is introduced. Actual private
custody provisioning/deployment is separate. Release remains CLOSED.
