# QA158 C01 cutover V2 source

This source inventory preserves the reviewed V2 recovery package and the independently reviewed observer delta. `SOURCE_MANIFEST.json` pins the archive lineage, each tracked file and its byte-exact reconstruction. The `source/` directory follows the existing release layout.

Root2 binds the `@NAME@` values in `.in` files from the approved private release inputs. For private release assembly, remove the `.in` suffix and compare the reconstructed file against `restoredSHA256`. The private catalog preimage and exact function matrix are pinned separately. They remain in the private assembly with the execution plan, credentials, actual identity values, receipts and runtime state. A missing or changed source, binding or private input blocks sealing.

The observer reads `BASELINE_READ_ONLY` evidence during preflight. The drain and later phases require a fresh terminal watermark, closed window, zero admitted work and effective same-Writer PG exclusion. The protected PDF operation, attempt and generation stay bound through restore and scoped reopen. See [PG evidence contract](PG_FENCE_PROOF_CONTRACT.md).

The tracked `VERIFY_AND_ROLLBACK` template uses the existing Writer and phase evidence. Its only actions are Host fence, PG fence, Host reverse and PG reverse. It requires independent PG and original-Actor baseline readback before recording a terminal result. Root2 supplies the private release bindings and exact runtime ports. The joined dispatcher remains a separate cutover entry because a successful drain there can reach stage and STOP. Ambiguous action results leave the controls and intent available for read-only reconciliation.

The tracked roster is source only. The validation-only arm and keeper handoff, live PG forward/reverse/readback, original-Actor read and image127 first-STOP activity source remain release inputs.
