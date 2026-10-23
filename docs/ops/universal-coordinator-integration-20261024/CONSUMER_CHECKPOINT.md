# Existing Task discovery and Native consumer checkpoint

LOCAL_CONTRACT_PASS; independent Review pending. No real DEV, Provider call or Native UI installation.

The actual private finite Host exposes only its already-bootstrapped Task identity after normal Auth, current Source hash and Task fence checks. A missing Host remains unavailable; Native never creates an identity to fill the gap. New GET base route is read-only; existing POST and result GET are unchanged.

Native reuses the existing authenticated/bounded API client and normal token provider. Frozen enriched candidate fields, temporary IDs, readiness, Evidence, Booking/Ticket observations and optional unsupported-Core observations are retained. Results must map to every accepted C3 input and exact original hash. Selected Trip prior is merely a query hint and must match the independently authorized Backend binding; unassigned context remains unavailable.

Existing result lookup precedes the initial explicit dispatch. Reopen recovery never sends POST. An uncertain send remains read-only on subsequent attempts; existing Backend Task/idempotency still owns retry safety. Source/Provider/Profile gates and all formal Review/Admission remain unchanged.

Evidence: 30 checks across actual Backend boundary, actual frozen-output→Native transport, Account switch and consumer original/replay tests; typecheck, UI guard and scoped lint PASS. Auth/Provider in those tests are explicitly synthetic. Initial wire test correctly caught omitted enriched fields; consumer schema was corrected to preserve them, then the tests passed. No evidence claim is made for actual Apple/AD5, new DEV deployment, real model interpretation or formal admission.

Remaining same-line work: serially integrate reviewed Source/custody fixes, mount the owning original Source registration port, connect targeted Source queue and this consumer to existing CP-UX-02 Progress/Results; obtain exact SQL/deployment/Provider Gate before real remote execution. People intake a7282e4 changes no Writer scope or authority.
