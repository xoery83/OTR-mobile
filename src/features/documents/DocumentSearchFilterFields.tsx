import { StyleSheet, useWindowDimensions, View } from "react-native";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip, UiDatePicker } from "@/ui/forms";
import { formatUiDate, t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";
import type { UiColors } from "@/ui/palette";
import {
  documentSourceLabel as sourceKey,
  type DocumentSearchFilters,
} from "./documentListPresentation";

export function DocumentSearchFilterFields({
  facets,
  setFacets,
  hosted = false,
}: {
  facets: DocumentSearchFilters;
  setFacets(facets: DocumentSearchFilters): void;
  hosted?: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const useDateWheels = hosted && fontScale > 1.5;
  return (
    <>
      <UiText style={styles.title}>{t("documents.privacyFilter")}</UiText>
      {([undefined, "PRIVATE", "GROUP", "SELECTED_PERSONS"] as const).map((value) => (
        <UiChoiceChip
          key={value ?? "ALL"}
          selected={facets.visibility === value}
          label={t(
            value === "PRIVATE"
              ? "importDocuments.private"
              : value === "GROUP"
                ? "documents.sharedTrip"
                : value === "SELECTED_PERSONS"
                  ? "documents.sharedPeople"
                  : "documents.all",
          )}
          onPress={() => setFacets({ ...facets, visibility: value })}
        />
      ))}
      <UiText style={styles.title}>{t("documents.storageFilter")}</UiText>
      {([undefined, "LOCAL", "UNAVAILABLE"] as const).map((value) => (
        <UiChoiceChip
          key={value ?? "ALL"}
          selected={facets.storage === value}
          label={t(
            value === "LOCAL"
              ? "documents.offline"
              : value === "UNAVAILABLE"
                ? "documents.unavailableFilter"
                : "documents.all",
          )}
          onPress={() => setFacets({ ...facets, storage: value })}
        />
      ))}
      <UiText style={styles.title}>{t("documents.sourceFilter")}</UiText>
      {(
        [undefined, "files", "photos", "camera", "magic_input", "clipboard"] as const
      ).map((value) => (
        <UiChoiceChip
          key={value ?? "ALL"}
          selected={facets.source === value}
          label={t(value ? sourceKey[value] : "documents.all")}
          onPress={() => setFacets({ ...facets, source: value })}
        />
      ))}
      <UiText style={styles.title}>{t("documents.relation")}</UiText>
      {([undefined, "LINKED", "UNLINKED", "MULTIPLE"] as const).map((relation) => (
        <UiChoiceChip
          key={relation ?? "ALL"}
          selected={facets.relation === relation}
          label={t(
            relation === "LINKED"
              ? "documents.linkedFilter"
              : relation === "UNLINKED"
                ? "documents.unlinkedFilter"
                : relation === "MULTIPLE"
                  ? "documents.multipleFilter"
                  : "documents.all",
          )}
          onPress={() => setFacets({ ...facets, relation })}
        />
      ))}
      {(["from", "to"] as const).map((key) => (
        <View key={key} style={hosted ? styles.content : styles.legacyDate}>
          <UiText style={styles.title}>
            {t(key === "from" ? "documents.dateFrom" : "documents.dateTo")}
          </UiText>
          {useDateWheels && facets[key] ? (
            <UiText>{formatUiDate(facets[key], { dateStyle: "long" })}</UiText>
          ) : null}
          <UiDatePicker
            value={facets[key] ?? new Date()}
            mode="date"
            display={useDateWheels ? "spinner" : "compact"}
            onChange={(_, value) => {
              if (value) setFacets({ ...facets, [key]: value });
            }}
          />
          {facets[key] ? (
            <UiButton
              variant="text"
              label={t("documents.clearDate")}
              onPress={() => setFacets({ ...facets, [key]: undefined })}
            />
          ) : (
            <UiText style={styles.meta}>{t("documents.noDateFilter")}</UiText>
          )}
        </View>
      ))}
      <UiButton
        variant="text"
        label={t("documents.resetFilters")}
        onPress={() => setFacets({})}
      />
    </>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    content: { gap: 8 },
    legacyDate: { padding: visual.space.page, gap: visual.space.card },
    title: { ...visual.type.row, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
  });
