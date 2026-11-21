import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type { AccountScope } from "@/data/auth/accountRequestContext";
import type { directedInvitationDetailSchema } from "@/data/api/directedInviteReadContracts";
import type { z } from "zod";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export type DirectedClaimCopy = Readonly<
  Record<
    | "title"
    | "confirm"
    | "check"
    | "busy"
    | "unknown"
    | "readback"
    | "expired"
    | "revoked"
    | "unavailable",
    string
  >
>;

// Recipient confirmation content, not organizer four-option resolution or a permission grant.
// Caller supplies catalog-translated copy on each locale change and owns the canonical SheetHeader.
export function DirectedClaimContent({
  context,
  detail,
  state,
  copy,
  onConfirm,
  onCheckOriginal,
  readbackVerified = false,
}: {
  context: AccountScope;
  detail: z.infer<typeof directedInvitationDetailSchema>;
  state: "READY" | "BUSY" | "UNKNOWN" | "AWAITING_READBACK" | "UNAVAILABLE";
  copy: DirectedClaimCopy;
  onConfirm(): void;
  onCheckOriginal(): void;
  readbackVerified?: boolean;
}) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const styles = useThemedStyles(createStyles);
  const view = { context, detail, state, onConfirm, onCheckOriginal, readbackVerified };
  const latest = useRef<typeof view | null>(view);
  useLayoutEffect(() => {
    latest.current = view;
    return () => {
      latest.current = null;
    };
  });
  const current = () =>
    latest.current === view && getAccountGeneration() === context.generation;
  if (generation !== context.generation || detail.accountId !== context.accountId)
    return null;
  const status = detail.invitation.status;
  const message =
    status === "REVOKED"
      ? copy.revoked
      : status === "EXPIRED"
        ? copy.expired
        : state === "UNAVAILABLE"
          ? copy.unavailable
          : state === "UNKNOWN"
            ? copy.unknown
            : status === "CLAIMED" || state === "AWAITING_READBACK"
              ? copy.readback
              : state === "BUSY"
                ? copy.busy
                : null;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <UiSection title={copy.title}>
        <UiText style={styles.text}>{detail.invitation.tripName}</UiText>
        <UiText style={styles.text}>{detail.invitation.personName}</UiText>
        {message ? (
          <UiText accessibilityLiveRegion="polite" style={styles.text}>
            {message}
          </UiText>
        ) : null}
        <UiButton
          label={copy.confirm}
          disabled={status !== "PENDING" || state !== "READY"}
          onPress={() => {
            if (current() && status === "PENDING" && state === "READY") onConfirm();
          }}
        />
        {state === "UNKNOWN" || (state === "AWAITING_READBACK" && !readbackVerified) ? (
          <UiButton
            label={copy.check}
            onPress={() => {
              if (current()) onCheckOriginal();
            }}
          />
        ) : null}
      </UiSection>
    </ScrollView>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    text: { ...visual.type.row, color: c.textPrimary },
  });
