# Continuous activation — Native P4 compatible precondition

Status: LOCAL_PASS / NO_BLOCKER / OWNER_COMPATIBILITY_APPROVAL_REQUIRED. No Hosted activation.

Original Owner-approved packet091fb547 explicitly stops on drift and is not rebase permission. Native subsequently obtained separate Owner approval776c98f0 and installed its exact P4 package5eb86f885e799d8fd77c736fb5c189d54b73f2e9e274519154f21d73f3453e35. It changes the shared read-state definition c8d64a12edd7e92a738a536e34071fb4→f1378cb07c1f1882651a558dbe612909 by adding only its narrow MANUAL/P4/SET_RENTAL_DETAILS arm; the Source arm is unchanged. We preserve this accepted Native change.

## Requested exact delta

Accept f1378cb07c1f1882651a558dbe612909 as the activation CAS precondition. New file `CONTINUOUS_POLICY_ACTIVATE_NATIVE_P4_CANDIDATE.sql`, SHA256 `624c7c933064c4be8dedebf472ba6479e4a505abf892c8c98ab938707e95ff9b`. Its bytes equal the original activation except that one hash. No function installation/replacement, role, RLS, GRANT, Schema, Actor/Trip, family, command, input, airport, Provider or budget change.

All original conditions remain: DEV tuqigdxrvrerfewsxqgm / otr-dev-backend; Synthetic QA Account f4b059c5-8241-4ffb-aa15-37fa25474543 / Trip825f79b2-4a9d-4535-a62e-43000ca50c4a; P1/P3/P4/P6 minimums, P5 TRAIN, P2 Sparse existing AKL/CHC on2026-11-02; normal explicit user decision and owning Source/Plan/Admission/Core; expiry2026-11-01T08:48:56Z. Other five protected function hashes, dormant registry CAS, policy-closed CAS and duplicate-activation rejection unchanged. Fresh normal QA read/identity/health/Provider and close readiness remain mandatory; this approval does not bypass them.

## Close / rollback

Use unchanged `CONTINUOUS_POLICY_CLOSE_CANDIDATE.sql`, SHA256 ea7c0d33d0d244ec34e9c9b752e8ee68933fe2faf70b04d768e1e7a6440d0df6. It clears only this scope/Save flag and disables the same two airports; independently read back CLOSED. Absolute SQL expiry rejects new Save even if process fails. Keep current compatible healthy image and all accepted Items/receipts/Source/originals. No function rollback is required to close. Old six-function reverse package must reject f1378 and MUST NOT be adapted/run over Native P4; any later function rollback requires separate unique-Writer reconciliation and no unfinished accepted Source.

## Validation

Existing isolated network-none/256MiB/1CPU PG,16 checks and one full Source integration test PASS: install approved Native P4 over continuous default-CLOSED postimage; unchanged OID/Owner/ACL; old activation FAIL; single-hash compatible activation PASS; repeat activation denied; idempotent close/foreign-scope denial; fresh-identity Sparse Source→Plan→Admission→Core→closed journal recovery/replay. Original P1–P6 Golden Slices not rerun. Independent fixed-diff review NO_BLOCKER; approval requirement confirmed. Evidence script `scripts/import-workbench/universal-continuous-native-p4-sql-acceptance.py`; private log `/private/tmp/otr-universal-product-preflight/native-p4-continuous-pg.log`. No Hosted SQL executed by this compatibility work.
