import { Redirect, useLocalSearchParams } from "expo-router";
import { ImportExceptionReviewScreen } from "@/features/capture/ImportExceptionReviewScreen";
import { hostedImportEnabled } from "@/features/capture/hostedImport";

export default function HostedImportReviewRoute() {
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  if (!hostedImportEnabled) return <Redirect href={{ pathname: "/import-review", params: { jobId } }} />;
  return <ImportExceptionReviewScreen hosted />;
}
