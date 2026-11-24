import { useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { interceptTripMetadataClose } from "@/features/day-feed/tripMetadataSheet";

export default function TripMetadataSheetLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  return <SheetRouteLayout immersive interceptClose={() => interceptTripMetadataClose(invocation)} />;
}
