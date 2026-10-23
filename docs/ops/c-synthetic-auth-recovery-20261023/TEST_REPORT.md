# Diagnostic validation

10 scoped Node tests PASS: four new safe diagnostic/SDK-loopback tests plus six existing authenticated loopback/SQLite/queue/recovery tests. Actual socket-loopback fixtures use fake identity responses and temporary SQLite, not real DEV accounts. Existing malformed Auth window/hash subprocess test proves zero outbound on preflight failure. New tests cover HTTP403 + allowlisted SDKcode/request ID; repeat SDK dispatch denied before wire; malicious code/header/message/body omission; network exception with consumed budget/unknown outcome; exact 200/429/503 categories and no creation inference. No vi.mock.

TypeScript and touched ESLint PASS. After the final failure-stage refinement, four diagnostics plus malformed-window/hash test were rerun; full earlier ten-test log is retained separately. Initial sandbox EPERM prevented localhost listeners; approved isolated rerun resolved it. Initial fixture lacked the Auth API version header, so SDK code was correctly absent; adding the protocol header fixed the fixture, not production authority.

No Backend deployment, remote mutation, Auth create/login, business test, Native UI or provider test was performed in this recovery. The sole real DEV action was the authorized exact A readonly SQL query. Its zero rows do not diagnose the previous HTTP failure or establish B eligibility.
