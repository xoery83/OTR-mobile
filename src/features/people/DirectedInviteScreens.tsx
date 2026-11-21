import { useEffect, useRef, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { DirectedClaimContent, type DirectedClaimCopy } from "./DirectedClaimContent";
import {
  DirectedInviteRecipientsContent,
  type DirectedInviteCopy,
} from "./DirectedInviteRecipientsContent";
import type {
  createDirectedInviteController,
  createDirectedClaimController,
} from "./directedInviteControllers";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";

type StatusCopy = Readonly<{ loading: string; reload: string }>;

// React StrictMode replays effects for the same instance. Dispose real departures,
// not a same-controller replay; content view guards close old handlers immediately.
function useControllerLifetime(controller: { load(): Promise<void>; dispose(): void }) {
  const mounted = useRef<typeof controller | null>(null);
  useEffect(() => {
    mounted.current = controller;
    void controller.load();
    return () => {
      mounted.current = null;
      queueMicrotask(() => {
        if (mounted.current !== controller) controller.dispose();
      });
    };
  }, [controller]);
}

// Caller memoizes one Auth controller per Account/Trip/Person or invitation, and owns SheetHeader.
export function DirectedInviteScreen({
  controller,
  copy,
}: {
  controller: ReturnType<typeof createDirectedInviteController>;
  copy: DirectedInviteCopy & StatusCopy;
}) {
  const styles = useThemedStyles(createStyles);
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
  useControllerLifetime(controller);
  if (generation !== controller.context.generation) return null;
  return (
    <View style={styles.screen}>
      {state.recipients && state.phase !== "LOADING" ? (
        <DirectedInviteRecipientsContent
          context={controller.context}
          recipients={state.recipients}
          selectedAccountId={state.selectedAccountId}
          state={state.phase}
          copy={copy}
          onSelect={(id) => {
            void controller.select(id);
          }}
          onSend={() => {
            void controller.send();
          }}
          onCheckOriginal={() => {
            void controller.checkOriginal();
          }}
        />
      ) : (
        <UiSection title={copy.title}>
          <UiText>
            {state.phase === "LOADING"
              ? copy.loading
              : state.phase === "ISSUED"
                ? copy.pending
                : state.phase === "UNKNOWN"
                  ? copy.unknown
                  : copy.unavailable}
          </UiText>
          {state.phase === "UNKNOWN" ? (
            <UiButton
              label={copy.check}
              onPress={() => {
                void controller.checkOriginal();
              }}
            />
          ) : null}
        </UiSection>
      )}
      {state.phase === "UNAVAILABLE" ? (
        <UiButton
          label={copy.reload}
          onPress={() => {
            void controller.load();
          }}
        />
      ) : null}
    </View>
  );
}

export function DirectedClaimScreen({
  controller,
  copy,
}: {
  controller: ReturnType<typeof createDirectedClaimController>;
  copy: DirectedClaimCopy & StatusCopy & Readonly<{ verified: string }>;
}) {
  const styles = useThemedStyles(createStyles);
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
  useControllerLifetime(controller);
  if (generation !== controller.context.generation) return null;
  return (
    <View style={styles.screen}>
      {state.detail && state.phase !== "LOADING" ? (
        <DirectedClaimContent
          context={controller.context}
          detail={state.detail}
          state={state.phase}
          copy={{
            ...copy,
            check: state.operationId ? copy.check : copy.reload,
            readback: state.memberReadbackVerified ? copy.verified : copy.readback,
          }}
          readbackVerified={state.memberReadbackVerified}
          onConfirm={() => {
            void controller.confirm();
          }}
          onCheckOriginal={() => {
            if (state.operationId) void controller.checkOriginal();
            else void controller.retryReadback();
          }}
        />
      ) : (
        <UiSection title={copy.title}>
          <UiText>
            {state.phase === "LOADING"
              ? copy.loading
              : state.memberReadbackVerified
                ? copy.verified
                : state.phase === "AWAITING_READBACK"
                  ? copy.readback
                  : state.phase === "UNKNOWN"
                    ? copy.unknown
                    : copy.unavailable}
          </UiText>
          {state.phase === "UNKNOWN" ||
          (state.phase === "AWAITING_READBACK" && !state.memberReadbackVerified) ? (
            <UiButton
              label={state.operationId ? copy.check : copy.reload}
              onPress={() => {
                if (state.operationId) void controller.checkOriginal();
                else void controller.retryReadback();
              }}
            />
          ) : null}
        </UiSection>
      )}
      {state.phase === "UNAVAILABLE" ? (
        <UiButton
          label={copy.reload}
          onPress={() => {
            void controller.load();
          }}
        />
      ) : null}
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({ screen: { flex: 1, backgroundColor: c.background } });
