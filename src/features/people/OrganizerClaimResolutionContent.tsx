import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { UiChoiceChip, UiTextInput } from "@/ui/forms";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

const choices = ["CONFIRM", "CHOOSE_ANOTHER", "CREATE_NEW", "REJECT"] as const;
export type OrganizerClaimChoice = (typeof choices)[number];
type Person = Readonly<{ personId: string; displayName: string }>;
export type OrganizerClaimResolutionCopy = Readonly<{
  title: string;
  choices: Readonly<Record<OrganizerClaimChoice, string>>;
  newPersonName: string;
  emptyPeople: string;
  submit: string;
  confirmReject: string;
  rejectHint: string;
  checkOriginal: string;
  busy: string;
  unknown: string;
  offline: string;
  unavailable: string;
}>;

// Presentation only. Auth owns qualification, draft persistence, operation identity and result recovery.
// Caller supplies authorized people/actions and translated copy; no Reader means no enabled decision.
export function OrganizerClaimResolutionContent({
  context,
  review,
  state,
  eligibleActions = [],
  choice,
  selectedPersonId,
  newPersonName,
  copy,
  onChoose,
  onSelectPerson,
  onChangeName,
  onSubmit,
  onCheckOriginal,
}: {
  context: AccountRequestContext;
  review: Readonly<{
    context: AccountRequestContext;
    claimRequestId: string;
    claimantName: string;
    claimedPerson: Person | null;
    people: readonly Person[];
  }>;
  state: "READY" | "BUSY" | "UNKNOWN" | "OFFLINE" | "UNAVAILABLE";
  eligibleActions?: readonly OrganizerClaimChoice[];
  choice: OrganizerClaimChoice | null;
  selectedPersonId: string | null;
  newPersonName: string;
  copy: OrganizerClaimResolutionCopy;
  onChoose(choice: OrganizerClaimChoice): void;
  onSelectPerson(personId: string): void;
  onChangeName(name: string): void;
  onSubmit(): void;
  onCheckOriginal(): void;
}) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const styles = useThemedStyles(createStyles);
  const view = { context, review, state, choice, selectedPersonId, newPersonName };
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
    review.context.accountId !== context.accountId ||
    review.context.tripId !== context.tripId ||
    review.context.generation !== context.generation
  )
    return null;
  const ready = state === "READY";
  const permitted = (action: OrganizerClaimChoice) =>
    ready && eligibleActions.includes(action);
  const alternatives = review.people.filter(
    (person) => person.personId !== review.claimedPerson?.personId,
  );
  const validChoice =
    choice === "CONFIRM"
      ? !!review.claimedPerson
      : choice === "CHOOSE_ANOTHER"
        ? alternatives.some((person) => person.personId === selectedPersonId)
        : choice === "CREATE_NEW"
          ? newPersonName.trim().length > 0
          : choice === "REJECT";
  const canSubmit = choice !== null && permitted(choice) && validChoice;
  const message =
    state === "BUSY"
      ? copy.busy
      : state === "UNKNOWN"
        ? copy.unknown
        : state === "OFFLINE"
          ? copy.offline
          : state === "UNAVAILABLE" || eligibleActions.length === 0
            ? copy.unavailable
            : null;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <UiSection title={copy.title}>
        <UiText>{review.claimantName}</UiText>
        {review.claimedPerson ? (
          <UiText>{review.claimedPerson.displayName}</UiText>
        ) : null}
        {message ? <UiText accessibilityLiveRegion="polite">{message}</UiText> : null}
        <View style={styles.choices}>
          {choices.map((action) => (
            <UiChoiceChip
              key={action}
              label={copy.choices[action]}
              selected={choice === action}
              disabled={!permitted(action)}
              onPress={() => {
                if (current() && permitted(action)) onChoose(action);
              }}
            />
          ))}
        </View>
        {choice === "CHOOSE_ANOTHER" ? (
          <View style={styles.choices}>
            {alternatives.length === 0 ? <UiText>{copy.emptyPeople}</UiText> : null}
            {alternatives.map((person) => (
              <UiChoiceChip
                key={person.personId}
                label={person.displayName}
                selected={selectedPersonId === person.personId}
                disabled={!permitted("CHOOSE_ANOTHER")}
                onPress={() => {
                  if (current() && permitted("CHOOSE_ANOTHER"))
                    onSelectPerson(person.personId);
                }}
              />
            ))}
          </View>
        ) : null}
        {choice === "CREATE_NEW" ? (
          <UiTextInput
            accessibilityLabel={copy.newPersonName}
            placeholder={copy.newPersonName}
            value={newPersonName}
            editable={permitted("CREATE_NEW")}
            onChangeText={(name) => {
              if (current() && permitted("CREATE_NEW")) onChangeName(name);
            }}
          />
        ) : null}
        {choice === "REJECT" ? <UiText>{copy.rejectHint}</UiText> : null}
        <UiButton
          label={choice === "REJECT" ? copy.confirmReject : copy.submit}
          variant={choice === "REJECT" ? "destructive" : "primary"}
          disabled={!canSubmit}
          onPress={() => {
            if (current() && canSubmit) onSubmit();
          }}
        />
        {state === "UNKNOWN" ? (
          <UiButton
            label={copy.checkOriginal}
            variant="secondary"
            onPress={() => {
              if (current()) onCheckOriginal();
            }}
          />
        ) : null}
      </UiSection>
    </ScrollView>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    choices: { gap: visual.space.card },
  });
