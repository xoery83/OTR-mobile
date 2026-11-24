import { useLocalSearchParams } from "expo-router";
import { useContext, useSyncExternalStore } from "react";
import { DocumentFileInfoRootKey } from "@/features/documents/documentFileInfoReadback";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import DocumentDetailScreen from "@/features/documents/DocumentDetailScreen";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function DocumentFileInfoRoute() {
  useUiLocale();
  const fileInfoRootKey = useContext(DocumentFileInfoRootKey);
  const generation = useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { originGeneration, documentId, tripId, origin, captureId, menu } = useLocalSearchParams<{
    originGeneration?: string;
    documentId?: string;
    tripId?: string;
    origin?: string;
    captureId?: string;
    menu?: string;
  }>();
  return (
    <SheetRoutePanel title={t("documents.fileInfo")}>
      {documentId && originGeneration === String(generation) ? (
        <DocumentDetailScreen
          key={JSON.stringify([generation, tripId, documentId, origin, captureId])}
          fileInfoRootKey={fileInfoRootKey}
          informationOnly
          informationMenu={menu === "true"}
        />
      ) : <UiText style={{ padding: visual.space.page }} accessibilityRole="alert">{t("documents.denied")}</UiText>}
    </SheetRoutePanel>
  );
}
