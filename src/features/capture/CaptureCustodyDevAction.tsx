import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { captureCustodyDevConfig } from "@/data/operations/captureCustodyDevConfig";
import {
  captureCustodyDevQualified,
  createCaptureCustodyDevAction,
  captureCustodyDevFailure,
  type CaptureCustodyDevMode,
} from "@/data/operations/captureCustodyDev";
import type { runDefaultCaptureCustodyBatch } from "@/data/operations/defaultCaptureCustody";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
type Receipt = Awaited<ReturnType<typeof runDefaultCaptureCustodyBatch>>;
export function CaptureCustodyDevAction({
  job,
  isCurrent,
}: {
  job: CaptureJobReadModel;
  isCurrent: () => boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [busy, setBusy] = useState(false),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [failure, setFailure] = useState<ReturnType<
      typeof captureCustodyDevFailure
    > | null>(null);
  const active = useRef(false),
    running = useRef(false),
    epoch = useRef(0),
    live = useRef<() => boolean>(() => false);
  useEffect(() => {
    live.current = () =>
      active.current &&
      isCurrent() &&
      captureCustodyDevQualified(captureCustodyDevConfig, job);
  }, [isCurrent, job]);
  useEffect(() => {
    active.current = true;
    const requests = epoch;
    return () => {
      active.current = false;
      ++requests.current;
    };
  }, []);
  if (!isCurrent() || !captureCustodyDevQualified(captureCustodyDevConfig, job))
    return null;
  const run = async (mode: CaptureCustodyDevMode) => {
    if (!live.current() || running.current || !captureCustodyDevConfig) return;
    running.current = true;
    const request = ++epoch.current;
    const current = () => request === epoch.current && live.current();
    setBusy(true);
    setReceipt(null);
    setFailure(null);
    try {
      const execute = createCaptureCustodyDevAction(
        captureCustodyDevConfig,
        job,
        current,
      );
      const result = await execute(mode);
      if (current()) setReceipt(result);
    } catch (error) {
      if (current()) setFailure(captureCustodyDevFailure(error));
    } finally {
      if (request === epoch.current) {
        running.current = false;
        if (active.current) setBusy(false);
      }
    }
  };
  return (
    <UiSection title={t("capture.custodyDev.title")}>
      <UiButton
        label={t("capture.custodyDev.put")}
        variant="secondary"
        disabled={busy}
        onPress={() => void run("PUT_GET")}
      />
      <UiButton
        label={t("capture.custodyDev.read")}
        variant="secondary"
        disabled={busy}
        onPress={() => void run("GET_ONLY")}
      />
      {busy ? (
        <UiText accessibilityLiveRegion="polite" style={styles.copy}>
          {t("capture.custodyDev.running")}
        </UiText>
      ) : null}
      {failure ? (
        <UiText accessibilityRole="alert" style={styles.error}>
          {t("capture.custodyDev.failed", {
            stage: failure.stage,
            code: failure.code,
            status: failure.status ?? "UNKNOWN",
          })}
        </UiText>
      ) : null}
      {receipt ? (
        <>
          <UiText style={styles.copy}>
            {t("capture.custodyDev.verified")}
          </UiText>
          <UiText style={styles.copy}>
            {t("capture.custodyDev.receipt", {
              batchId: receipt.batchId,
              jobId: receipt.jobId,
            })}
          </UiText>
          {receipt.inputs.map((input) => (
            <UiText key={input.inputId} style={styles.copy}>
              {t("capture.custodyDev.inputReceipt", input)}
            </UiText>
          ))}
        </>
      ) : null}
    </UiSection>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    copy: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
