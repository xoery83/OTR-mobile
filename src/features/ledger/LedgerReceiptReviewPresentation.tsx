import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { router } from "expo-router";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  hostedLedgerReceiptReviewEnabled, openLedgerReceiptReview, releaseLedgerReceiptReview, updateLedgerReceiptReview,
} from "./ledgerReceiptReviewSheet";
import { ReceiptReviewSheet } from "./ReceiptReviewSheet";

export function LedgerReceiptReviewPresentation(review: ComponentProps<typeof ReceiptReviewSheet>) {
  const invocation = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!hostedLedgerReceiptReviewEnabled) return;
    if (invocation.current) {
      updateLedgerReceiptReview(invocation.current, review);
      return;
    }
    const id = openLedgerReceiptReview(review, getAccountGeneration());
    if (!id) return;
    invocation.current = id;
    router.push({ pathname: "/ledger-receipt-review", params: { invocation: id } });
  }, [review]);
  useLayoutEffect(() => () => {
    const id = invocation.current;
    invocation.current = undefined;
    releaseLedgerReceiptReview(id);
  }, []);
  return hostedLedgerReceiptReviewEnabled ? null : <ReceiptReviewSheet {...review} />;
}
