# Flight Enrichment Native checkpoint

Normal Create waits 600 ms after a valid, stable flight number/date, requires the owning capability and connectivity, and starts at most one logical query per Form flight/date identity. It cancels a scheduled dispatch on unavailable/disabled/Edit/identity change. Edit never automatically queries: Find Details is shown when airport/time/date details are missing. Fully entered flights do not offer another lookup.

All calls still go through the existing Enrichment Repository and its Auth/context/capability/request/timeout checks. No new Provider client, Usage ledger, queue, retry or Flight Save exists. Native changes do not enable an account, renew a price/scope or authorize paid work. Synthetic document-scan P2 preview suppresses the real Enrichment component.

Retained response protection: abort on teardown, request lease, monotonic draft revision, Account generation, one in-flight operation. New actual failure: Keep/Replace was gated by bytes only, so an edit-away-and-back could re-enable an old Replace. The controlled RED test actually called onApply({departureTime:"13:00"}) after restoring 12:00. Fix retains both suggestion revision and a one-use suggestion session token; stale/retired handlers cannot change the draft or resurrect a dismissed suggestion.

Validation: 2 suites / 20 tests PASS (Action + existing projection), scoped TypeScript and ESLint PASS. Includes automatic delay/once, explicit partial Edit, account change before timer, Keep/Replace, Cancel/late result, reconnect, Partial, Not Found, Ambiguous, Timeout, Offline and closed capability. No real Search/Extraction, Usage/Cost, hosted capability or device claim. Historical Host candidates remain preserved and un-deployed by this sprint. Public CachePort stays closed/MISS.

Actual RED: `/private/tmp/otr-enrichment-away-back-red.log`; green: `/private/tmp/otr-enrichment-native-sprint-tests.log`. Final batch independent review pending. Shared Backend/Provider/SQL resources remain untouched.
