import { UiTextInput } from "@/ui/forms";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput as NativeTextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { useStage7Settlement } from "@/hooks/useStage7Settlement";

export function SettlementAdjustmentScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { journeyId, expenseId } = useLocalSearchParams<{
    journeyId?: string;
    expenseId?: string;
  }>();
  const settlement = useStage7Settlement(journeyId);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const reasonRef = useRef<NativeTextInput>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(
    expenseId ?? null,
  );
  const current = settlement.lineage.at(-1) ?? settlement.finalized;
  const visibleInputs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle)
      return expenseId
        ? (current?.inputs ?? []).filter((input) => input.expenseId === expenseId)
        : (current?.inputs ?? []);
    return (current?.inputs ?? []).filter((input) =>
      [titles[input.expenseId] || "Expense", input.payer.displayNameSnapshot]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(needle)),
    );
  }, [current, expenseId, query, titles]);

  useEffect(() => {
    let active = true;
    void Promise.all(
      (current?.inputs ?? []).map(async (input) => {
        const expense = await (
          await getDefaultLedgerExpenseRepository()
        ).getExpense(input.expenseId);
        return [input.expenseId, expense?.title ?? ""] as const;
      }),
    ).then((items) => {
      if (active) setTitles(Object.fromEntries(items));
    });
    return () => {
      active = false;
    };
  }, [current]);

  if (!settlement.finalized) {
    return <Text style={styles.empty}>{t("reviewFlow.copy76")}</Text>;
  }

  const selected = current?.inputs.find((input) => input.expenseId === selectedExpenseId);
  const openCorrection = () => {
    if (!selected) return;
    if (!reason.trim()) {
      setReasonError(true);
      reasonRef.current?.focus();
      return;
    }
    router.push({
      pathname: "/expenses/new",
      params: {
        expenseId: selected.expenseId,
        journeyId: settlement.journeyId,
        correctionRootId: settlement.finalized!.id,
        correctionReason: reason.trim(),
      },
    } as never);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        style={styles.viewport}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.warning}>
          <Text accessibilityRole="header" style={styles.title}>
            {t("reviewFlow.copy77")}
          </Text>
          <Text style={styles.body}>{t("reviewFlow.copy78")}</Text>
        </View>

        {settlement.isOrganizer ? (
          <>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {t("reviewFlow.copy79")}
            </Text>
            <UiTextInput
              accessibilityLabel={t("reviewFlow.copy80")}
              onChangeText={setQuery}
              placeholder={t("reviewFlow.copy81")}
              style={styles.search}
              value={query}
            />
            {visibleInputs.map((input) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: selectedExpenseId === input.expenseId }}
                key={input.expenseId}
                onPress={() => setSelectedExpenseId(input.expenseId)}
                style={[
                  styles.row,
                  selectedExpenseId === input.expenseId && styles.selectedRow,
                ]}
              >
                <View style={styles.grow}>
                  <Text style={styles.rowTitle}>
                    {titles[input.expenseId] || t("health.expense")}
                  </Text>
                  <Text style={styles.meta}>
                    {t("ui.paidBy")} {input.payer.displayNameSnapshot}
                  </Text>
                </View>
                <Text style={styles.version}>
                  {selectedExpenseId === input.expenseId
                    ? t("reviewFlow.copy82")
                    : t("reviewFlow.copy83")}
                </Text>
              </Pressable>
            ))}
            {!visibleInputs.length ? (
              <Text style={styles.meta}>{t("reviewFlow.copy84")}</Text>
            ) : null}

            {selected ? (
              <>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  {t("reviewFlow.copy85")}
                </Text>
                <UiTextInput
                  accessibilityLabel={t("reviewFlow.copy86")}
                  multiline
                  onChangeText={(value) => {
                    setReason(value);
                    if (value.trim()) setReasonError(false);
                  }}
                  placeholder={t("reviewFlow.copy87")}
                  ref={reasonRef}
                  style={styles.input}
                  value={reason}
                />
                {reasonError ? (
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {t("reviewFlow.copy88")}
                  </Text>
                ) : null}

                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  {t("reviewFlow.copy89")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={openCorrection}
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>{t("reviewFlow.copy90")}</Text>
                </Pressable>
                <Text style={styles.meta}>{t("reviewFlow.copy91")}</Text>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    viewport: { flex: 1, backgroundColor: colors.background },
    body: { color: colors.warning, fontSize: 15, lineHeight: 22 },
    content: { gap: 12, padding: 16, paddingBottom: 40 },
    empty: { color: colors.textSecondary, padding: 20 },
    error: { color: colors.destructive, fontSize: 14, fontWeight: "700" },
    flex: { flex: 1, backgroundColor: colors.background },
    grow: { flex: 1, gap: 3 },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 10,
      borderWidth: 1,
      minHeight: 80,
      padding: 12,
      textAlignVertical: "top",
    },
    meta: { color: colors.textSecondary, fontSize: 13 },
    primary: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 12,
      justifyContent: "center",
      minHeight: 50,
      paddingHorizontal: 16,
    },
    primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: "900" },
    row: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      flexDirection: "row",
      gap: 10,
      padding: 14,
    },
    rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
    search: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 10,
      borderWidth: 1,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    selectedRow: { borderColor: colors.accent, borderWidth: 2 },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 6,
    },
    title: { color: colors.warning, fontSize: 18, fontWeight: "800" },
    version: { color: colors.accent, fontWeight: "800" },
    warning: {
      backgroundColor: colors.warningSurface,
      borderRadius: 14,
      gap: 8,
      padding: 14,
    },
  });
