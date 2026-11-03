# Root1 → Root2 Hosted Operations V4

Status: **ROOT2_HOSTED_WRITER_ACCEPTED; Hosted writes FROZEN pending MC registration and post-registration readback.**
Root2 independently verified e179481e at10:19–10:20Z, with no unexplained drift or active scoped window. See WRITER_STATE and evidence/ROOT2_READ_ONLY_VERIFIED.json. Root1 performs no further Hosted mutation.
Receiving chat: **OTR-ROOT2-HOSTED-OPS**, `01a1a0c0-bcd7-7cf0-8de0-9b8feb35d232`.
The other chat titled Root2 created that receiver; it is not a second resource owner.
No business execution, OAuth expansion, Provider spending or Production authorization is granted here.

## Fixed current state

Remote main `b16c2d932ce602e86db83796eefe20d94b215aed`.
Root1 local Auth candidate `c91a27caf51ba6ae334a81a8c1c4f59cc4bd919b` is not main or deployed.
Hosted software release `2b71f8c53c30c096e2062eb7acb002a2ff6d4b3f` is the C02 loader/main-context build; base image is the prior Auth recovery default.
The actual runtime authority is the image and bundle hashes, not a claim that every later main commit is deployed.

Fresh Root1 read-only SSH: **2026-11-03T10:13:55Z /23:13:55 NZDT**.
DEV `tuqigdxrvrerfewsxqgm`, service `otr-dev-backend`, endpoint `https://api-dev.xoery.art`.
Container `0c723151aae5f6802066d3798be6b0ee35726bbe0cb45ae57f45e699127ade3f`.
Image `sha256:68aa588ffd16f11b93e59e1fd3dafc54306dd995b2fadc476947768fbe9dd9fc`.
Health local/external OK, Auth/MCP/Enrichment selectors absent, PDF/PNG workers stopped, no OTR timers or flock holder observed.
Fresh PG `evidence/PG_CURRENT.json` fixes actual schema tail/Source hashes/policy/expired grants/admin-session count. It is READ ONLY; migration ledger is not a complete protected-function lineage.

## Package

- [RESOURCE_AND_SOURCE_INVENTORY.md](RESOURCE_AND_SOURCE_INVENTORY.md): exact service, mounts/fingerprints, build evidence, ownership.
- [ROLLBACK_AND_RESTORE.md](ROLLBACK_AND_RESTORE.md): current default versus historical fallback and safe CAS restore.
- [QUEUE_AUTHORIZATION_AND_RECOVERY.md](QUEUE_AUTHORIZATION_AND_RECOVERY.md): pending releases, consumed/unused Gates, UNKNOWN.
- [ROOT2_VERIFICATION_CHECKLIST.md](ROOT2_VERIFICATION_CHECKLIST.md): read-only reconciliation and sequenced transfer.
- `WRITER_STATE.json`: durable transfer state, not an execution capability.
- `evidence/MANIFEST.json`: file SHA256/source provenance; no env values, Secret, Token or Session copies.

Root1 keeps Core contracts/canonical ports, Schema/Migration design and review, main source integration and interface disputes.
After acceptance Root2 alone owns Hosted deploy/config/container/health/CAS/shutdown/window/rollback and approved protected SQL installation.
Business lanes remain E2E DRIs. Normal source integration is not Hosted deployment or business APPLIED.

Do not infer root access from this document. Existing machine-local authentication is not copied; Root2 must have independently permitted transport and action authority.

Root2 acceptance is fixed in `ROOT2_HOSTED_WRITER_ACCEPTED.json`, bound to Root1 release9e411ee8 and independent verificatione179. Responsibility acceptance grants no business or standing protected-action authority.
