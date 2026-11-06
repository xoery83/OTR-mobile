# C01 V2 PG fence evidence

Base observer SHA256 `de8aeb73a442bf49d79d305b99a44094e69e5c97230088e8d094329a38694197` from aperture V2 packet `43e38b99`. This patch tightens the separately pinned `owningActivityReader` result consumed by the existing Host phase observer.

Use the existing execution, lease, plan, phase, timestamp and request watermark envelope. Supply `legacyPGFence` with these exact fields:

| Field | Meaning |
| --- | --- |
| `roleMatrixSHA256` | Digest of the pinned direct and applicable pool routes and their effective role and function or table privilege facts. Derive from the actual controlled routes, including retained physical assignment, fresh checkout and transaction recheckout. |
| `controlSHA256` | Digest of exact effective PG exclusion and reversible control state. Derive from applied, read-back controls under the same Writer. |
| `pdfPinsSHA256` | Digest of the two original V4 operation and attempt identities, generation and unchanged protected state. |
| `directSource`, `directModelTask`, `heldPool`, `freshPool`, `recheckoutPool` | `DENIED` only with effective exclusion proof for the named path. Retired held assignments require owning proof of terminal state and exclusion from reassignment. |
| `pdfA`, `pdfB` | `RECLAIM_AND_FINALIZE_DENIED` only while effective protection covers each same-ID operation, including separate FINISH reachability. |
| `noAdmittedOrPreparedWork` | Boolean true only with independent coverage of admitted work and prepared transactions. |

Set the existing `legacyPGFenceSHA256` to SHA-256 of the canonical normalized object and seal that same hash. The phase observer recomputes it. Keep raw session identities and operation detail in the restricted evidence. A change in observed coverage or effective controls blocks the phase. Keep the protected state during restore and scoped reopen. Preflight reads the pinned baseline instead. Set `activityAuthority` to `BASELINE_READ_ONLY` and preserve the same identity, freshness, launcher and protected PG/Host digest checks. Preflight carries no terminal watermark claim. Drain and all subsequent phases retain the terminal watermark, closed window and zero-activity requirements. Supply `legacyPGPreimage` with `roleMatrixSHA256`, `controlPreimageSHA256` and `pdfPinsSHA256`, plus its canonical digest in `legacyPGPreimageSHA256`. Seal that digest in `host.owningProbe.legacyPGPreimageSHA256`. It proves the baseline and action binding only. The first drain and all later observations require effective exclusion. The Root2 dispatcher still needs the exact same-Writer control action and its independent readback before drain and STOP.

The positive fixture uses synthetic facts to test only the observer contract. It cannot establish DEV role reachability, live FINISH denial or terminal activity coverage.

## Entry coverage

- `universalPrepareHttp.ts` handles Prepare and Resume on the same authenticated POST path. The accepted owning context schedules `drainTargeted`. The normal drain can recover interrupted Wake before claim. The Host fence must exclude the HTTP request before this side effect.
- `universalContinuousRuntime.ts` claims and settles an owning Wake. Provider dispatch, usage and observation retain separate ModelTask gateway authority. Held or reassigned sessions and alternate direct callers need the PG exclusion.
- `sourcePdfV4PreparationHttp.ts` separates status from Prepare, reserve, stage, dispatch, retained observation and FINISH. `sourcePdfCausalAuthority.ts` calls independent V4 execute, claim, recover-claim, recover-dispatch and FINISH functions. The actual FINISH can return a prior terminal receipt before checking its gate and can update an eligible IO_UNKNOWN operation after gate and custody checks. An absent new Task or a blocked dispatch does not prove the old FINISH is excluded.
- The exact restored FINISH definition was exercised under the Source gateway in a normal isolated transaction using one same-ID synthetic V4 UNKNOWN attempt. The closed gate returned `PDF_V4_CLOSED`. Full Operation, Attempt, stage and Representation digests matched before and after. This does not establish actual live gate state, protected pooled session behavior or Host restoration coverage.
