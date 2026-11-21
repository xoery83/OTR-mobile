import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet } from "react-native";
import type { z } from "zod";
import type { directedInviteRecipientsSchema } from "@/data/api/directedInviteReadContracts";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export type DirectedInviteCopy = Readonly<
  Record<
    | "title"
    | "unnamed"
    | "send"
    | "check"
    | "busy"
    | "unknown"
    | "pending"
    | "unavailable"
    | "empty",
    string
  >
>;

// Authorized known-recipient presentation only. Caller translates copy via the canonical catalog.
export function DirectedInviteRecipientsContent({
  context,
  recipients,
  selectedAccountId,
  state,
  copy,
  onSelect,
  onSend,
  onCheckOriginal,
}: {
  context: AccountRequestContext;
  recipients: z.infer<typeof directedInviteRecipientsSchema>;
  selectedAccountId: string | null;
  state: "READY" | "BUSY" | "UNKNOWN" | "ISSUED" | "UNAVAILABLE";
  copy: DirectedInviteCopy;
  onSelect(accountId: string): void;
  onSend(): void;
  onCheckOriginal(): void;
}) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const styles = useThemedStyles(createStyles);
  const view = {
    context,
    recipients,
    selectedAccountId,
    state,
    onSelect,
    onSend,
    onCheckOriginal,
  };
  const latest = useRef<typeof view | null>(view);
  useLayoutEffect(() => {
    latest.current = view;
    return () => {
      latest.current = null;
    };
  });
  const current = () =>
    latest.current === view && getAccountGeneration() === context.generation;
  if (
    generation !== context.generation ||
    recipients.accountId !== context.accountId ||
    recipients.tripId !== context.tripId
  )
    return null;
  const editable = state === "READY";
  const selected = recipients.recipients.some((p) => p.accountId === selectedAccountId);
  const message =
    state === "ISSUED"
      ? copy.pending
      : state === "UNKNOWN"
        ? copy.unknown
        : state === "BUSY"
          ? copy.busy
          : state === "UNAVAILABLE"
            ? copy.unavailable
            : recipients.recipients.length === 0
              ? copy.empty
              : null;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <UiSection title={copy.title}>
        {recipients.recipients
          .filter((person) => editable || person.accountId === selectedAccountId)
          .map((person) =>
            editable ? (
              <UiChoiceChip
                key={person.accountId}
                label={person.displayName?.trim() || copy.unnamed}
                selected={person.accountId === selectedAccountId}
                onPress={() => {
                  if (current() && editable) onSelect(person.accountId);
                }}
              />
            ) : (
              <UiText key={person.accountId} style={styles.text}>
                {person.displayName?.trim() || copy.unnamed}
              </UiText>
            ),
          )}
        {message ? (
          <UiText accessibilityLiveRegion="polite" style={styles.text}>
            {message}
          </UiText>
        ) : null}
        <UiButton
          label={copy.send}
          disabled={!editable || !selected}
          onPress={() => {
            if (current() && editable && selected) onSend();
          }}
        />
        {state === "UNKNOWN" ? (
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
