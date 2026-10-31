# Catalog cold-read budget — focused independent NO_BLOCKER

Actual normal catalog-reader principal read succeeds in5202ms, including2082ms
cold connect. Same QA projection passes current V2 contract; family counts <=33.
The old aggregate5000ms budget includes checkout up to3000ms, rejecting valid work.
Only aggregate8000ms is shared across driver, reader, Task preparation and catalog
HTTP phase. SQLstatement/query5000ms, lock1000ms, checkout3000ms, max1, verifiedTLS,
dedicated principal, cancellation, Auth/Trip each5000ms and HTTP15000ms unchanged.

107 affected driver/HTTP/Universal Host checks PASS, including measured cold-read
regression and authenticated HTTP6000ms positive; existing timeout/privacy/role
negatives retained. Independent reviewer read all6changedfiles and found NO_BLOCKER.
This is LOCAL_PASS, not updated-image DEV PASS. SourceBinding+PNG manifest actual
PASS; no Task/model created. Run2179a40d created2026-10-31T13:37:56.642791Z is now
past its10min deadline. Unpersisted Task does not authorize clock/ID reset. Retain
all Source/Run/upload/VERIFY data; new execution qualification needs precise scope.

Full root typecheck reached the explicit2GiB heap cap and exited134 (OOM); not PASS.
No larger concurrent build or repeated whole-repo check was started.
