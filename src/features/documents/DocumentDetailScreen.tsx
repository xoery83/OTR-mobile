import { useCallback, useState, useSyncExternalStore, useRef, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
  useIsFocused,
  useNavigation,
} from "expo-router";
import { useNavigationState, useRoute } from "expo-router/react-navigation";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { localItemImportOriginals } from "@/data/operations/localItemImportOriginals";
import { getDefaultImportDocumentsRepository } from "@/data/operations/defaultImportDocuments";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useUiTheme } from "@/ui/theme";
import { visual } from "@/ui/visual";
import {
  publishQualifiedFileInfo,
  readQualifiedFileInfo,
  subscribeQualifiedFileInfo,
} from "./documentFileInfoReadback";
import { openHostedDocumentInformation } from "./openHostedDocumentInformation";
import { CoreDocumentDetail } from "./CoreDocumentDetail";
import { ImportDocumentsPanel } from "./ImportDocumentsPanel";
import {
  captureDocumentRow,
  mergeDocumentRows,
  type DocumentListEntry,
} from "./documentListPresentation";

// Native stack owns Back; only stable identities cross routes, never private snapshots.
export default function DocumentDetailScreen({ informationOnly = false, informationMenu = false, fileInfoRootKey }: {
  informationOnly?: boolean;
  informationMenu?: boolean;
  fileInfoRootKey?: string;
} = {}) {
  useUiLocale();
  const colors = useUiTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const fileInfoCoveringDetail = (state: ReturnType<typeof navigation.getState>) => {
    if (!state) return undefined;
    const foreground = state.routes[state.index];
    if (!informationOnly && foreground?.name === "document-file-info" &&
        state.routes[state.index - 1]?.key === route.key) {
      return foreground.key;
    }
  };
  const observedFileInfoKey = useNavigationState(fileInfoCoveringDetail);
  const params = useLocalSearchParams<{
    tripId?: string;
    documentId?: string;
    origin?: string;
    captureId?: string;
    jobId?: string;
    batchId?: string;
    information?: string;
    originRouteKey?: string;
  }>();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const focused = useIsFocused();
  // Focus can change before the navigation-state subscription sees the new root.
  const fileInfoKey = focused
    ? observedFileInfoKey
    : fileInfoCoveringDetail(navigation.getState());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [loaded, setLoaded] = useState<{
    scope: string;
    entry: DocumentListEntry;
    accountId: string;
  } | null>(null);
  const [error, setError] = useState(false);
  const tripId = typeof params.tripId === "string" ? params.tripId : "";
  const id = typeof params.documentId === "string" ? params.documentId : "";
  const scope = JSON.stringify([generation, tripId, id, params.origin, params.captureId]);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const current = () => alive && generation === getAccountGeneration();
      setError(false);
      void (async () => {
        const context = await captureAccountRequestContext(tripId, requireActiveUserId);
        if (!current()) return;
        let document: DocumentListEntry | undefined;
        if (params.origin === "CAPTURE") {
          const repo = await getDefaultImportDocumentsRepository();
          const retained = await repo.read(
            context,
            tripId ? "TRIP" : "PERSONAL_INBOX",
            id,
          );
          document = {
            ...captureDocumentRow(retained, t("capture.ai.submittedText")),
            tripId: tripId || null,
          };
        } else if (tripId) {
          const reader = await localItemImportOriginals(tripId, undefined, generation);
          const row = (await reader.metadata()).find((row) => row.id === id);
          if (row) document = { ...row, origin: "CORE", tripId };
          if (document && typeof params.captureId === "string") {
            try {
              const retained = await (
                await getDefaultImportDocumentsRepository()
              ).read(context, "TRIP", params.captureId);
              document = mergeDocumentRows(
                [document],
                [captureDocumentRow(retained, t("capture.ai.submittedText"))],
              )[0];
            } catch {
              /* Canonical metadata remains readable without a retained Capture. */
            }
          }
        }
        if (!document) throw Error("DOCUMENT_ACCESS_CHANGED");
        if (current()) {
          setLoaded({ scope, accountId: context.accountId, entry: document });
        }
      })().catch(() => {
        if (current()) {
          setLoaded(null);
          setError(true);
        }
      });
      return () => {
        alive = false;
      };
    }, [generation, id, tripId, params.origin, params.captureId, scope]),
  );
  const loadedScope = loaded?.scope === scope && generation === getAccountGeneration() ? loaded : null;
  const entry = loadedScope?.entry;
  const accountId = loadedScope?.accountId;
  const ownerRouteKey = informationOnly ? params.originRouteKey : route.key;
  const informationScope = JSON.stringify([ownerRouteKey, generation, tripId, id, entry?.origin, params.captureId]);
  const qualifiedCover = useSyncExternalStore(subscribeQualifiedFileInfo, () =>
    readQualifiedFileInfo(fileInfoKey, informationScope),
  );
  const verifyInformation = useCallback(() => {
    if (informationOnly && fileInfoRootKey && ownerRouteKey && focused && loadedScope) {
      return publishQualifiedFileInfo(fileInfoRootKey, informationScope);
    }
  }, [informationOnly, fileInfoRootKey, ownerRouteKey, focused, loadedScope, informationScope]);
  const showBackdrop = qualifiedCover && Boolean(loadedScope);
  const visible = focused || showBackdrop;
  const current = () => mounted.current && focused && Boolean(loadedScope) &&
    navigation.isFocused() && generation === getAccountGeneration();
  const openInformation = (menu: boolean) => current() && Boolean(entry) && openHostedDocumentInformation({
    documentId: id,
    tripId,
    origin: entry?.origin,
    captureId: params.captureId,
    originRouteKey: route.key,
  }, menu);
  return (
    <View
      style={[
        !informationOnly && { flex: 1, backgroundColor: colors.background },
        !visible && styles.hidden,
      ]}
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? "auto" : "no-hide-descendants"}
      pointerEvents={focused ? "auto" : "none"}
    >
      {!informationOnly ? <Stack.Screen
        options={{
          headerShown: true,
          title: t(params.jobId ? "documents.importBatch" : "documents.documentTitle"),
          headerBackVisible: true,
        }}
      /> : null}
      {!(focused || (fileInfoKey && loadedScope)) ? null : entry?.origin === "CORE" && tripId ? (
        <CoreDocumentDetail
          key={`${generation}:${tripId}:${id}:${params.jobId ?? ""}`}
          entry={entry}
          tripId={tripId}
          generation={generation}
          isCurrent={current}
          batchJobId={params.jobId}
          batchId={params.batchId}
          informationInitially={params.information === "true"}
          informationOnly={informationOnly}
          informationMenu={informationMenu}
          onInformationVerified={informationOnly ? verifyInformation : undefined}
          openInformation={openInformation}
        />
      ) : entry && accountId ? (
        <ImportDocumentsPanel
          key={scope}
          accountId={accountId}
          tripId={tripId || null}
          scope={tripId ? "TRIP" : "PERSONAL_INBOX"}
          captureId={id}
          showHistoricalLinks={false}
          showBackdrop={showBackdrop}
          detailActions
          informationInitially={params.information === "true"}
          informationOnly={informationOnly}
          informationMenu={informationMenu}
          onInformationVerified={informationOnly ? verifyInformation : undefined}
          openInformation={openInformation}
          isCurrent={current}
          onOpenDocument={(documentId) => {
            if (current())
              router.push({
                pathname: "/document-detail",
                params: { documentId, origin: "CAPTURE", tripId },
              });
          }}
          onOpenActivity={(jobId) => {
            if (current())
              router.push({ pathname: "/import-plans", params: { jobId, tripId } });
          }}
        />
      ) : (
        <UiText style={informationOnly ? styles.infoStatus : undefined} accessibilityRole={error ? "alert" : undefined}>
          {t(error ? "documents.denied" : "common.loading")}
        </UiText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { display: "none" },
  infoStatus: { padding: visual.space.page },
});
