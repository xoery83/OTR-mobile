import { useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { personalTripCoverBusy } from "@/features/day-feed/tripCoverSheet";

export default function TripCoverPickerLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  return <SheetRouteLayout immersive interceptClose={() => personalTripCoverBusy(invocation)} />;
}
