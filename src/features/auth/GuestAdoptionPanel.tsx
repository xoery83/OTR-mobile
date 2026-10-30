import { useEffect, useRef, useState } from "react";
import { usePreventRemove } from "expo-router/react-navigation";
import type { LocalSession } from "@/domain/auth/localSession";
import { prepareGuestTripP1Adoption } from "@/data/auth/guestTripP1Adoption";
import {
  readCommittedLocalPrincipal,
  readCommittedLocalSession,
} from "@/data/auth/authRepository";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { assertAccountRequestGeneration } from "@/data/auth/accountRequestContext";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export function GuestAdoptionPanel({
  session,
  generation,
  signal,
  onComplete,
  onFinished,
  onCancel,
  onBusyChange,
}: {
  session: LocalSession;
  generation: number;
  signal: AbortSignal;
  onComplete(session: LocalSession, generation: number): Promise<void>;
  onFinished(): void;
  onCancel(): void;
  onBusyChange(busy: boolean): void;
}) {
  useUiLocale();
  const attempt = useRef<Awaited<ReturnType<typeof prepareGuestTripP1Adoption>> | null>(
    null,
  );
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [canCancel, setCanCancel] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [stage, setStage] = useState<
    | "auth.adoptionCheck"
    | "auth.adoptionTransfer"
    | "auth.adoptionVerify"
    | "auth.adoptionCancelling"
    | null
  >(null);
  usePreventRemove(locked, () => {});
  useEffect(() => {
    if (!finished || locked || signal.aborted) return;
    const frame = requestAnimationFrame(onFinished);
    return () => cancelAnimationFrame(frame);
  }, [finished, locked, signal, onFinished]);
  async function run(cancel: boolean) {
    if (running.current || signal.aborted) return;
    running.current = true;
    setBusy(true);
    onBusyChange(true);
    setFailed(false);
    try {
      if (cancel || cancelling) {
        setCancelling(true);
        setLocked(true);
        setStage("auth.adoptionCancelling");
        if (!attempt.current)
          attempt.current = await prepareGuestTripP1Adoption(
            session,
            session.identity!.userId,
            generation,
            signal,
          );
        await attempt.current.cancel();
        setLocked(false);
        onCancel();
        return;
      }
      setLocked(true);
      setStage("auth.adoptionCheck");
      const currentGeneration = getAccountGeneration();
      const principal = await readCommittedLocalPrincipal();
      if (principal?.kind === "ACCOUNT") {
        if (principal.accountId !== session.identity?.userId)
          throw Error("AUTH_CONTEXT_CHANGED");
        const retained = await readCommittedLocalSession();
        if (
          !retained ||
          !session.identity ||
          retained.identity?.userId !== session.identity.userId
        )
          throw Error("AUTH_CONTEXT_CHANGED");
        assertAccountRequestGeneration({
          accountId: principal.accountId,
          generation: currentGeneration,
        });
        if (signal.aborted) throw Error("AUTH_ACTIVATION_CANCELED");
        await onComplete(retained, currentGeneration);
      } else {
        if (!attempt.current)
          attempt.current = await prepareGuestTripP1Adoption(
            session,
            session.identity!.userId,
            generation,
            signal,
          );
        setStage("auth.adoptionTransfer");
        await attempt.current.publish();
        setStage("auth.adoptionVerify");
        if (signal.aborted) throw Error("AUTH_ACTIVATION_CANCELED");
        await onComplete(session, generation);
      }
      setLocked(false);
      setFinished(true);
    } catch {
      if (!signal.aborted) {
        setFailed(true);
        if (!attempt.current) setLocked(false);
      }
    } finally {
      running.current = false;
      if (!signal.aborted) {
        setBusy(false);
        setCanCancel(attempt.current?.canCancel ?? true);
        onBusyChange(false);
        setStage(null);
      }
    }
  }
  return (
    <UiSection title={t("auth.adoptionTitle")}>
      <UiText>
        {t("auth.adoptionTarget", {
          account: session.identity?.email ?? session.identity?.userId ?? "",
        })}
      </UiText>
      {stage ? <UiText accessibilityLiveRegion="polite">{t(stage)}</UiText> : null}
      {failed ? (
        <UiText accessibilityRole="alert" accessibilityLiveRegion="polite">
          {t("auth.adoptionPending")}
        </UiText>
      ) : null}
      <UiButton
        label={t(
          cancelling
            ? "auth.adoptionRetryCancel"
            : failed
              ? "auth.adoptionRetry"
              : "auth.adoptionAdd",
        )}
        disabled={busy || finished}
        onPress={() => void run(false)}
      />
      <UiButton
        label={t("auth.adoptionCancel")}
        variant="text"
        disabled={busy || finished || !canCancel}
        onPress={() => void run(true)}
      />
    </UiSection>
  );
}
