# Universal closure/watchdog — bounded independent review

Fixed `168a0a5e85e708fe7dafdb4eaa969d9e57c6d472`: **HOLD — one P2 single-close race.** No P0/P1 finding.

## P2_UNIVERSAL_CLOSE_01 — separate claims allow duplicate closure

`universal_watchdog.py:49,57,83–95`: standalone close exclusively creates `manual-close-claimed.json`, while the watcher exclusively creates `watch-claimed.json`; neither execution path shares an execution claim. After a manual claim exists (possibly during its SQL/restore), the watcher still claims and invokes closure again. Independent local reproduction confirms both claims and a second closer invocation. Thus concurrent manual close/arm or watch can repeat management writes after an uncertain first attempt, despite the advertised once-only contract. Exact SQL/role/window checks and runtime lock/idempotency reduce impact but do not enforce a single attempt.

Use one exclusive execution claim before every non-recovery closer; keep watcher registration/heartbeat separate if needed. The loser must not perform SQL/runtime mutation. Add manual→watch and reverse interleaving tests; recovery remains explicitly read-only for SQL.

## Evidence / correct boundaries

13 existing unit tests and 7 actual network-none PostgreSQL checks independently PASS. Actual detached watcher survives parent termination and closes isolated scope rows/role session at expiry. Exact foreign-scope/role expiry refusal, lost-COMMIT independent readback, no SQL retry, global Gate preservation pass. Runtime/SSH/filesystem restoration is simulated separately; exact same-image baseline/Trip mount preservation, response loss, drift rejection and idempotent recovery pass. Private hashes/paths and prepare default remain bounded.

No DEV, Provider, Native or actual remote restore. Real C3 pins, current service preimages and final Gate/window still required. Original findings/receipts retained; product trees unchanged.
