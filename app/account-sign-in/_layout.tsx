import { useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { interceptSignInClose } from "@/features/auth/hostedSignIn";

export default function AccountSignInLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  return <SheetRouteLayout interceptClose={() => interceptSignInClose(invocation)} />;
}
