# Same277 continuation — local preparation, not execution authority

Status: LOCAL_PROOF_PIPELINE_QUALIFIED / DEFAULT_SOFTWARE_RELEASE_PENDING.
No new intent, window, Session, OAuth activation, trusted confirmation or Apply.

## Fixed software and original business identity

- SDK f522fc4c, f3c5ecbb0625a057b5a9db8a277f5c6a42fb74a899448d59ab45ab97d26bb1c8.
- Capture c56788d7e51ac99aceb359fa37c26fcf8b2973e34a8e5fa9760462e38564cf04.
- Runtime e6f305b646482576374231b2ba731fe6dfa87fc4f6ad35a82bd25590e8ee6908;
  original wrapper8337 unchanged. Root assembly f18b1ea2, no Hosted result.
- Collector34d1 (full SHA in ROOT_RESPONSE_PROOF_CALLER_REVIEW.json), unbound
  caller b2a289; Root archive fd9ec677. New caller/default/window pins pending.
- Original case stays QA_CASES_FRESH.json ChatGPT, exact fileSHA6d5d4e07...;
  same Account1f3d / Tripcc44 / Item3616 / Operation277 / CAS2 / digestfc18.
  Notes preserves both original lines and appends exactly the approved third line.
- Prior8f4 closed with Apply0, rev2 and all fields unchanged; no historical
  UNKNOWN replay. None of its consumed authority or clock can be reused.

## Offline quote comparison

Run from the MCP worktree, after a trusted Root collector handoff:

```sh
node --import tsx scripts/mcp/verify-slice1-preview.ts safe-logs.json quotes.json root-context.json
```

`quotes.json` must contain actual consumer quotations of editBaseRequest,
editBase, previewRequest and previewResult, preserving original keys/default
omission. Do not manufacture a missing Base request from known target IDs.
The old8f4 quotes lack contemporaneous proof and cannot pass as current evidence.

`root-context.json` is supplied by the trusted Root execution handoff and contains
windowId (32 lowercase hex), startsAt, normalCloseAt (ISO instants), logsSHA256,
baseRequestId and previewRequestId (distinct UUIDs). File SHA is content integrity,
not source authentication; a model-authored context cannot establish provenance.
Root must bind the collector/container/window and pin its actual saved-log SHA.

The verifier requires a CAPTURED bounded safe-log envelope, the exact quoted
arguments/output hashes, unique matching requests, proper tool/kind, HTTP200
without tool/auth error, and both timestamps in the same bounded window in order.
It independently enforces the immutable case's scope, Notes, CAS and digest.
Input hash uses the original input, including omitted vs explicit mode differences.

Success is only MATCHED_HANDLER_OUTPUT_NOT_APPLY_AUTHORITY. It cannot create a
confirmation entry, grant access, submit, retry, claim network receipt, NoCommit,
APPLIED or database persistence. Failure returns a generic message without quote
content. Unit proof events are explicitly synthetic comparator fixtures only.

## Minimal remaining software and execution sequence

1. Root packages reviewed Capture/runtime as default-closed software. At the
   actual short-lock boundary, recheck latest container/config/23files/Host/Env,
   CAS deploy, smoke health/protected denial and release with exact receipt.
   Latest reported preflight07:40:32Z a58/config9bba is not a future lock authority.
2. Bind the new close/default/CAS package to that actual deployed default and
   collector34d1, and rerun exact caller/pin/close tests. Prior unbound caller
   tests are not equivalent to this final binding. Do not reuse8f4 package.
3. Prepare one reviewable exact finite access/save proposal. Only then obtain
   the required fresh limited authorization; all business capabilities stay off
   until that authority and Root's actual binding exist.
4. In the actual consumer read original277 status and the same QA item first.
   APPLIED, revision/Notes drift, permission denial or inconsistent receipt stops
   submission. UNKNOWN is not NoCommit and must not cause new operation identity.
5. Current lawful Base/Preview → correlated actual hashes/quote comparison →
   exact trusted confirmation → consumer explicit confirmation → one Apply max.
   On UNKNOWN, query same277 only. Then formal APPLIED, independent Supabase
   same-ID/revision/Notes/root/11children readback, and close/release.
6. Native receives actual Operation/Receipt/Revision only after APPLIED and runs
   its own legal Pull/SQLite/Day/Detail/cold checks; no automatic Native PASS.

MCP remains Single DRI. Root only handles software/protected execution. No new
Tool, Scope, SQL/RLS/GRANT, domain interface, test account or platform is needed.
