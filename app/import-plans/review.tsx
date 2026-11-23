import { Redirect, useLocalSearchParams } from "expo-router";
import { useSyncExternalStore } from "react";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { ImportExceptionReviewScreen } from "@/features/capture/ImportExceptionReviewScreen";
import { hostedImportEnabled } from "@/features/capture/hostedImport";

export default function HostedImportReviewRoute() {
  const { jobId, origin, originGeneration } = useLocalSearchParams<{
    jobId?: string;
    origin?: string;
    originGeneration?: string;
  }>();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const standalone = origin === "UPDATES";
  if (!hostedImportEnabled) return <Redirect href={{ pathname: "/import-review", params: { jobId } }} />;
  return (
    <ImportExceptionReviewScreen
      key={JSON.stringify([jobId, generation])}
      hosted
      standalone={standalone}
      requiredGeneration={originGeneration ?? ""}
    />
  );
}
