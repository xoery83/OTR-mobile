import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { DocumentSearchFilterFields } from "@/features/documents/DocumentSearchFilterFields";
import type { DocumentSearchFilters } from "@/features/documents/documentListPresentation";
import {
  readDocumentSearchFilters,
  releaseDocumentSearchFilters,
} from "@/features/documents/documentSearchFilterInvocation";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export default function DocumentSearchFiltersRoute() {
  useUiLocale();
  useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const filters = readDocumentSearchFilters(invocation);
  const [facets, setFacets] = useState(() => filters?.initial ?? {});
  const { exitPending, isExitPending, requestCloseWithAction } = useSheetMotion();

  useEffect(() => () => {
    queueMicrotask(() => releaseDocumentSearchFilters(invocation));
  }, [invocation]);

  function update(next: DocumentSearchFilters) {
    if (!filters || isExitPending() || readDocumentSearchFilters(invocation) !== filters)
      return;
    setFacets(next);
  }

  function done() {
    if (!filters || readDocumentSearchFilters(invocation) !== filters) return;
    requestCloseWithAction(() => {
      if (readDocumentSearchFilters(invocation) === filters) filters.apply(facets);
    });
  }

  return (
    <SheetRoutePanel
      title={t("documents.searchFilters")}
      action={filters ? { label: t("common.done"), onPress: done, disabled: exitPending } : undefined}
    >
      {filters ? (
        <View style={styles.content}>
          <DocumentSearchFilterFields facets={facets} setFacets={update} hosted />
        </View>
      ) : null}
    </SheetRoutePanel>
  );
}

const styles = StyleSheet.create({
  content: { padding: visual.space.page, gap: visual.space.card },
});
