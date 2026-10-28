> Serial intake update: the actual port is replayed as `5785d680` on Native `2253dc34`. P6 host entry/Reader wiring is applied in this isolated integration branch; [HOST_INTEGRATION.md](HOST_INTEGRATION.md) supersedes the historical final pending paragraph below. No Cloud or Native Vision PASS.

# P6 Manual Batch owning port — local SQLite PASS

28 October2026. Parent obtained the serial unique-Writer handoff for this Gate; Universal continues only its separate P5 ReviewedSource work. Applied in the independent P6 Worktree, not main or parent Native tree.

Product delta is only four bounded changes in `tripCoreV2Repository.commitManualBatch`: admit the existing SET_ACTIVITY_DETAILS command; admit P6 in CREATE_ITEM and actual-family checks; reject SET_ACTIVITY_DETAILS unless the actual target family is P6. Existing MANUAL admission, same Trip/Item, maximum5 commands, transaction, actor/access, revision, replay and queue-wake checks are unchanged. No new command, Schema/RLS, Backend capability or remote dispatch is introduced.

Actual SQLite verification:

- Minimum Name+Date Create, optional fields and exact same-ID Edit/reopen.
- Fresh Repository and Core instance read the exact persisted authored values/identity; an on-disk SQLite snapshot is reopened through a new handle after closing the original DB, retaining the same Item and queue. No fake accepted certificate.
- Queue payloads match canonical intent text; duplicate Save/replay retains operation IDs and does not duplicate records.
- Create failure and second-write failure inside a five-command Edit roll back all writes; exact frozen retry succeeds with one durable command set.
- Stale semantic revision, stale Account and revoked Core scope cannot read/write over current data.
- P1 cannot receive Activity details; P6 cannot receive Stay/Rental details. The direct Core Repository test also rejects Activity details on P4.
- P6 complete Edit remains within the unchanged5-command bound and advances one revision per command.

Final run:11 suites361 assertions PASS. The seven actual Repository suites (P1, P2, P3, P4, P5, P6, shared Core Repository) total121 assertions PASS. TypeScript, scoped ESLint, UI guard, Prettier/diff-check PASS. No device, Cloud, DEV or live Provider test.

Three prior tests asserted that every P6 Manual batch was forbidden (two Stay tests and one Core test). They now assert the newly authorized P6 positives while retaining P3 Editor cross-family rejection, generic queue replay and new detail-family negatives; no failing security assertion was deleted.

`MANUAL_BATCH_OWNING_CANDIDATE.patch` and `manualActivityRepository.after-owning-port.test.txt` are retained historical proposal artifacts. The actual source/tests in this commit supersede them; do not copy the old four-test artifact over the current eleven-test Repository suite. When this commit is cherry-picked, do not apply the same Gate patch again.

P6 chooser/Reader host registration remains only the unapplied `HOST_UI_INTEGRATION.patch`. Parent must review/rebase it onto its latest Focus repairs before enabling P6. Entry/Meeting independent clocks and other previously listed Owning gaps remain. LOCAL_REPOSITORY_PASS does not grant Native Vision or Cloud E2E PASS.
