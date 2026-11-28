import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { ScrollView } from "react-native";
import { router } from "expo-router";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import type { createPendingClaimSubmissionController } from "./pendingClaimSubmissionController";

const terminalInvitationMessage = {
  EXPIRED: "people.directedClaim.expired",
  CLAIMED: "people.directedClaim.claimed",
  REVOKED: "people.directedClaim.revoked",
} as const;
type Controller = ReturnType<typeof createPendingClaimSubmissionController>;
// Auth owns the original intent, receipt and lifecycle; opening this view never submits.
export function PendingClaimSubmissionScreen({ controller }: { controller: Controller }) {
  useUiLocale();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const view = { state, controller };
  const latest = useRef<typeof view | null>(view);
  useLayoutEffect(() => {
    latest.current = view;
    return () => {
      latest.current = null;
    };
  });
  if (generation !== controller.context.generation) return null;
  const current = () =>
    latest.current === view &&
    controller.getSnapshot() === state &&
    getAccountGeneration() === controller.context.generation;
  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <UiSection title={t("people.pendingClaim.title")}>
        <UiText accessibilityLiveRegion="polite">
          {t(
            state.phase === "READY"
              ? "people.pendingClaim.ready"
              : state.phase === "RECORDED"
                ? "people.pendingClaim.recorded"
                : state.phase === "UNKNOWN"
                  ? "people.claimResolution.unknown"
                  : state.phase === "BUSY" || state.phase === "LOADING"
                    ? "people.claimResolution.busy"
                    : state.phase === "EXPIRED" || state.phase === "CLAIMED" || state.phase === "REVOKED"
                      ? terminalInvitationMessage[state.phase]
                      : "people.claimResolution.unavailable",
          )}
        </UiText>
        {state.invitation ? (
          <>
            <UiText>{state.invitation.tripName}</UiText>
            <UiText>{state.invitation.personName}</UiText>
          </>
        ) : null}
        {state.phase === "READY" ? (
          <UiButton
            label={t("people.pendingClaim.submit")}
            disabled={!state.preview || !state.invitation}
            onPress={() => {
              if (current() && state.preview && state.invitation)
                void controller.submit();
            }}
          />
        ) : null}
        {state.phase === "UNKNOWN" ? (
          <UiButton
            label={t("people.claimResolution.check")}
            variant="secondary"
            onPress={() => {
              if (current()) void controller.checkOriginal();
            }}
          />
        ) : null}
        {state.phase === "RECORDED" && state.requestId ? (
          <UiButton
            label={t("people.pendingClaim.review")}
            variant="secondary"
            onPress={() => {
              if (current())
                router.push({
                  pathname: "/claim-resolution",
                  params: {
                    tripId: controller.context.tripId,
                    requestId: state.requestId!,
                  },
                });
            }}
          />
        ) : null}
      </UiSection>
    </ScrollView>
  );
}
