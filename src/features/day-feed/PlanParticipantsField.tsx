import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { SheetHeader } from "@/components/SheetHeader";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { OpenParticipantPickerContext, type ParticipantPickerProps, type Participation } from "./participantPickerHandoff";
import { UiText } from "@/ui/controls";
import { UiChoiceChip, UiFormRow, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { useUiLocale } from "@/ui/useUiLocale";

const selected = (value: Participation, id: string) =>
  value.mode === "WHOLE_GROUP" ||
  (value.mode === "SELF" ? value.selfPersonId === id : value.people.includes(id));

const displayName = (person: ParticipantPickerProps["options"][number]) =>
  person.displayName.trim() ||
  (person.isCurrentActor ? t("common.you") : person.displayName);

export function PlanParticipantsField({ compact = false, ...props }: ParticipantPickerProps & { compact?: boolean }) {
  useUiLocale();
  const openHosted = useContext(OpenParticipantPickerContext);
  const latest = useRef<ParticipantPickerProps | null>(null);
  const generation = getAccountGeneration();
  useLayoutEffect(() => {
    latest.current = props;
    return () => { latest.current = null; };
  });
  const [open, setOpen] = useState(false);
  const { value, options, disabled } = props;
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const names = options.filter((p) => selected(value, p.personId)).map(displayName);
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
        compact={compact}
        label={summary}
        value={names.join(", ") || t("tripCreate.planChooseMembers")}
        disabled={disabled}
        leading={<AppIcon name="person.2" color={colors.accent} />}
        trailing={<AppIcon name="chevron.right" color={colors.textSecondary} />}
        onPress={() => {
          if (disabled) return;
          if (openHosted) {
            openHosted(() => generation === getAccountGeneration() ? latest.current : null);
          } else setOpen(true);
        }}
      />
      {open ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          allowSwipeDismissal
          onRequestClose={() => setOpen(false)}
        >
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <PlanParticipantsPicker {...props} onDone={draft => {
              props.onChange(draft);
              setOpen(false);
            }}>
              {(action, content) => (
                <>
                  <SheetHeader
                    wrapActions
                    category="picker"
                    safeTop={false}
                    title={t("tripCreate.planParticipants")}
                    onLeft={() => setOpen(false)}
                    rightLabel={action.label}
                    rightDisabled={action.disabled}
                    onRight={action.onPress}
                  />
                  <ScrollView style={styles.sheet} keyboardShouldPersistTaps="handled">
                    {content}
                  </ScrollView>
                </>
              )}
            </PlanParticipantsPicker>
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}

export function PlanParticipantsPicker({ value, options, disabled, onDone, children }: Omit<ParticipantPickerProps, "onChange"> & {
  onDone(draft: Participation): void;
  children(action: { label: string; disabled: boolean; onPress(): void }, content: ReactNode): ReactNode;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const [draft, setDraft] = useState(() => structuredClone(value));
  const [query, setQuery] = useState("");
  const count = options.filter(person => selected(draft, person.personId)).length;
  const canApply = !disabled && (draft.mode !== "SELECTED_MEMBERS" || draft.people.length > 0);
  return children({
    label: t("tripCreate.participantDone", { count }),
    disabled: !canApply,
    onPress: () => { if (canApply) onDone(draft); },
  }, (
    <View style={styles.content}>
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
          displayName(p)
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        )
        .map((person) => {
          const checked = selected(draft, person.personId);
          return (
            <Pressable
              key={person.personId}
              accessibilityRole="checkbox"
              accessibilityLabel={displayName(person)}
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
                  {Array.from(displayName(person).trim())[0]?.toLocaleUpperCase() ??
                    ""}
                </UiText>
              </View>
              <UiText style={styles.name}>{displayName(person)}</UiText>
            </Pressable>
          );
        })}
      {draft.mode === "SELECTED_MEMBERS" && !draft.people.length ? (
        <UiText style={styles.meta}>{t("tripCreate.planChooseOne")}</UiText>
      ) : null}
    </View>
  ));
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
