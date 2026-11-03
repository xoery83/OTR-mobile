# DF-C02 — D1/D2 first local repair

A current qualified Day read was needlessly delayed by `readTripJourneySnapshot`, which is auxiliary Home data. Two actual TripScreen caller regressions reproduced the empty initial feed and stale feed after formal sync-completion notification while that summary remained pending. Existing `setTrip`/`setStatus` now execute before the summary await, after unchanged reader and metadata latest-request/account checks. Home summary still validates Account/Trip/generation/epoch and consumers reject mismatch.

This is a local UI-to-existing-Reader reliability closure, not new Cloud latency, device or whole-package qualification. No Repository/Queue/Receipt/UNKNOWN/ACL/version algorithm changes. The optional summary may still be slow; it cannot hold the Day result hostage. Local focus may restart its load on initial account binding; old request results remain rejected.

Root1 request NATIVE-DF-C02-SOURCE-20261104-01: integrate only TripScreen.tsx and its existing caller test diff relative to7d7c086e; retain all current main/Auth/Import changes. Do not merge the long Native branch or assume FORM-C03 is a dependency: these two files are independent of that consumer. Actual-main affected regression, independent review and existing permissions govern release. Root2/Provider not required. Revert ordering if a real UI regression appears; no data rollback required.

Remaining: existing-app device proof after safe Claim, actual latest-main install, authorized two-account/Revoke scenarios. Private Realtime is Post-Beta and stays closed, not a D1-D3 prerequisite. Existing Manual Cloud and Synch Reliability receipts are reused as approved evidence, not mechanically repeated.
