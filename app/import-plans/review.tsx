import { Redirect, useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useSyncExternalStore } from "react";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { useSheetMotion } from "@/components/SheetHost";
import { ImportExceptionReviewScreen } from "@/features/capture/ImportExceptionReviewScreen";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { ownsImportSheetOrigin, popImportSheetPage } from "@/features/capture/importSheetNavigation";

export default function HostedImportReviewRoute() {
  const params = useLocalSearchParams<{
    jobId?: string;
    origin?: string;
    originGeneration?: string;
    originKey?: string;
  }>();
  if (!hostedImportEnabled) return <Redirect href={{ pathname: "/import-review", params: { jobId: params.jobId } }} />;
  return <HostedReview {...params} />;
}

function HostedReview({ jobId, origin, originGeneration, originKey }: {
  jobId?: string;
  origin?: string;
  originGeneration?: string;
  originKey?: string;
}) {
  const navigation = useNavigation();
  const { key } = useRoute();
  const { isExitPending } = useSheetMotion();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const child = ownsImportSheetOrigin(navigation, key, originKey);
  return (
    <ImportExceptionReviewScreen
      key={JSON.stringify([jobId, generation])}
      hosted
      onHostedBack={child ? () => {
        if (!isExitPending()) popImportSheetPage(navigation, key, originKey);
      } : undefined}
      requiredGeneration={child || origin === "UPDATES" ? (originGeneration ?? "") : ""}
    />
  );
}
