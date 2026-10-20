import { UiTextInput, UiFormRow, UiChoiceChip, UiDatePicker } from "./forms";
import { useState } from "react";
import { Stack } from "expo-router";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { MoneyText } from "@/features/ledger/MoneyText";
import { UiButton, UiSection } from "./controls";
import { formatUiDate, t } from "./locale";
import { useUiLocale } from "./useUiLocale";
import { useThemedStyles } from "./theme";
import type { UiColors } from "./palette";
import { visual } from "./visual";

// Disposable diagnostics content; no Trip domain state or navigation destination.
export function UiFoundationFixture() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState(false);
  const [date, setDate] = useState(new Date(2026, 9, 3));
  return (
    <View style={styles.content}>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t("fixture.nativeAction")}
          icon="ellipsis"
          onPress={() => setOpen(true)}
        />
      </Stack.Toolbar>
      <UiSection title={t("fixture.title")}>
        <Text style={styles.body}>{t("fixture.description")}</Text>
        <Text style={styles.meta}>
          {t("fixture.sampleDate", { date: formatUiDate(new Date(2026, 9, 3)) })}
        </Text>
        <MoneyText variant="headline" minor={123456} currency="NZD" scale={2} />
        <MoneyText signed variant="compact" minor={-12345} currency="JPY" scale={0} />
        <MoneyText variant="compact" minor={12345} currency="KWD" scale={3} />
        <Text style={styles.status}>{t("fixture.status")}</Text>
        <ActivityIndicator accessibilityLabel={t("common.loading")} />
        <Text style={styles.meta}>{t("fixture.empty")}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {t("fixture.error")}
        </Text>
        <UiTextInput
          accessibilityLabel={t("fixture.input")}
          placeholder={t("fixture.input")}
          value={input}
          onChangeText={setInput}
        />
        <UiTextInput
          editable={false}
          accessibilityLabel={t("fixture.disabledInput")}
          placeholder={t("fixture.disabledInput")}
        />
        <UiFormRow
          label={t("fixture.date")}
          value={formatUiDate(date)}
          onPress={() => setOpen(true)}
        />
        <UiChoiceChip
          label={t("fixture.choice")}
          selected={selected}
          onPress={() => setSelected(!selected)}
        />
        <UiButton label={t("fixture.primary")} onPress={() => setOpen(true)} />
        <UiButton
          variant="secondary"
          label={t("fixture.secondary")}
          onPress={() => setOpen(true)}
        />
        <UiButton
          variant="text"
          label={t("fixture.text")}
          onPress={() => setOpen(true)}
        />
        <UiButton
          variant="destructive"
          label={t("fixture.destructive")}
          onPress={() => setOpen(true)}
        />
        <UiButton disabled label={t("fixture.disabled")} onPress={() => setOpen(true)} />
      </UiSection>
      <Modal
        visible={open}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaProvider>
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <SheetHeader title={t("fixture.sheet")} onLeft={() => setOpen(false)} />
            <View style={styles.content}>
              <Text style={styles.body}>{t("fixture.description")}</Text>
              <UiDatePicker
                display="spinner"
                mode="date"
                value={date}
                onChange={(_, value) => {
                  if (value) setDate(value);
                }}
              />
              <UiButton label={t("common.done")} onPress={() => setOpen(false)} />
            </View>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    content: {
      backgroundColor: colors.background,
      padding: visual.space.page,
      gap: visual.space.section,
    },
    sheet: { flex: 1, backgroundColor: colors.background },
    body: { color: colors.textPrimary, ...visual.type.row },
    meta: { color: colors.textSecondary, ...visual.type.meta },
    error: { color: colors.destructive, ...visual.type.meta },
    status: {
      color: colors.warning,
      backgroundColor: colors.warningSurface,
      padding: visual.space.card,
      borderRadius: visual.radius.control,
      ...visual.type.meta,
    },
  });
