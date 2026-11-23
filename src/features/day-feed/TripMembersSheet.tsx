import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { useEffect, useState, useLayoutEffect, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { router } from "expo-router";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  hostedTripMembersEnabled,
  tripMembersInvocations,
  type TripMembersProps,
} from "./hostedTripMembers";
import { AddTravelerSheet } from "@/features/people/AddTravelerSheet";

export function TripMembersSheet(props: TripMembersProps) {
  if (!props.visible) return null;
  return hostedTripMembersEnabled && props.tripId ? (
    <HostedPeopleLauncher {...props} />
  ) : (
    <VisiblePeopleSheet {...props} />
  );
}

function HostedPeopleLauncher(props: TripMembersProps) {
  const current = useRef(props);
  const invocation = useRef<string | undefined>(undefined);
  const generation = getAccountGeneration();
  useLayoutEffect(() => {
    current.current = props;
    tripMembersInvocations.update(invocation.current, props);
  }, [props]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive || generation !== getAccountGeneration()) return;
      invocation.current = tripMembersInvocations.stage(current.current);
      if (invocation.current)
        router.push({
          pathname: "/trip-members-sheet",
          params: { invocation: invocation.current },
        });
    });
    return () => {
      alive = false;
      tripMembersInvocations.release(invocation.current);
      invocation.current = undefined;
    };
  }, [props.tripId, generation]);
  return null;
}

function VisiblePeopleSheet({
  visible,
  members,
  onClose,
  onAddTraveler,
  onInvitePerson,
}: TripMembersProps) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [adding, setAdding] = useState(false);
  const roster = visible && members?.state === "AVAILABLE" ? members : null;
  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType="slide"
      allowSwipeDismissal
      onRequestClose={onClose}
    >
      <SafeAreaView edges={["bottom"]} style={styles.sheet}>
        <SheetHeader
          wrapActions
          title={t("people.title")}
          safeTop={false}
          onLeft={onClose}
          rightLabel={t("people.addTraveler")}
          rightDisabled={!roster || !onAddTraveler}
          onRight={() => {
            if (roster && onAddTraveler) setAdding(true);
          }}
        />
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheet}>
          <TripMembersRoster
            members={roster}
            onInvitePerson={
              onInvitePerson
                ? (personId) => {
                    onClose();
                    onInvitePerson(personId);
                  }
                : undefined
            }
          />
        </ScrollView>
        {onAddTraveler ? (
          <AddTravelerSheet
            visible={adding}
            onClose={() => setAdding(false)}
            onSave={onAddTraveler}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
export function TripMembersRoster({
  members,
  onInvitePerson,
}: Pick<TripMembersProps, "members" | "onInvitePerson">) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const roster = members?.state === "AVAILABLE" ? members : null;
  const frame = { roster, onInvitePerson };
  const latest = useRef<typeof frame | null>(frame);
  useLayoutEffect(() => {
    latest.current = frame;
    return () => {
      latest.current = null;
    };
  });
  return (
    <View style={styles.content}>
      {roster ? (
        <>
          <UiText style={styles.meta}>
            {t("tripForm.namedPeople", { count: formatUiNumber(roster.namedCount) })}
          </UiText>
          {[true, false].map((actor) => {
            const people = roster.people.filter(
              (person) => person.isCurrentActor === actor,
            );
            return people.length ? (
              <View key={String(actor)} style={styles.group}>
                <UiText accessibilityRole="header" style={styles.heading}>
                  {t(actor ? "tripMembers.currentActor" : "tripMembers.otherPeople")}
                </UiText>
                {people.map((person) => (
                  <View key={person.personId} style={styles.person}>
                    <UiText style={styles.name}>
                      {person.displayName.trim() ||
                        (person.isCurrentActor ? t("ui.you") : "")}
                    </UiText>
                    {!person.isCurrentActor &&
                    person.localState !== "LOCAL_PENDING" &&
                    onInvitePerson ? (
                      <UiButton
                        variant="text"
                        label={t("people.directedInvite.send")}
                        onPress={() => {
                          if (latest.current !== frame) return;
                          onInvitePerson(person.personId);
                        }}
                      />
                    ) : null}
                    {person.localState === "LOCAL_PENDING" ? (
                      <UiText style={styles.meta}>{t("tripMembers.localPending")}</UiText>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null;
          })}
          <UiText style={styles.meta}>{t("tripForm.namedPeopleHint")}</UiText>
        </>
      ) : (
        <UiText style={styles.meta}>{t("tripForm.membersUnknown")}</UiText>
      )}
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    group: { gap: visual.space.card },
    person: { minHeight: 44, gap: visual.space.heading },
    heading: { ...visual.type.section, color: c.textPrimary },
    name: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
