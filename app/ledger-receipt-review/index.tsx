import { useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useIsFocused, usePreventRemove, useRoute } from "expo-router/react-navigation";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { ReceiptReviewSheet } from "@/features/ledger/ReceiptReviewSheet";
import {
  bindLedgerReceiptReviewPicker, LedgerReceiptReviewInvocationContext, readLedgerReceiptReview, subscribeLedgerReceiptReview,
} from "@/features/ledger/ledgerReceiptReviewSheet";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { getAccountGeneration } from "@/data/auth/accountGeneration";

export default function LedgerReceiptReviewRoute() {
  useUiLocale();
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const ownerRef = useContext(LedgerReceiptReviewInvocationContext);
  useLayoutEffect(() => {
    if (ownerRef) ownerRef.current = invocation;
  }, [invocation, ownerRef]);
  const navigation = useNavigation();
  const route = useRoute();
  const focused = useIsFocused();
  const { requestClose, exitPending, isExitPending } = useSheetMotion();
  const readLiveReview = () => readLedgerReceiptReview(invocation);
  const review = useSyncExternalStore(subscribeLedgerReceiptReview, readLiveReview);
  const [generation] = useState(getAccountGeneration);
  const [lastReview, setLastReview] = useState(review);
  if (review && review !== lastReview) setLastReview(review);
  usePreventRemove(!!review?.visible && !exitPending, requestClose);

  useEffect(() => {
    if (!review?.visible && focused && !exitPending) requestClose();
  }, [review?.visible, focused, exitPending, requestClose]);

  const display = review ?? (generation === getAccountGeneration() ? lastReview : undefined);
  if (!display) return <SheetRoutePanel title={t("ui.reviewReceipt")}>{null}</SheetRoutePanel>;
  return (
    <ReceiptReviewSheet
      {...display}
      readLiveReview={() => isExitPending() ? undefined : readLiveReview()}
      canLaunchSource={() => navigation.isFocused() && !isExitPending()}
      openHostedChoice={choice => {
        if (!navigation.isFocused() || isExitPending()) return false;
        const selection = bindLedgerReceiptReviewPicker(invocation, choice);
        if (!selection) return false;
        router.push({ pathname: "/ledger-receipt-review/choice", params: { invocation, selection, editorKey: route.key } });
        return true;
      }}
    />
  );
}
