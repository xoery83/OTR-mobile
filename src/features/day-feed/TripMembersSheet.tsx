import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { UiText } from "@/ui/controls";
import { formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";

export function TripMembersSheet({
  visible,
  members,
  onClose,
}: {
  visible: boolean;
  members: TripPreparationSetup["members"] | null;
  onClose(): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
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
        <SheetHeader title={t("tripHome.members")} safeTop={false} onLeft={onClose} />
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
                        <UiText style={styles.name}>{person.displayName}</UiText>
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
          <UiText style={styles.meta}>{t("tripMembers.managementUnavailable")}</UiText>
        </ScrollView>
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
