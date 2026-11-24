import { useRef } from "react";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { LedgerReceiptReviewInvocationContext, readLedgerReceiptReview } from "@/features/ledger/ledgerReceiptReviewSheet";

export default function LedgerReceiptReviewLayout() {
  const invocation = useRef<string | undefined>(undefined);
  return (
    <LedgerReceiptReviewInvocationContext.Provider value={invocation}>
      <SheetRouteLayout
        immersive
        interceptClose={() => readLedgerReceiptReview(invocation.current)?.isPickingSource?.() === true}
        onDismiss={() => {
          const review = readLedgerReceiptReview(invocation.current);
          if (review?.visible) review.onCancel();
        }}
      />
    </LedgerReceiptReviewInvocationContext.Provider>
  );
}
