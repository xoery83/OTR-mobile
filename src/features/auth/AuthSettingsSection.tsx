import { useRef, useState, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { chooseUiLocale } from "@/native/uiLocalePreference";
import {
  chooseUiAppearance,
  getUiAppearancePreference,
  subscribeUiAppearancePreference,
  type UiAppearancePreference,
} from "@/native/uiAppearancePreference";
import { UiText } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { t, type UiLocale } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

export function AuthSettingsSection({ kind }: { kind: "language" | "appearance" }) {
  const locale = useUiLocale();
  const styles = useThemedStyles(createStyles);
  const appearance = useSyncExternalStore(
    subscribeUiAppearancePreference,
    getUiAppearancePreference,
    getUiAppearancePreference,
  );
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function save(value: UiLocale | UiAppearancePreference) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    try {
      if (value === "en" || value === "zh-Hans") await chooseUiLocale(value);
      else await chooseUiAppearance(value);
    } catch {
      setFailed(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {kind === "language" ? (
        <View style={styles.choices}>
          {busy ? (
            <UiText style={styles.hint}>
              {t(locale === "en" ? "navigation.english" : "navigation.chinese")}
            </UiText>
          ) : (
            (["en", "zh-Hans"] as const).map((value) => (
              <UiChoiceChip
                key={value}
                label={t(value === "en" ? "navigation.english" : "navigation.chinese")}
                selected={locale === value}
                onPress={() => {
                  // Event handler only: the ref fences a pending local preference write.
                  // eslint-disable-next-line react-hooks/refs
                  void save(value);
                }}
              />
            ))
          )}
        </View>
      ) : (
        <View style={styles.choices}>
          {busy ? (
            <UiText style={styles.hint}>
              {t(`authSettings.appearance.${appearance}`)}
            </UiText>
          ) : (
            (["system", "light", "dark"] as const).map((value) => (
              <UiChoiceChip
                key={value}
                label={t(`authSettings.appearance.${value}`)}
                selected={appearance === value}
                onPress={() => {
                  // Event handler only: the ref fences a pending local preference write.
                  // eslint-disable-next-line react-hooks/refs
                  void save(value);
                }}
              />
            ))
          )}
        </View>
      )}
      {failed ? (
        <UiText accessibilityRole="alert" style={styles.error}>
          {t("authSettings.preferenceSaveFailed")}
        </UiText>
      ) : null}
    </ScrollView>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: {
      gap: visual.space.section,
      padding: visual.space.page,
      width: "100%",
      maxWidth: 640,
      alignSelf: "center",
    },
    choices: { gap: visual.space.heading },
    hint: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
