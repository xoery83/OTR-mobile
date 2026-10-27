import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { SheetHeader } from "@/components/SheetHeader";
import { UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { createUuid } from "@/domain/localId";
import type { LocalPersonNameSlot } from "@/domain/trip/localTripPerson";
import { TripCalendarRangeField, type TripDateRange } from "./TripCalendarRangeField";
export function CreateTripV2Fields({
  name,
  onName,
  destinationEntry,
  range,
  onRange,
  selfNickname,
  knownSelfName = "",
  onSelfNickname,
  travelers,
  onTravelers,
  disabled,
}: {
  name: string;
  onName(value: string): void;
  destinationEntry: ReactNode;
  range: TripDateRange;
  onRange(value: TripDateRange): void;
  selfNickname: string;
  knownSelfName?: string;
  onSelfNickname(value: string): void;
  travelers: readonly LocalPersonNameSlot[];
  onTravelers(value: LocalPersonNameSlot[]): void;
  disabled: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const [editor, setEditor] = useState<{
    self: boolean;
    personId: string | null;
    value: string;
  } | null>(null);
  const done = () => {
    if (!editor || disabled) return;
    if (editor.self) onSelfNickname(editor.value);
    else if (editor.personId)
      onTravelers(
        travelers.map((person) =>
          person.personId === editor.personId
            ? { ...person, displayName: editor.value }
            : person,
        ),
      );
    else if (travelers.length < 100)
      onTravelers([
        ...travelers,
        { personId: createUuid(), operationId: createUuid(), displayName: editor.value },
      ]);
    setEditor(null);
  };
  return (
    <View style={styles.fields}>
      <View style={styles.section}>
        <UiText style={styles.label}>{t("createTripV2.name")}</UiText>
        <UiTextInput
          accessibilityLabel={t("createTripV2.name")}
          placeholder={t("createTripV2.namePlaceholder")}
          value={name}
          maxLength={256}
          editable={!disabled}
          onChangeText={onName}
        />
      </View>
      {destinationEntry}
      <TripCalendarRangeField
        value={range}
        onChange={onRange}
        disabled={disabled}
        presentation="field"
      />
      <View style={styles.section}>
        <UiText style={styles.label}>{t("createTripV2.travelers")}</UiText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("createTripV2.editName")}
          disabled={disabled}
          onPress={() =>
            setEditor({
              self: true,
              personId: null,
              value: selfNickname || knownSelfName,
            })
          }
          style={styles.row}
        >
          <UiText style={styles.value}>
            {selfNickname.trim() || knownSelfName
              ? t("createTripV2.youName", { name: selfNickname.trim() || knownSelfName })
              : t("createTripV2.addYourName")}
          </UiText>
          <AppIcon name="square.and.pencil" color={colors.accent} />
        </Pressable>
        {travelers.map((person) => (
          <View key={person.personId} style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("createTripV2.editTraveler")}
              disabled={disabled}
              style={styles.person}
              onPress={() =>
                setEditor({
                  self: false,
                  personId: person.personId,
                  value: person.displayName,
                })
              }
            >
              <UiText style={styles.value}>
                {person.displayName.trim() || t("createTripV2.nickname")}
              </UiText>
              <AppIcon name="square.and.pencil" color={colors.accent} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("createTripV2.removeTraveler", {
                name: person.displayName.trim() || t("createTripV2.nickname"),
              })}
              disabled={disabled}
              style={styles.remove}
              onPress={() =>
                onTravelers(
                  travelers.filter((entry) => entry.personId !== person.personId),
                )
              }
            >
              <AppIcon name="minus.circle" color={colors.textSecondary} />
            </Pressable>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("createTripV2.addTraveler")}
          disabled={disabled || travelers.length >= 100}
          style={styles.row}
          onPress={() => setEditor({ self: false, personId: null, value: "" })}
        >
          <AppIcon name="plus.circle" color={colors.accent} />
          <UiText style={styles.action}>{t("createTripV2.addTraveler")}</UiText>
        </Pressable>
        <UiText style={styles.meta}>{t("createTripV2.nameOnly")}</UiText>
      </View>
      <Modal
        visible={!!editor}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditor(null)}
      >
        <SafeAreaProvider style={styles.body}>
          <SheetHeader
            category="form"
            title={t(
              editor?.self ? "createTripV2.editName" : "createTripV2.editTraveler",
            )}
            leftLabel={t("common.cancel")}
            onLeft={() => setEditor(null)}
            rightLabel={t("common.done")}
            rightDisabled={disabled}
            onRight={done}
          />
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.editor}
            keyboardShouldPersistTaps="handled"
          >
            <UiTextInput
              autoFocus
              accessibilityLabel={t("createTripV2.nickname")}
              placeholder={t("createTripV2.nickname")}
              value={editor?.value ?? ""}
              maxLength={256}
              editable={!disabled}
              onChangeText={(value) =>
                setEditor((current) => (current ? { ...current, value } : null))
              }
            />
            <UiText style={styles.meta}>{t("createTripV2.optional")}</UiText>
          </ScrollView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    fields: { gap: visual.space.section },
    section: { gap: visual.space.card },
    label: { ...visual.type.action, color: colors.textPrimary },
    value: { ...visual.type.row, color: colors.textPrimary, flex: 1 },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    action: { ...visual.type.action, color: colors.accent },
    row: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.heading,
    },
    person: {
      flex: 1,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.heading,
    },
    remove: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    editor: { padding: visual.space.page, gap: visual.space.card },
  });
