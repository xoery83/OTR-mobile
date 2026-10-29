# Guest Capture-only original inventory

Source's unique Writer confirmed the accepted repository-only seam:
`createLocalCaptureTransactionStore(database, deps).load(ownerId, captureId)`.
The caller owns the fenced transaction; load verifies original metadata, immutable
payload SHA/length/bytes and TEXT UTF-8. It opens no Session/database/transaction.
Do not use the Account lifecycle factory/default Documents store for Guest.

Auth adds a read-only adapter on its already isolated Guest vault. Before reading
payload bytes it checks every Capture/payload owner and every assigned Trip against
Guest local creator proof. It reuses load, exposes metadata hashes/counts only,
and blocks orphan payloads, invalid associations or unknown schema/identity states.
No byte copying, intake, Source publication, new repository or Sync lifecycle.

Result coverage is explicitly CAPTURE_ONLY; CAPTURE_COMPLETE does not mean all
Guest files, historical disk contents or the entire adoption dataset are complete.
Ledger receipts, Trip photos, pending file leases and other families retain their
owning collectors. The existing whole-dataset census still blocks nonempty Capture
tables until full normalized adoption support is implemented; this adapter does
not remove that blocker or authorize upload. No Guest file producer/UI is enabled.
