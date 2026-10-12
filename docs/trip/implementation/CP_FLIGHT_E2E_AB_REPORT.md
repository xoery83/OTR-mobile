# CP-FLIGHT-E2E-AB Joined Integration Report

Baseline: `b5caa1f61cad1d8c612ee40142f3289f69715b5a`.
Accepted A: `473893f7654a7fc194a7e7c35e922e350d426f24` (24-file manifest).
Accepted B: `fdd5a5c38660a7942b19fee0d65af7144d1aed19` (13-file manifest).
Branch/worktree: `codex/cp-flight-e2e-ab`, `/private/tmp/otr-flight-e2e-ab-20261012`.
Status: joined acceptance in progress; no canonical merge/push or activation.

## Verified bounded integration

The only A/B overlap is `docs/CURRENT_IMPLEMENTATION_STATE.md`. Its ordinary merge
conflict was resolved by retaining both accepted sections. Isolated merge commit:
`90128ce8a390d017d56b5dee59cebfbf9d09471f`. All accepted code/nonoverlapping docs
remain byte-identical to their pinned branches. No migration changes are present.

A's10 carried Stage1 dependencies match `1fd4b7d` blobs exactly; no additional
old17-file prepared-tree files or unrelated `fb8dbc9` Core work were merged.
Dependency list and exact combined manifest will be included in the final report.

## Minimum joined harness

Extend the existing actual Capture/Source/Core SQL acceptance scenario at its
accepted qualification checkpoint with a test-only SQLite/Day assertion helper.
Reuse the existing owning PostgreSQL reader and authenticated HTTP collection2,
complete-partition install, production `readTripDayFeed()` and existing components.
Compare the same UUID/semantic-revision pairs directly in SQL, read2, SQLite and
Day; verify repeated import/collection, lost response recovery, offline file
reopen, actor/Trip fences and Source proof redaction. No business implementation,
new Publisher/writer/sync engine/Composer or fixture authority substitutes for
actual owning SQL in the joined path.

React native components remain static-render mocks; Node SQLite persistence and
owning libpq/psql SQL are actual. Native/deployed Node pg/TLS, Hosted, supplier,
Provider, paid LLM, Mobile Runtime and Production remain separate CLOSED gates.
