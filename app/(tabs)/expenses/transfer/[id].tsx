import { useLocalSearchParams } from "expo-router";

import {
  TransferDetailScreen,
  TransferNotFound,
} from "@/features/ledger/TransferDetailScreen";
import { focusedTransferParams } from "@/features/ledger/transferRoute";

export default function TransferDetailRoute() {
  const { id, journeyId } = useLocalSearchParams<{
    id?: string | string[];
    journeyId?: string | string[];
  }>();
  const params = focusedTransferParams(id, journeyId);

  return params ? (
    <TransferDetailScreen journeyId={params.journeyId} transferId={params.id} />
  ) : (
    <TransferNotFound />
  );
}
