import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { UiText } from "@/ui/controls";
import { formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import {
  AddTravelerSheet,
  type AddTravelerInput,
} from "@/features/people/AddTravelerSheet";

type Props = {
  visible: boolean;
  members: TripPreparationSetup["members"] | null;
  onClose(): void;
  onAddTraveler?(input: AddTravelerInput): Promise<void>;
};

export function TripMembersSheet(props: Props) {
  return props.visible ? <VisiblePeopleSheet {...props} /> : null;
}

function VisiblePeopleSheet({ visible, members, onClose, onAddTraveler }: Props) {
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
          title={t("people.title")}
          safeTop={false}
          onLeft={onClose}
          rightLabel={t("people.addTraveler")}
          rightDisabled={!roster || !onAddTraveler}
          onRight={() => {
            if (roster && onAddTraveler) setAdding(true);
          }}
        />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.sheet}
          contentContainerStyle={styles.content}
        >
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
                        {person.localState === "LOCAL_PENDING" ? (
                          <UiText style={styles.meta}>
                            {t("tripMembers.localPending")}
                          </UiText>
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
