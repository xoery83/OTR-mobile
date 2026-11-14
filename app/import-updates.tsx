import { Stack } from "expo-router";
import { UpdatesInboxScreen } from "@/features/updates/UpdatesInboxScreen";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

// Same Inbox on a native detail route so Back retains the originating Batch.
export default function ImportUpdatesRoute() {
  useUiLocale();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackVisible: true,
          title: t("updates.title"),
        }}
      />
      <UpdatesInboxScreen />
    </>
  );
}
