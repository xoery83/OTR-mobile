import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { EmailOtpSignIn } from "@/features/auth/EmailOtpSignIn";
import { completeSignIn, readSignIn, releaseSignIn } from "@/features/auth/hostedSignIn";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function AccountSignInRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration, getAccountGeneration);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const [entry] = useState(() => readSignIn(invocation));
  const motion = useSheetMotion();
  useEffect(() => () => { queueMicrotask(() => releaseSignIn(invocation)); }, [invocation]);
  if (!entry || (!entry.installing && !entry.result && readSignIn(invocation) !== entry))
    return <SheetRoutePanel title={t("auth.emailTitle")}>{null}</SheetRoutePanel>;

  return (
    <EmailOtpSignIn
      hosted
      onBusyChange={entry.owner.onBusyChange}
      onCancel={motion.requestClose}
      isExitPending={motion.isExitPending}
      exitPending={motion.exitPending}
      isCurrent={() => readSignIn(invocation) === entry}
      onAuthenticated={(session, generation) => completeSignIn(invocation, session, generation)}
    />
  );
}
