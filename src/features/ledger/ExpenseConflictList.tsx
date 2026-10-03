import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { getDefaultLedgerExpenseConflictRepository } from "@/data/repositories/ledgerExpenseConflictRepository";

export function ExpenseConflictList({
  journeyId,
  title = t("extra.copy28"),
}: {
  journeyId?: string;
  title?: string;
}) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);
  const [items, setItems] = useState<
    Awaited<
      ReturnType<
        Awaited<ReturnType<typeof getDefaultLedgerExpenseConflictRepository>>["listOpen"]
      >
    >
  >([]);
  const generation = getAccountGeneration();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = () =>
        void getDefaultLedgerExpenseConflictRepository()
          .then((r) => r.listOpen(journeyId))
          .then((rows) => {
            if (active && generation === getAccountGeneration()) setItems(rows);
          })
          .catch(() => undefined);
      load();
      const timer = setInterval(load, 4000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [journeyId, generation]),
  );
  if (!items.length) return null;
  return (
    <View style={styles.list}>
      <Text accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={t("conflict.reviewDescription", {
            title: item.title,
            deletion: item.deletedAt ? t("conflict.deletionDescription") : "",
          })}
          onPress={() =>
            router.push({
              pathname: "/expenses/conflict/[id]",
              params: { id: item.id },
            } as never)
          }
          style={styles.row}
        >
          <Text style={styles.heading}>{item.title}</Text>
          <Text style={styles.body}>
            {t(item.deletedAt ? "conflict.deletionCount" : "conflict.changeCount", {
              count: item.conflictCount,
            })}
          </Text>
          <Text style={styles.link}>{t("ui.reviewChanges2")}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    list: { gap: 12 },
    row: {
      padding: 16,
      backgroundColor: colors.warningSurface,
      borderRadius: 12,
      gap: 6,
    },
    heading: { fontSize: 17, fontWeight: "600", color: colors.textPrimary },
    body: { fontSize: 16, lineHeight: 23, color: colors.textTertiary },
    link: { fontSize: 16, fontWeight: "600", color: colors.accent },
  });
