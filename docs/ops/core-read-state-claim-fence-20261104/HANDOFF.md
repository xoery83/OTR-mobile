# Normal Core write / Claim read-state fence repair

Request: `AUTH-C04-NORMAL-P1-42501-20261104-01`.
Source baseline: main `bb7373e9`. This package is a local source/install candidate, **not Hosted installation authority**.

## Actual evidence and smallest repair

Auth's fixed `ddeaaa62` retains the original P1 intent and 503 `COMMAND/OTHER/42501`; original Operation remains UNKNOWN. Root2's private metadata confirms `trip_core_finite_read_state_guard()` OID65713 is invoker and calls postgres-only `trip_member_claim_read_state_allowed(uuid)` OID67419 in its first compound IF. PostgreSQL initializes/checks that helper expression before the condition can short-circuit for an ordinary writer.

An actual Gateway LOGIN → SET writer → read_state INSERT ON CONFLICT in owned PG reproduces `permission denied for function trip_member_claim_read_state_allowed`, context guard line5. The repair only nests the unchanged Claim predicate under its original postgres/session outer IF. All ordinary, Guest, finite, Source and transition constraints remain byte-preserved. No new EXECUTE or other GRANT; the Claim helper remains inaccessible to writer.

The earlier Guest `mutation_allowed()` missing-GRANT hypothesis was disproved by actual schema/EXECUTE metadata; no permission change is proposed.

## Qualified verification

- Original command bytes: current schema and pure-domain P1 application pass with synthetic Actors. Not a Hosted authorization claim.
- Private exact current guard/helper, real finite+sustained predicates, actual Gateway LOGIN, synthetic normal Owner/v2 provenance/read_state: old guard fails; corrected upsert succeeds; foreign Actor still fails closed.
- OID/Owner/ACL/config/security unchanged. Test transactions leave read_state unchanged. Exact reverse restores prior denial. No positive authorization stubs; Guest scopes are deny-only seams.
- Generated install and reverse SQL tested with only production OIDs rebound to the owned fixture OIDs; intentionally wrong preimage aborts the transaction. Production packet keeps OIDs65713/67419.
- Independent guard and generator reviews: NO_BLOCKER; fixed receipts in this directory. Raw function definitions stay private, never committed.

This proves a deterministic current normal-write blocker and its focused correction. It does **not** prove the original Hosted request reached this exact stage, full Item+Receipt Save, Native acceptance or concurrent Claim/Revoke E2E. No full Core/Import audit or historical Golden Slice rerun.

## Generate / independently verify the private packet

Use Root2's exact private `function-65713.private.sql` preimage:

```sh
python3 scripts/trip/core-read-state-claim-fence-repair.py --preimage <private-preimage> --output-dir <private-packet-directory>
```

The generator is offline only. It requires exact before SHA, mechanical anchors and exact after SHA; changed input rejects. SQL is BEGIN → metadata/definition CAS → one CREATE OR REPLACE → post-CAS → COMMIT. No table/role/permission/business mutations.

- Guard definition SHA: `5e7decd9c757920210013bf7de8004f7ef13945414f1580a18c6dfefea3f921d` → `15fb16411839879cb85995df484b24f71dacd1d287f491e020fc7a397ad74c97`.
- Unchanged Claim helper definition SHA: `e2b8d26256bdb6bd5a74918a55f43d7d3436a172ed7fcc11076f19e16af3f8fd`.
- INSTALL SHA: `9300320f3bfa8a49ea26d2466eb940a154e8d8aff827cdb081f64549f2a22990`.
- ROLLBACK SHA: `8204912d7217ec3a93ab1a341ff00250ad68676fc16f2b9dd1ed7ebf58c8f391`.

Optional reproduction (do not repeat unless source/dependency changed): render to `<artifacts>/fixed-packet`, then `python3 scripts/trip/core-read-state-claim-fence-isolated-pg.py --preimages <Root2-private-directory> --artifacts <artifacts>`. Uses existing pinned Docker image, network none, 256MiB/1CPU; removes only its owned random container. Do not target Hosted.

## Root2 exact protected installation boundary / return trigger

Only original DEV project `tuqigdxrvrerfewsxqgm`. Root2 independently verifies actual project/DB/service, fresh exact function preimages/metadata, shared SQL Writer and absence of intersecting protected operation. No image deployment, credential/role/Schema/RLS/GRANT changes or capability activation is needed. This new protected function body still needs its own precise approval; historical installation approval is not re-used.

Install only this one function transaction, then independently read back same OID, Owner, ACL, config/invoker, new definition SHA and unchanged private helper/writer-EXEC=false. Unexpected metadata or authority changes abort/rollback. Rollback is the exact reverse CAS transaction, under a quiesced intersecting writer; no accepted Item/Receipt/state is deleted or overwritten. It restores the old software failure, not business data.

Return fixed install/close/readback receipt to Auth. Auth owns normal consumer verification and existing sessions. Original `f5e13639-4240-4817-bf43-c60a1ea46361` must first be read through its existing receipt/Item path; absence/404 is not NoCommit. This package does not authorize POST replay, replacement identity, new Gate/window or a new business write.
