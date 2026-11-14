# Review / Apply / Recovery — Phase4 candidate

Reuse `batch.ts`, existing mutation execute, trusted ConfirmChanges, Core CAS and
exact receipt lookup. Opt-in Batch additionally accepts FIELD_CREATE/FIELD_UPDATE;
new single field tools use the same execution path. Max12 operations; stop on an
unresolved outcome, retain prefix and original suffix. No second Batch engine.

`review_travel_materials` combines Item review with People/Expense planning rows.
Missing domain readers and link capability stay BLOCKED. No cross-domain Apply
is exposed. Person/Expense request drafts validate existing owning schemas; their opt-in domain adapters use their own owning HTTP/receipt contracts, never
the Core Item port. No live binding was activated.

`recoveryReview.ts` is reporting only: join a pinned confirmed operation set to
trusted adapter outcome projections, reject wrong Account/Trip/target/digest,
and report APPLIED/CONFLICT/UNKNOWN/BLOCKED/NOT_SUBMITTED independently. It dispatches
nothing and does not verify raw owning receipts. Domain adapters verify
their real receipts before supplying this report; fixture projections are not
cloud evidence. Missing outcome defaults UNKNOWN; NOT_SUBMITTED needs explicit
trusted adapter no-dispatch evidence, and an unresolved prefix prevents suffix
continuation. Unknown directs original-operation query, conflict directs fresh
diff/confirmation. It never invents object identities or auto-resubmits.

Real local Core tests: typed edit accepted prefix + typed Create response loss,
same batch resume => exactly two Items and no extra POST. Cross-domain partial
report tests use explicitly synthetic projections and keep the link unresolved.

Phase4B adds explicit earlier-operation dependencies, nullable server-assigned
Expense identity and changed-plan validation. Reporting never dispatches a DAG;
dependents wait for real accepted receipts. Reusing an ID with changed content is
rejected; UNKNOWN must resolve before replacement intent. Metadata/Traveler status
tools use original owning receipt routes. Expense writes require trusted owning
recovery/first-send reservation; no pure operation port is invented.

`processRecovery.test.ts` spawns separate Node processes with real SQLite WAL/FULL
fixture storage. Client intent/digest persist before dispatch; Core graph/receipt
commit before process.exit(86). Two restarts recover the original receipt, with
exactly one POST/Item/receipt. This test fixture is not a product MCP schema/journal
and does not qualify deployed Ledger persistence.
