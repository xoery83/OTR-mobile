# Expired-token wake fix — independent review

Fixed `1e079389da1a62e6cdf3074b1bbacb3fd5a87ea6`, base `ce3a44b`: **PASS (LOCAL/L2)**. No P0/P1/P2 finding.

Both normal dispatch and activity scheduling now call the existing Account-bound token provider before applying cached-session online eligibility. Persisted session is reread, Account identity is checked, and Account generation/scope are fenced around awaits. Network refresh failure pauses before queue/factory work without signing out. Explicit AUTH_REQUIRED and Account-change failures still escape. Legacy finite dispatch is unchanged; no new Auth/queue/persistence authority.

Independent 69 tests / 3 files PASS; with reviewer timer same-Account replacement and refresh-network-error-plus-generation-switch negatives: **71 PASS**. Existing token refresh and operational timer regression suites included.

No DEV/Provider/Native/GUI action. Actual AD5 expiry recovery and server receipt/readback remain Root acceptance, not replaced by these deterministic tests.
