# Native abort/deadline repair — focused review

Fixed `9aab88460b6238e96a9ad9df941bddfdc281cfbc`: **PASS LOCAL/L2**, no P0/P1/P2 finding. Independent27 tests /3 files PASS.

Internal first terminal reason now survives Native discarded signal.reason/undefined fetch rejection. Deadline/cancellation, late response exclusion and Account fence remain failclosed. Normal Core18s response succeeds,60s timeout rejects. Only3 normal Core transport instances use60s; global/Source15s, response limits, existing5-minute claim lease, backoff and permissions remain unchanged.

Precise reporting: runP1 transport also contains its existing submit POST; its instance-level60s applies to all methods, not GET only. No mutation route/authority/retry was added.

No DEV/GUI operation. Root actual AD5 recovery and server readback remain separate acceptance evidence.
