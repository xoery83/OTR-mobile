import { StyleSheet, View } from "react-native";
import type {
  CaptureJobReadModel,
  CaptureSubmissionInput,
} from "@/domain/capture/captureSubmission";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { useUniversalPhotoRelevance } from "./useUniversalPhotoRelevance";

// Caller provides translated copy; this local row grants no paid/Source/Save authority.
export type UniversalPhotoRelevanceCopy = {
  title: string;
  localOnly: string;
  notChecked: string;
  relevant: string;
  uncertain: string;
  irrelevant: string;
  originalChanged: string;
  unavailable: string;
  continueSelected: string;
  skipSelected: string;
  screen: string;
  chooseAi: string;
  skip: string;
};
export function UniversalPhotoRelevanceRow({
  model,
  input,
  isCurrent,
  copy,
}: {
  model: CaptureJobReadModel;
  input: CaptureSubmissionInput;
  isCurrent(): boolean;
  copy: UniversalPhotoRelevanceCopy;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const state = useUniversalPhotoRelevance(model, input, isCurrent);
  if (!state.eligible || !isCurrent()) return null;
  const value = state.value;
  const blocked = state.busy !== null;
  const choice =
    value?.persisted && !value.originalChanged ? value.decision.choice : "UNDECIDED";
  const relevance = value?.decision.relevance.status;
  return (
    <View style={styles.body}>
      <UiText accessibilityRole="header" style={styles.title}>
        {copy.title}
      </UiText>
      <UiText style={styles.meta}>{copy.localOnly}</UiText>
      {blocked ? (
        <UiText accessibilityLiveRegion="polite" style={styles.meta}>
          {t("common.loading")}
        </UiText>
      ) : null}
      {state.unavailable ? (
        <>
          <UiText accessibilityRole="alert" style={styles.error}>
            {copy.unavailable}
          </UiText>
          <UiButton
            label={t("common.tryAgain")}
            variant="text"
            disabled={blocked}
            onPress={() => {
              void state.read();
            }}
          />
        </>
      ) : null}
      {value?.originalChanged ? (
        <UiText style={styles.meta}>{copy.originalChanged}</UiText>
      ) : null}
      <UiText accessibilityLiveRegion="polite" style={styles.meta}>
        {relevance === "RELEVANT"
          ? copy.relevant
          : relevance === "UNCERTAIN"
            ? copy.uncertain
            : relevance === "IRRELEVANT"
              ? copy.irrelevant
              : copy.notChecked}
      </UiText>
      {choice !== "UNDECIDED" ? (
        <UiText style={styles.meta}>
          {choice === "CONTINUE_WITH_AI" ? copy.continueSelected : copy.skipSelected}
        </UiText>
      ) : null}
      {!value || value.originalChanged ? (
        <UiButton
          label={copy.screen}
          variant="secondary"
          disabled={blocked || state.unavailable}
          onPress={() => {
            void state.screen();
          }}
        />
      ) : null}
      {value ? (
        <>
          <UiButton
            label={copy.chooseAi}
            variant="secondary"
            disabled={
              blocked ||
              state.unavailable ||
              !state.canChoose ||
              choice === "CONTINUE_WITH_AI"
            }
            onPress={() => {
              void state.choose("CONTINUE_WITH_AI");
            }}
          />
          <UiButton
            label={copy.skip}
            variant="text"
            disabled={
              blocked || state.unavailable || !state.canChoose || choice === "SKIP"
            }
            onPress={() => {
              void state.choose("SKIP");
            }}
          />
        </>
      ) : null}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { gap: visual.space.heading },
    title: { ...visual.type.meta, fontWeight: "600" as const, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
