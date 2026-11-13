import { useSyncExternalStore } from "react";
import { ScrollView, StyleSheet } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";
import { AddTravelerSheet } from "./AddTravelerSheet";
import type { InviteClaimPreview } from "./inviteClaimPreview";

// Deliberately preview-only until the owning server receipt/read ports are available.
export function InviteClaimPreviewScreen({ preview }: { preview: InviteClaimPreview }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const state = useSyncExternalStore(
    preview.subscribe,
    preview.getSnapshot,
    preview.getSnapshot,
  );
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  if (generation !== state.invitation.context.generation) return null;
  const editable = state.outcome === "IDLE";
  const selected = state.invitation.people.find(
    (p) => p.personId === state.selectedPersonId,
  );
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={styles.screen} contentContainerStyle={styles.content}>
      <UiText accessibilityRole="alert" style={styles.hint}>
        {t("claimPreview.synthetic")}
      </UiText>
      <UiSection title={t("claimPreview.title")}>
        <UiText accessibilityLiveRegion="polite" style={styles.text}>
          {t(`claimPreview.status.${state.outcome}`)}
        </UiText>
        {selected ? <UiText style={styles.text}>{selected.displayName}</UiText> : null}
        {state.stage === "CHOOSE_ANOTHER" ? (
          <>
            {state.invitation.people.map((person) => (
              <UiButton
                key={person.personId}
                label={person.displayName}
                onPress={() => preview.selectPerson(person.personId)}
              />
            ))}
            <UiButton label={t("common.cancel")} onPress={preview.cancelChoice} />
          </>
        ) : (
          <>
            <UiButton
              label={t("claimPreview.confirm")}
              disabled={!editable || !selected}
              onPress={() => void preview.submit("CONFIRM")}
            />
            <UiButton
              label={t("claimPreview.chooseAnother")}
              disabled={!editable}
              onPress={preview.chooseAnother}
            />
            <UiButton
              label={t("claimPreview.createNew")}
              disabled={!editable}
              onPress={preview.createNew}
            />
            <UiButton
              label={t("claimPreview.reject")}
              disabled={!editable}
              onPress={() => void preview.submit("REJECT")}
            />
          </>
        )}
        {state.outcome === "UNKNOWN" ? (
          <UiText style={styles.hint}>{t("claimPreview.unknownHint")}</UiText>
        ) : null}
      </UiSection>
      <AddTravelerSheet
        visible={state.stage === "CREATE_NEW"}
        onClose={preview.cancelChoice}
        onSave={async (person) =>
          preview.previewNewPerson({
            personId: person.personId,
            displayName: person.displayName,
          })
        }
      />
    </ScrollView>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    text: { ...visual.type.row, color: colors.textPrimary },
    hint: { ...visual.type.meta, color: colors.textSecondary },
  });
