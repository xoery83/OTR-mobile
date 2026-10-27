# Transition Watchdog and exact closure final review

Fixed `3090db64a6a6a897ddce924b723af5b43f7cead1`: **PASS for local pre-activation preparation and exact closure binding. Original P2-WATCH-01 closed.**

- Watchdog rechecks strict time<deadline after marker validation. Independently10fixedtests PASS; additional reviewer case makes marker read itself reach exactdeadline → closes once (11tests PASS). Late marker cannot preserve service.
- Exact closure7tests PASS with injected SQL/SSH only. Entry binds actual SyntheticA/cutoff/Gate, reviewed renderer/dependencies/service, ATTEMPT2 runtime image/bundle/baseline and private SQLpacket manifest/content. Only close.sql and independent verify-closed.sql execute; no install/activate or private runtime/password local read.
- Read-only validation of Root actual template succeeded (testtransitionUUID only): Actor1f65…/cutoff2026-10-24T01:41:25.160Z, ATTEMPT2 hash183b…, service04350…, threeoriginalmounts and exact SQLpacket binding. No remote call executed.
- Sequence: close exactpolicy/fourroles → independent `closed_verified=true` → reviewed restore with verified/restorationVerified/runtimeSecretsRemoved and no runtime mount destination. No second claim/retry. Any UNKNOWN/error/unverified state returns RECONCILE_REQUIRED; no false closed or business deletion.
- Root must still prepare actualtransition/closePlan, pin entry hash, start independent watcher and verify claim/livePID before role activation. This review does not mean watcher armed or actual resources closed. Successful verified beforedeadline handoff deliberately retains persistent normal service.
-0DEV/SQL/SSH/Native/GUI/deployment by Reviewer. No original failed receipt rewritten.

Evidence: FIXED_WATCHDOG_TESTS.txt, INDEPENDENT_FIXED_WATCHDOG_TESTS.txt, CLOSURE_TESTS.txt.
