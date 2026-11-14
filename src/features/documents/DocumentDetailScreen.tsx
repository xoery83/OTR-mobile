import { useCallback, useState, useSyncExternalStore, useRef, useEffect } from "react";
import { View } from "react-native";
import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
  useIsFocused,
} from "expo-router";
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
import { CoreDocumentDetail } from "./CoreDocumentDetail";
import { ImportDocumentsPanel } from "./ImportDocumentsPanel";
import {
  captureDocumentRow,
  mergeDocumentRows,
  type DocumentListEntry,
} from "./documentListPresentation";

// Native stack owns Back; only stable identities cross routes, never private snapshots.
export default function DocumentDetailScreen() {
  useUiLocale();
  const colors = useUiTheme();
  const params = useLocalSearchParams<{
    tripId?: string;
    documentId?: string;
    origin?: string;
    captureId?: string;
    jobId?: string;
    batchId?: string;
    information?: string;
  }>();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const focused = useIsFocused();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [entryGeneration, setEntryGeneration] = useState(generation);
  const [entry, setEntry] = useState<DocumentListEntry | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const tripId = typeof params.tripId === "string" ? params.tripId : "";
  const id = typeof params.documentId === "string" ? params.documentId : "";
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
          setEntryGeneration(generation);
          setAccountId(context.accountId);
          setEntry(document);
        }
      })().catch(() => {
        if (current()) {
          setEntry(null);
          setError(true);
        }
      });
      return () => {
        alive = false;
      };
    }, [generation, id, tripId, params.origin, params.captureId]),
  );
  const scopeVisible =
    focused && entryGeneration === generation && generation === getAccountGeneration();
  const current = () => mounted.current && scopeVisible;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t(params.jobId ? "documents.importBatch" : "documents.documentTitle"),
          headerBackVisible: true,
        }}
      />
      {!scopeVisible ? null : entry?.origin === "CORE" && tripId ? (
        <CoreDocumentDetail
          key={`${generation}:${tripId}:${id}:${params.jobId ?? ""}`}
          entry={entry}
          tripId={tripId}
          generation={generation}
          isCurrent={current}
          batchJobId={params.jobId}
          batchId={params.batchId}
          informationInitially={params.information === "true"}
        />
      ) : entry && accountId ? (
        <ImportDocumentsPanel
          accountId={accountId}
          tripId={tripId || null}
          scope={tripId ? "TRIP" : "PERSONAL_INBOX"}
          captureId={id}
          showHistoricalLinks={false}
          detailActions
          informationInitially={params.information === "true"}
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
              router.push({ pathname: "/capture", params: { jobId, tripId } });
          }}
        />
      ) : (
        <UiText accessibilityRole={error ? "alert" : undefined}>
          {t(error ? "documents.denied" : "common.loading")}
        </UiText>
      )}
    </View>
  );
}
