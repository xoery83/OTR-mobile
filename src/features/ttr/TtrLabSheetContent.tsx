import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton } from "@/ui/controls";
import { t, formatUiNumber } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { ttrIdentityKey, type TtrMode } from "@/domain/trip/ttr";
import type { TtrLabInteractionView } from "./useTtrLabInteraction";

/** New copy is injected from the host's approved localization catalog. */
export type TtrLabSheetCopy = Readonly<{
  title: string;
  confirm: string;
  checkSaved: string;
  externalMaps: string;
  noMode: string;
  opening: string;
  saving: string;
  checking: string;
  unavailable: string;
  failure: string;
  uncertain: string;
  published: string;
  savedUnpublished: string;
  endpoints(from: string, to: string): string;
  confirmed(mode: string): string;
  preview(mode: string): string;
}>;
export function TtrLabSheetContent({
  view,
  facts,
  copy,
  onPreview,
  onConfirm,
  onDismiss,
  onRecover,
  onExternalMaps,
}: {
  view: TtrLabInteractionView;
  facts: {
    source: "SYNTHETIC_TTR_LAB";
    identityKey: string;
    fromLabel: string;
    toLabel: string;
  };
  copy: TtrLabSheetCopy;
  onPreview(mode: TtrMode): void;
  onConfirm(): void;
  onDismiss(): void;
  onRecover(): void;
  onExternalMaps?: () => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  if (typeof __DEV__ === "undefined" || __DEV__ !== true) return null;
  const state = view.state;
  const matches =
    facts.source === "SYNTHETIC_TTR_LAB" &&
    state?.identity &&
    facts.identityKey === ttrIdentityKey(state.identity);
  const ready =
    !!matches &&
    view.phase === "READY" &&
    state.qualification.status === "QUALIFIED" &&
    state.qualification.spatialEquivalence.equivalence !== "SAME_LOCATION" &&
    state.input?.period !== "PAST";
  const busy =
    view.phase === "SAVING" || view.phase === "RECOVERING" || view.phase === "OPENING";
  const feedback =
    (!matches && !busy) || (view.phase === "READY" && !ready)
      ? copy.unavailable
      : {
          CLOSED: copy.unavailable,
          OPENING: copy.opening,
          READY: null,
          SAVING: copy.saving,
          RECOVERING: copy.checking,
          UNAVAILABLE: copy.unavailable,
          ERROR: copy.failure,
          UNCERTAIN: copy.uncertain,
          PUBLISHED: copy.published,
          SAVED_UNPUBLISHED: copy.savedUnpublished,
        }[view.phase];
  const q = matches ? state.qualification : null;
  return (
    <View style={styles.root}>
      <SheetHeader title={copy.title} onLeft={onDismiss} />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <Text style={styles.label}>
          {matches ? copy.endpoints(facts.fromLabel, facts.toLabel) : copy.unavailable}
        </Text>
        {matches ? (
          <Text style={styles.meta}>
            {state.confirmed
              ? copy.confirmed(t(`ttr.mode.${state.confirmed.mode}`))
              : copy.noMode}
          </Text>
        ) : null}
        {matches && state.preview?.mode ? (
          <Text style={styles.meta}>
            {copy.preview(t(`ttr.mode.${state.preview.mode}`))}
          </Text>
        ) : null}
        {q?.status === "QUALIFIED" ? (
          <Text style={styles.meta}>
            {t("ttr.straightLineDistance", {
              distance: formatUiNumber(q.geometricDistance.meters / 1000, {
                maximumFractionDigits: 1,
              }),
            })}
          </Text>
        ) : null}
        <View accessibilityState={{ busy }}>
          {(["walking", "driving", "transit"] as const).map((mode) => (
            <UiButton
              key={mode}
              label={
                matches && state.preview?.mode === mode
                  ? copy.preview(t(`ttr.mode.${mode}`))
                  : t(`ttr.mode.${mode}`)
              }
              variant={matches && state.preview?.mode === mode ? "secondary" : "text"}
              disabled={!ready}
              onPress={() => {
                if (ready) onPreview(mode);
              }}
            />
          ))}
          {feedback ? (
            <Text accessibilityLiveRegion="polite" style={styles.meta}>
              {feedback}
            </Text>
          ) : null}
          <UiButton
            label={copy.confirm}
            disabled={!ready || !state?.preview?.mode}
            onPress={() => {
              if (ready && state?.preview?.mode) onConfirm();
            }}
          />
          {matches && (view.phase === "UNCERTAIN" || view.phase === "ERROR") ? (
            <UiButton label={copy.checkSaved} variant="secondary" onPress={onRecover} />
          ) : null}
          {onExternalMaps ? (
            <UiButton
              label={copy.externalMaps}
              variant="text"
              disabled={!ready}
              onPress={() => {
                if (ready) onExternalMaps();
              }}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.row },
    label: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
