import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { readP1DocumentLink, releaseP1DocumentLink } from "@/features/day-feed/p1DocumentLinkSheet";

export default function P1DocumentLinkLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  useEffect(() => () => {
    queueMicrotask(() => releaseP1DocumentLink(invocation, true));
  }, [invocation]);
  return <SheetRouteLayout
    immersive
    interceptClose={() => readP1DocumentLink(invocation)?.busy ?? false}
    onDismiss={() => releaseP1DocumentLink(invocation, true)}
  />;
}
