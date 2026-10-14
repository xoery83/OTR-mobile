import { Tabs } from "expo-router";
import { GlobalMenu } from "@/components/GlobalMenu";
import { UpdatesInboxScreen } from "@/features/updates/UpdatesInboxScreen";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
export default function UpdatesRoute() {
  useUiLocale();
  return (
    <>
      <Tabs.Screen
        options={{
          href: null,
          title: t("updates.title"),
          headerLeft: () => <GlobalMenu module="UPDATES" />,
        }}
      />
      <UpdatesInboxScreen />
    </>
  );
}
