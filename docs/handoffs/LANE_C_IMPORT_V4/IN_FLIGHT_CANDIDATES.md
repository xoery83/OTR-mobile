# Import V4 — in-flight candidates

Freeze: **2026-11-03 09:23:05 UTC / 22:23:05 NZDT**. Base: remote main
`b16c2d932ce602e86db83796eefe20d94b215aed`, as fixed by Root. Owner has stopped
this lane's business coding/execution. This document is read-only inventory, not
an execution approval. Preserve all worktrees, original materials, receipts and
UNKNOWN records; do not reset, clean, merge long branches or manufacture new IDs.

## Not on main: preserve, do not execute

| Candidate | Fixed source / worktree | Exact change and evidence | Next minimum action |
|---|---|---|---|
| PNG current-default compatibility | `b9613bc7a3b7c983d6fc9416c432f51e23a842dc`; `/Users/xoery/Project/otr-mobile-import/png-runtime-compat-20261103`; branch `codex/png-runtime-compat-20261103` | Three deploy-script CAS constants only: default CID `0c723…`, image `68aa…`, config `eb99…`; finite expiry logic/QA/close helpers unchanged. Five local tests PASS. `sourceT/sourceD=null`; no deployment or window started. | Preserve current packet. Fresh explicit Owner authorization for the receiving Agent is required; after that, separately recheck actual default/CAS and dependent controls. Do not run the old command index on handoff authority. |
| Normal Auth verify-only adapter | `020112a525924cbd50a0efc88fda4753e02c3f8a`; `/Users/xoery/Project/otr-mobile-import/import-normal-auth-receipt-20261103`; branch `codex/import-normal-auth-receipt-20261103` | Existing Host f4 session `/user` GET only; seven safe binder fields. No refresh/new session/Vault write. Seven local mock checks PASS; independent NO_BLOCKER below. This code does not renew Source/Provider/CP14 authority. | Preserve and review as an input-verification adapter. Do not reuse its receipt past expiry or treat a normal-session receipt as a business grant. |
| Combined renewal / PNG subset / timers / binders | Fixed parent packet `94a296bdb63527a705227c1ac2dffa74217dad26`, gate SHA `deb543e5418967116df87aef22db5f4b91e0f385ed453fb4636c5c8d487f13b2`; stable packet tree `/Users/xoery/Project/otr-mobile-import/import-unified-renewal-20261103`, HEAD `c4b15fa79ffc6f067e2e45d8e41cd5b01f10b52e` | Default-closed local preparation: Source deadline CAS, exact subquotas, Provider/management close, local SQL + remote close ports, actual-process timer qualification, typed five-command binder. **No renewal controller was armed/clocked/executed against Hosted business authority.** Historical worker/close software on Host is not proof this packet ran. | Inventory dependencies, not a whole-branch merge. Obtain a fresh Owner decision for the new execution owner before binding any T/D, issuing contexts, deploying finite runtime or opening authority. |

### Candidate file lists

Paths below are relative to their named candidate worktree.

`b9613bc7` changes exactly:

- `docs/ops/import-unified-renewal-20261103/control/renewal/deploy_finite_png_runtime.py`
- `docs/ops/import-unified-renewal-20261103/control/renewal/test_deploy_finite_png_runtime.py`
- `docs/ops/import-unified-renewal-20261103/PNG_RUNTIME_DEFAULT_COMPATIBILITY.json`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`

Deploy script SHA256: `84aab577697fc9190f64a6bc24f522c899325a0ce00176a893e562a2846d4e06`.
Compatibility manifest SHA256: `2dc62e8815cda9c62f93a39b150fb11102e182d98a521e65c7c0863b809f38a1`.
Required existing Host `release.py` SHA256:
`9934113f8a4996a1650de27d593aec063d9bdecc5970de39eb6b8ffb2c8e7543`.

`020112a5` changes exactly:

- `docs/ops/import-unified-renewal-20261103/control/renewal/normal_auth_receipt.py`
- `docs/ops/import-unified-renewal-20261103/control/renewal/test_normal_auth_receipt.py`
- same directory `NORMAL_AUTH_RECEIPT.md` and `FIRST_PNG_COMMAND_INDEX.md`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`

Verifier SHA256: `a4cdeb13f427021ae63f35a198b61ca5de6c911401850dfacf9f29a78d94075a`.
The index is a prepared port index, **not an approved or bound run plan**.

### Dependency chain: no new infrastructure required

The packet's preparation/dependency history includes the following. Normal Auth
verification/refresh and ordinary restrictive-fence software operations are
separate actual facts; none is renewal Source/Provider activation:

| Function | Fixed commit(s) / owning files under `docs/ops/import-unified-renewal-20261103/control/` |
|---|---|
| Narrow PNG-only SQL/normal close | `635645d2`; `source_cas_candidate.py`, `current_binary_close_ports.py` |
| Typed Provider price/scope/request contexts | `d9824f62`; `renewal/bind_five.py`, existing `renewal/p3-form-provider-operator.mjs` |
| Real callback / timer / latest-revision reads | `547cea46`, `6799e055`, `90758598`; `png_source_provider_callback.py`, `png_timer_entry.py`, `png_root_timer_ports.py` |
| Reject management principal/CLI absence | `37a963d7`; `png_timer_entry.py` |
| Existing CP14 maintenance OPEN/close composition | `112aa179`; `renewal/maintenance_open.py`, `p3_close_candidate.py` |
| Local management SQL + fixed remote close | `c4b15fa7`; `local_management_ports.py`, existing Root ports/entry; no management secret copied to Host |
| Finite PNG runtime deploy / bounded rollback | `6680befe`, `989c2fe3`; `renewal/deploy_finite_png_runtime.py`; compatibility successors `6c46f794`, then `b9613bc7` |
| Same-session refresh safety, separate from verification/authority | `f2332ec7`, corrected `3cf8fc44`; `renewal/refresh_existing_qa_session.py`; durable UNKNOWN claim protects against repeating a consumed refresh token. Root's same-Host normal refresh/GET occurred, but did not renew Source/Provider rights. |

