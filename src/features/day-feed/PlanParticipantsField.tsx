import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { SheetHeader } from "@/components/SheetHeader";
import type { ManualPlanFields } from "@/data/repositories/manualPlanRepository";
import { UiText } from "@/ui/controls";
import { UiChoiceChip, UiFormRow, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

type Participation = ManualPlanFields["participation"];
export function PlanParticipantsField({
  value,
  options,
  disabled,
  onChange,
}: {
  value: Participation;
  options: readonly { personId: string; displayName: string }[];
  disabled: boolean;
  onChange(value: Participation): void;
}) {
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value),
    [query, setQuery] = useState("");
  const selected = (v: Participation, id: string) =>
    v.mode === "WHOLE_GROUP" ||
    (v.mode === "SELF" ? v.selfPersonId === id : v.people.includes(id));
  const names = options
    .filter((p) => selected(value, p.personId))
    .map((p) => p.displayName);
  const count = options.filter((p) => selected(draft, p.personId)).length;
  const summary =
    value.mode === "WHOLE_GROUP"
      ? t("tripCreate.planEveryone")
      : value.mode === "SELF"
        ? t("tripCreate.planOnlyMe")
        : t("tripCreate.participantCount", { count: value.people.length });
  return (
    <View style={styles.field}>
      <UiText style={styles.caption}>{t("tripCreate.planParticipants")}</UiText>
      <UiFormRow
        variant="action"
        label={summary}
        value={names.join(", ") || t("tripCreate.planChooseMembers")}
        disabled={disabled}
        leading={<AppIcon name="person.2" color={colors.accent} />}
        trailing={<AppIcon name="chevron.right" color={colors.textSecondary} />}
        onPress={() => {
          setDraft(structuredClone(value));
          setQuery("");
          setOpen(true);
        }}
      />
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <SheetHeader
            category="picker"
            safeTop={false}
            title={t("tripCreate.planParticipants")}
            onLeft={() => setOpen(false)}
            rightLabel={t("tripCreate.participantDone", { count })}
            rightDisabled={
              disabled || (draft.mode === "SELECTED_MEMBERS" && draft.people.length === 0)
            }
            onRight={() => {
              if (!disabled) onChange(draft);
              setOpen(false);
            }}
          />
          <ScrollView
            style={styles.sheet}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <UiTextInput
              accessibilityLabel={t("tripCreate.searchParticipants")}
              placeholder={t("tripCreate.searchParticipants")}
              value={query}
              onChangeText={setQuery}
            />
            <View style={styles.modes}>
              <UiChoiceChip
                compact
                label={t("tripCreate.planEveryone")}
                selected={draft.mode === "WHOLE_GROUP"}
                onPress={() =>
                  setDraft({ mode: "WHOLE_GROUP", people: [], selfPersonId: null })
                }
              />
              {value.selfPersonId ? (
                <UiChoiceChip
                  compact
                  label={t("tripCreate.planOnlyMe")}
                  selected={draft.mode === "SELF"}
                  onPress={() =>
                    setDraft({
                      mode: "SELF",
                      people: [],
                      selfPersonId: value.selfPersonId,
                    })
                  }
                />
              ) : null}
            </View>
            {options
              .filter((p) =>
                p.displayName
                  .toLocaleLowerCase()
                  .includes(query.trim().toLocaleLowerCase()),
              )
              .map((person) => {
                const checked = selected(draft, person.personId);
                return (
                  <Pressable
                    key={person.personId}
                    accessibilityRole="checkbox"
                    accessibilityLabel={person.displayName}
                    accessibilityState={{ checked, disabled }}
                    disabled={disabled}
                    style={[styles.person, checked && styles.selected]}
                    onPress={() => {
                      const ids =
                        draft.mode === "SELECTED_MEMBERS"
                          ? draft.people
                          : options
                              .filter((p) => selected(draft, p.personId))
                              .map((p) => p.personId);
                      setDraft({
                        mode: "SELECTED_MEMBERS",
                        people: checked
                          ? ids.filter((id) => id !== person.personId)
                          : [...ids, person.personId],
                        selfPersonId: null,
                      });
                    }}
                  >
                    <AppIcon
                      name={checked ? "checkmark.square.fill" : "square"}
                      color={checked ? colors.accent : colors.textSecondary}
                    />
                    <View style={styles.avatar}>
                      <UiText style={styles.initial}>
                        {Array.from(person.displayName.trim())[0]?.toLocaleUpperCase() ??
                          ""}
                      </UiText>
                    </View>
                    <UiText style={styles.name}>{person.displayName}</UiText>
                  </Pressable>
                );
              })}
            {draft.mode === "SELECTED_MEMBERS" && !draft.people.length ? (
              <UiText style={styles.meta}>{t("tripCreate.planChooseOne")}</UiText>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    field: { gap: visual.space.heading },
    caption: { ...visual.type.action, color: c.textPrimary },
    sheet: { flex: 1, backgroundColor: c.surface },
    content: { padding: visual.space.page, gap: visual.space.card },
    modes: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.card },
    person: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: visual.radius.control,
    },
    selected: { backgroundColor: c.selected },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.groupedBackground,
      alignItems: "center",
      justifyContent: "center",
    },
    initial: { ...visual.type.row, color: c.textSecondary },
    name: { flex: 1, ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
