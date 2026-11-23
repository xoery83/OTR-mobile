import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Switch, View, useWindowDimensions } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type { AccountScope } from "@/data/auth/accountRequestContext";
import { AppIcon } from "@/components/AppIcon";
import { UiSection, UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

import {
  withPendingProfileAlias,
  type PendingProfileAlias,
  type PrivateProfileNameDraft,
} from "@/domain/auth/privateAccountProfile";
export type { PrivateProfileNameDraft } from "@/domain/auth/privateAccountProfile";

export function PrivateProfileNameFields({
  scope,
  draft,
  disabled = false,
  onChange,
  onPendingAliasChange,
}: {
  scope: AccountScope;
  draft: PrivateProfileNameDraft;
  disabled?: boolean;
  onChange(draft: PrivateProfileNameDraft): void;
  onPendingAliasChange?(value: PendingProfileAlias | null): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const { width, fontScale } = useWindowDimensions();
  const [aliasInput, setAliasInput] = useState("");
  const aliasInputRef = useRef("");
  const [editingAlias, setEditingAlias] = useState<number | null>(null);
  const effectiveWidth = width / fontScale;
  const splitRow = effectiveWidth >= 310;
  const inlineCaption = effectiveWidth >= 460;
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const latest = useRef({ scope, draft, disabled, onChange, active: true });
  useLayoutEffect(() => {
    latest.current = { scope, draft, disabled, onChange, active: true };
    return () => {
      latest.current.active = false;
    };
  }, [scope, draft, disabled, onChange]);
  const canEdit = () => {
    const current = latest.current;
    return current.active &&
      !current.disabled &&
      current.scope.accountId === scope.accountId &&
      current.scope.generation === scope.generation &&
      scope.generation === getAccountGeneration();
  };
  const update = (changes: Partial<PrivateProfileNameDraft>) => {
    if (!canEdit()) return false;
    const current = latest.current;
    current.draft = { ...current.draft, ...changes };
    current.onChange(current.draft);
    return true;
  };
  if (generation !== scope.generation) return null;
  const input = (
    key: "displayName" | "familyName" | "givenNames" | "fullName",
    half = false,
  ) => (
    <View style={[styles.field, half && styles.half]}>
      <UiText style={styles.label}>{t(`privateProfile.${key}`)}</UiText>
      <UiTextInput
        testID={`private-profile-${key}`}
        accessibilityLabel={t(`privateProfile.${key}`)}
        value={draft[key]}
        onChangeText={(value) => update({ [key]: value })}
        editable={!disabled}
        autoCorrect={false}
        autoCapitalize="none"
      />
    </View>
  );
  const changeAliasInput = (value: string, index: number | null = editingAlias) => {
    if (!canEdit()) return;
    aliasInputRef.current = value;
    setAliasInput(value);
    onPendingAliasChange?.(value.trim() ? { value, index } : null);
  };
  const clearAliasInput = () => {
    changeAliasInput("");
    setEditingAlias(null);
  };
  const addAlias = () => {
    const value = aliasInputRef.current;
    if (!value.trim() || value.includes("\0")) return;
    const draft = withPendingProfileAlias(latest.current.draft, { value, index: editingAlias });
    if (update({ globalAkaDraft: draft.globalAkaDraft })) clearAliasInput();
  };
  return (
    <View style={styles.fields}>
      <UiSection>{input("displayName")}</UiSection>
      <UiSection>
        <View style={inlineCaption ? styles.captionRow : styles.stackedCaption}>
          <UiText accessibilityRole="header" style={[styles.heading, inlineCaption && styles.half]}>
            {t("privateProfile.travelDocumentName")}
          </UiText>
          <View style={[styles.splitToggle, !inlineCaption && styles.stackedToggle]}>
            <UiText accessible={false} importantForAccessibility="no" style={styles.toggleLabel}>
              {t("privateProfile.splitName")}
            </UiText>
            <Switch
              accessibilityLabel={t("privateProfile.splitName")}
              disabled={disabled}
              value={draft.mode === "SPLIT"}
              onValueChange={(split) => {
                update({ mode: split ? "SPLIT" : "UNSPLIT" });
              }}
            />
          </View>
        </View>
        <UiText style={styles.hint}>{t("privateProfile.optionalHint")}</UiText>
        {draft.mode === "SPLIT" ? (
          <View style={splitRow ? styles.splitRow : styles.fields}>
            {input("familyName", splitRow)}
            {input("givenNames", splitRow)}
          </View>
        ) : (
          input("fullName")
        )}
      </UiSection>
      <UiSection>
        <UiText accessibilityRole="header" style={styles.heading}>
          {t("privateProfile.globalAkaDraft")}
        </UiText>
        <UiText style={styles.hint}>{t("privateProfile.akaDraftHint")}</UiText>
        {draft.globalAkaDraft?.length ? (
          <View style={styles.tags}>
            {draft.globalAkaDraft.map((alias, index) => (
              <View key={index} style={styles.tag}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("privateProfile.editAlias", { name: alias || t("privateProfile.emptyAlias") })}
                  disabled={disabled}
                  onPress={() => {
                    if (!canEdit()) return;
                    setEditingAlias(index);
                    changeAliasInput(alias, index);
                  }}
                  style={styles.editTag}
                >
                  <UiText style={styles.tagText}>{alias || t("privateProfile.emptyAlias")}</UiText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("privateProfile.removeAlias", {
                    name: alias || t("privateProfile.emptyAlias"),
                  })}
                  disabled={disabled}
                  onPress={() => {
                    const aliases = latest.current.draft.globalAkaDraft ?? [];
                    if (aliases[index] !== alias ||
                      !update({ globalAkaDraft: aliases.filter((_, i) => i !== index) })) return;
                    if (editingAlias !== null) clearAliasInput();
                  }}
                  style={styles.remove}
                >
                  <AppIcon name="xmark" size={12} color={colors.accent} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <UiTextInput
          testID="private-profile-alias"
          accessibilityLabel={t("privateProfile.addAkaDraft")}
          placeholder={t("privateProfile.addAkaDraft")}
          value={aliasInput}
          onChangeText={(value) => changeAliasInput(value)}
          returnKeyType="done"
          onSubmitEditing={addAlias}
          editable={!disabled}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {aliasInput.trim() ? (
          <Pressable accessibilityRole="button" disabled={disabled} onPress={addAlias} style={styles.captionRow}>
            <AppIcon name="plus.circle" size={20} color={colors.accent} />
            <UiText style={styles.tagText}>
              {editingAlias === null ? t("privateProfile.addAliasValue", { name: aliasInput }) : t("privateProfile.saveAliasValue", { name: aliasInput })}
            </UiText>
          </Pressable>
        ) : null}
      </UiSection>
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    fields: { gap: visual.space.row },
    field: { gap: visual.space.heading },
    splitRow: { flexDirection: "row", gap: visual.space.card },
    half: { flex: 1, minWidth: 0 },
    captionRow: { flexDirection: "row", alignItems: "center", gap: visual.space.card, minHeight: 44 },
    stackedCaption: { gap: visual.space.heading },
    splitToggle: {
      flexDirection: "row", alignItems: "center", justifyContent: "flex-end",
      flexShrink: 1, gap: visual.space.heading, minHeight: 44,
    },
    stackedToggle: { justifyContent: "space-between" },
    toggleLabel: { ...visual.type.meta, color: colors.textSecondary, flexShrink: 1 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    tag: {
      flexDirection: "row", alignItems: "center", maxWidth: "100%",
      paddingLeft: visual.space.row, borderRadius: visual.radius.pill, backgroundColor: colors.accentSurface,
    },
    editTag: { minHeight: 44, justifyContent: "center", flexShrink: 1 },
    tagText: { ...visual.type.action, color: colors.accent, flexShrink: 1 },
    remove: { minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" },
    label: { ...visual.type.row, color: colors.textPrimary },
    heading: { ...visual.type.section, color: colors.textPrimary },
    hint: { ...visual.type.meta, color: colors.textSecondary },
  });
