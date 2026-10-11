# DEV Catalog Reader credential policy

Owner authorization: 2026-10-11. Applies only to the fixed Catalog Reader in
Supabase DEV project `tuqigdxrvrerfewsxqgm`; Production policy is unchanged.

- Validity is 90 days from credential creation. The mandatory day-14 rotation is
  removed. Rotate immediately upon suspected compromise.
- Notify the Owner 14 days before expiry. Custody records `created_at`, `expiry`
  and `remind_by = expiry - 14 days`; no mandatory `rotate_by` deadline.
- Preserve the fixed principal, SCRAM, connection limit1, accepted ACL and
  emergency disable. An expiry-only adjustment never generates a password,
  changes LOGIN/ACL, or terminates healthy sessions.
- Verify exact existing Hosted state and private custody before adjustment. Stop
  on disagreement. The existing atomic custody journal records UNKNOWN before
  DDL and APPLIED only after committed expiry readback. Never replay UNKNOWN
  without observing actual state.
- The Backend reads only a private root-owned, group999, mode0440, single-link
  file mounted read-only from host tmpfs. Passwords never enter Git, Docker
  environment, argv, public configuration, logs or diagnostic output. Runtime
  retirement follows expiry; long Node timers rearm within the platform limit.

This Owner decision supersedes the DEV <=30-day/day14 lifecycle described in
historical R3-A3B reports; those reports remain historical evidence.

The existing credential was created at **2026-10-11T02:03:36.084144Z** (the original
provisioning input was creation +28 days, confirmed against the accepted expiry).
Its approved expiry is **2027-01-09T02:03:36.084144Z** and remind-by is
**2026-12-26T02:03:36.084144Z**. The app reminder is scheduled for that date at
15:03:36 Pacific/Auckland (02:03:36 UTC).

Hosted readback: ACTIVE/APPLIED, same password artifact, accepted ACL fingerprint
unchanged, fixed Reader login over verified TLS1.3/SCRAM PASS, connection limit1,
zero final Reader sessions. No existing sessions were terminated.

The renewed R3-A5 live probe confirmed a cold Direct Primary connection timeout
at 1003ms before lease acquisition. The Driver checkout limit is now 3000ms,
within the unchanged 5000ms overall request deadline. Pool max1, fixed Reader,
verified TLS, exact same-lease SQL sequence and uncertain-socket retirement remain
unchanged. This narrow transport correction is required for actual DEV reads.
