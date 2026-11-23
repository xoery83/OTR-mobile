import { Stack } from "expo-router";

import { GlobalMenu } from "@/components/GlobalMenu";
import { UpdatesInboxScreen } from "@/features/updates/UpdatesInboxScreen";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function UpdatesRoute() {
  useUiLocale();
  return (
    <>
      <Stack.Screen options={{ title: t("updates.title") }} />
      <GlobalMenu module="UPDATES" nativeToolbar />
      <UpdatesInboxScreen />
    </>
  );
}