These commits are preparation history, not a list of work to rerun. The earlier
same-CID fence restart was superseded: immutable env still pinned the old file hash.
The restrictive fence subsequently existed on the default runtime. That ordinary
software operation did **not** activate the unused renewal packet.

## Independent review receipts

| Subject | Fixed review / limit |
|---|---|
| Conditional combined gate `94a296bd` | `/private/tmp/otr-import-unified-renewal-review-20261103/REVIEW.json`; SHA `23c93b1c11895b7572f8d290e12e754a3591f44fd24f857c716e77ce3b697bae`; archived by `bd34bc2c` in packet `INDEPENDENT_REVIEW.json`. NO_BLOCKER to one conditional Owner decision; never a Host/timer/identity qualification. |
| PNG-only `635645d2` | `/private/tmp/otr-import-png-only-review-20261103/REVIEW.json`; SHA `4721877d4ef9a73de04c44af65b2a8f5b32ce7c64018c6e4f3b2e08b377815ed`. |
| Finite deploy corrected body `989c2fe3` | `/private/tmp/otr-import-finite-png-deploy-review-20261103/REVIEW.json`; SHA `c22c3d97c1d173c63e692d00214559a1758545b26fb878950422a3db1b059e15`. Exact earlier body reviewed; this is **not** a separate signature for the later `b9613bc7` CAS values. Later values are supported by Root default readback + five local tests; separate final-CAS review was not located in this document's evidence. |
| Real timer ports + latest-row correction | `/private/tmp/otr-import-root-timer-review-20261103/REVIEW.json`; SHA `ff2adff289847254b4a45ad3d66cc3106b1cf44fbe2d93eafee009cfe3d49c39`. Local code review, actual timer arm/physical close NOT_RUN. |
| Verify-only `020112a5` | `/private/tmp/otr-import-normal-auth-verify-review-20261103/REVIEW.json`; SHA `c6d56b23973f3408e1f8f28f0afd835667f43e707b8f812086daec8c10219632`. Existing helper is executed as a named definitions module, not `__main__`; export does not call old refresh `run`. |

`/private/tmp` receipts are existing preservation locations, not new durable
services. Keep them until Root has copied their safe evidence into the final
archive; do not copy private credential files or raw function bodies into public docs.

## Main and push facts at freeze

No network/fetch/push was performed for this inventory. Local remote-tracking
`origin/main` is the stated `b16c2d93` base. Neither b961 nor020 is contained in
that main; no locally known remote-tracking branch contains either exact commit.
**Actual remote branch push status is UNKNOWN**, not asserted absent.
`origin/main...b961` is56 main-only/20 candidate-only commits;020 is56/21.
Therefore do not merge either long branch wholesale or overwrite main from it.
Inspect the fixed incremental files plus their unmerged packet dependencies.

Already integrated; not in-flight business delivery:

| Original | Main mapping and exact-blob check |
|---|---|
| Documents inventory fence `2732aa908aff8fdafbfac9851a82f0a06a9f1a33` | `38584ac9`, review `0a3e6fce`, smoke `79518bbe`; both product/test blobs match b16 main.32 local checks; no Native acceptance claimed. |
| P3 UNKNOWN advisory `d54ff3808df247d5379d988b1d7d145507c72dfb` | `6ad512c5`, review `4aa78c0c`, smoke `5aa322a2`; all three product/test blobs match b16 main. Exact empty UNKNOWN path only; not a new model/Save PASS. |
| Root Auth resume `7c7c0dab8048e542b445238b14f41ad15b35f650` | Main `e2821670` + Auth `ff08dedf`/source411 and smoke `b16c2d93`. **Not Import-owned and not transferred.** Root/Auth retain its execution Gate, normal A/B sessions and consumed-window/UNKNOWN obligations. No use as Import authority. |

## Freeze boundary

Root reports at09:23:05UTC: AD5 contains only a selected PNG draft, **not Submit**;
no new Batch/Source/Task/paid call was created by this preparation. The unused94a
conditional approval is not delegated to the receiving Agent. The next Agent may
read/plan under the new handoff, but must obtain Owner's new execution authorization
before any business activation, Provider use or mutation. See
[PROVIDER_AUTHORIZATION.md](PROVIDER_AUTHORIZATION.md).

## Final remote and preservation check

Fresh `git ls-remote origin` for main and the three named candidate branches returned only main b16c2d93. Thus no matching named remote branches were observed; publication/reachability through other refs remains UNKNOWN. `evidence/CANDIDATE_INVENTORY.json` records exact incremental file lists, packet files different from main, worktree status and ahead/behind for all three active unmerged candidates. No whole-branch merge is proposed. Current activity/Updates/Docs/P3 product fixes are already main; current-device acceptance is separate. JPEG/HEIC/multi-image/Voice/Import-created-Trip/Ledger AI have no separately qualified delivery candidate in this freeze inventory; they remain Beta queue targets, not missing proofs to invent. Historical private branches are preservation evidence, not candidates to push or merge.
