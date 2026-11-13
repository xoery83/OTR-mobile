import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { getDefaultAccountPrivateProfileEditor } from "@/data/repositories/defaultAccountProfileRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { AccountPrivateProfileScreen } from "./AccountPrivateProfileScreen";

type Editor = Awaited<ReturnType<typeof getDefaultAccountPrivateProfileEditor>>;

export function AccountPrivateProfilePage({ onCancel }: { onCancel(): void }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const lane = useRef<{ generation: number; active: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<{
    generation: number;
    editor?: Editor;
    failed?: boolean;
  } | null>(null);
  useEffect(() => {
    const current = { generation, active: true };
    lane.current = current;
    const valid = () =>
      current.active && lane.current === current && getAccountGeneration() === generation;
    void getDefaultAccountPrivateProfileEditor()
      .then((editor) => {
        if (!valid()) return;
        if (editor.scope.generation !== generation)
          throw Error("PRIVATE_PROFILE_ENTRY_GENERATION_MISMATCH");
        setView({ generation, editor });
      })
      .catch(() => {
        if (valid()) setView({ generation, failed: true });
      });
    return () => {
      current.active = false;
    };
  }, [generation, retry]);

  const closeLane = () => {
    const current = lane.current;
    if (
      !current?.active ||
      current.generation !== generation ||
      getAccountGeneration() !== generation
    )
      return false;
    current.active = false;
    return true;
  };
  const cancel = () => {
    if (closeLane()) onCancel();
  };
  const visible = view?.generation === generation ? view : null;
  if (visible?.editor)
    return <AccountPrivateProfileScreen {...visible.editor} onCancel={cancel} />;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <UiSection>
        {visible?.failed ? (
          <>
            <UiText accessibilityLiveRegion="polite">
              {t("privateProfile.loadFailed")}
            </UiText>
            <UiButton
              label={t("common.tryAgain")}
              onPress={() => {
                if (!closeLane()) return;
                setView(null);
                setRetry((value) => value + 1);
              }}
            />
          </>
        ) : (
          <ActivityIndicator accessibilityLabel={t("common.loading")} />
        )}
        <UiButton label={t("common.cancel")} variant="secondary" onPress={cancel} />
      </UiSection>
    </ScrollView>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.section },
  });
