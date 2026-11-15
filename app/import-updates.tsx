import { router, Stack } from "expo-router";
import { UpdatesInboxScreen } from "@/features/updates/UpdatesInboxScreen";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

// Present above the transparent Batch modal, retaining its original return stack.
export default function ImportUpdatesRoute() {
  useUiLocale();
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackVisible: false,
          title: t("updates.title"),
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          icon="chevron.left"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
        />
      </Stack.Toolbar>
      <UpdatesInboxScreen />
    </>
  );
}
