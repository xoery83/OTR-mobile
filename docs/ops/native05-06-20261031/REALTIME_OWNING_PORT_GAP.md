# Native-06 — bounded owning interface gap

Status: **NOT ACTIVATED**. Root/Core and Auth each confirmed on31 October that
their current delivery has no transferable general private subscribe qualification,
Core committed-change publisher, or monotonic access-revocation/regrant read port.
Import Task/Results polling and the local Capture bus are not substitutes.

The existing foreground path checks all discovered Trip collections every30s;
equal certified manifests avoid SQLite writes, but do not avoid downloading the
collection. Its15s read throttle also cannot promise1–5s signal-to-visible latency.
Actual external P3 baseline is still pending a receipt-GET timeout before POST;
do not present its observation timeout as an APPLIED-to-visible measurement.

Minimum shared difference for the unique Core/Auth writer to qualify:

1. Current authenticated Actor/Trip subscribe authorization, including channel
   lifetime and a way to terminate actual revoked access. A guessed Trip UUID,
   discovery omission or ordinary404 never grants/revokes a subscription.
2. Tiny deduplicable invalidation emitted only after an APPLIED transaction commits.
   No Item body, receipt, participant or document payload. Failed/rolled-back
   transactions must not publish committed-change signals.
3. A cheap authenticated revision/cursor check for the current Trip, with access
   qualification. Reconnect/30–60s fallback checks this before full collection
   Pull; account discovery remains a separate existing lifecycle operation.

Native reuses the existing Account-generation fences and Downstream Repository
apply. Any candidate signal adapter stays unmounted/default-closed until the
owning contract is fixed. Logout/switch/background closes its subscription;
late old-generation results cannot notify/apply to the next Account. Duplicate
signals coalesce and an in-flight read needs one trailing invalidation check.
Receipt, cursor and accepted snapshot remain authoritative, never the signal.

No proposed endpoint/schema is declared implemented by this document. No RLS,
GRANT, Trigger, public channel, Service Role or publishing capability was added.
Any protected change requires its exact reviewed Gate before DEV installation.
Formal revocation remains BLOCKED; see the existing Native-04 revocation gap.
