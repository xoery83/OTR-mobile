import { Stack, useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { hostedImportEnabled } from "@/features/capture/hostedImport";

export const unstable_settings = { initialRouteName: "index" };

export default function ImportSheetLayout() {
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  if (!hostedImportEnabled) return <Stack screenOptions={{ headerShown: false }} />;
  return <SheetRouteLayout immersive={Boolean(jobId)} />;
}
