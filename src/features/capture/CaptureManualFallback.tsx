import { lazy, Suspense, useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

const ManualContent = lazy(() =>
  import("@/features/day-feed/ManualItineraryContent").then((module) => ({
    default: module.ManualItineraryContent,
  })),
);
export function CaptureManualFallback({
  model,
  isCurrent,
}: {
  model: CaptureJobReadModel;
  isCurrent(): boolean;
}) {
  const s = useThemedStyles(styles);
  const [open, setOpen] = useState(false),
    [saved, setSaved] = useState(false);
  const [generation] = useState(getAccountGeneration);
  const dismiss = useRef<(() => void) | null>(null),
    opening = useRef(false);
  const trip = model.batch.context.tripPrior?.id;
  const current = () => isCurrent() && generation === getAccountGeneration();
  const start = async () => {
    if (!trip || !current() || opening.current) return;
    opening.current = true;
    try {
      const api = await import("./captureTripPrior");
      const prior = await api.readCaptureTripPrior(trip, {
        accountId: model.batch.accountId,
        generation,
      });
      if (prior && current()) {
        setSaved(false);
        setOpen(true);
      }
    } finally {
      opening.current = false;
    }
  };
  return (
    <>
      <UiButton
        label={t("capture.ai.manual")}
        variant="secondary"
        disabled={!trip}
        onPress={() => void start().catch(() => {})}
      />
      {!trip ? <UiText style={s.meta}>{t("capture.ai.manualNeed")}</UiText> : null}
      {saved ? <UiText style={s.meta}>{t("capture.ai.manualSaved")}</UiText> : null}
      {open && trip ? (
        <Modal
          visible
          transparent
          presentationStyle="overFullScreen"
          animationType="slide"
          onRequestClose={() => {
            if (dismiss.current) dismiss.current();
            else setOpen(false);
          }}
        >
          <SafeAreaProvider style={s.body}>
            <Suspense
              fallback={
                <View style={s.body}>
                  <UiText style={s.meta}>{t("capture.jobLoading")}</UiText>
                </View>
              }
            >
              <ManualContent
                tripId={trip}
                generation={generation}
                initialDate={null}
                registerDismissHandler={(handler) => {
                  dismiss.current = handler;
                  return () => {
                    if (dismiss.current === handler) dismiss.current = null;
                  };
                }}
                onClose={() => setOpen(false)}
                onSaved={() => {
                  if (current()) {
                    setOpen(false);
                    setSaved(true);
                  }
                }}
              />
            </Suspense>
          </SafeAreaProvider>
        </Modal>
      ) : null}
    </>
  );
}
const styles = (c: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: c.background },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
