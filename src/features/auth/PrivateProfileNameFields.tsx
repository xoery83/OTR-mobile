import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import type { AccountScope } from "@/data/auth/accountRequestContext";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

import type { PrivateProfileNameDraft } from "@/domain/auth/privateAccountProfile";
export type { PrivateProfileNameDraft } from "@/domain/auth/privateAccountProfile";

export function PrivateProfileNameFields({
  scope,
  draft,
  disabled = false,
  onChange,
}: {
  scope: AccountScope;
  draft: PrivateProfileNameDraft;
  disabled?: boolean;
  onChange(draft: PrivateProfileNameDraft): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
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
  const update = (changes: Partial<PrivateProfileNameDraft>) => {
    const current = latest.current;
    if (
      current.active &&
      !current.disabled &&
      current.scope.accountId === scope.accountId &&
      current.scope.generation === scope.generation &&
      scope.generation === getAccountGeneration()
    ) {
      current.draft = { ...current.draft, ...changes };
      current.onChange(current.draft);
    }
  };
  if (generation !== scope.generation) return null;
  const input = (key: "displayName" | "familyName" | "givenNames" | "fullName") => (
    <View style={styles.field}>
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
  const modeLabel = (mode: PrivateProfileNameDraft["mode"]) =>
    t(mode === "SPLIT" ? "privateProfile.splitName" : "privateProfile.unsplitName");
  return (
    <View style={styles.fields}>
      {input("displayName")}
      <UiText accessibilityRole="header" style={styles.heading}>
        {t("privateProfile.travelDocumentName")}
      </UiText>
      <UiText style={styles.hint}>{t("privateProfile.optionalHint")}</UiText>
      <UiText style={styles.label}>{t("privateProfile.nameFormat")}</UiText>
      {disabled ? (
        <UiText style={styles.hint}>{modeLabel(draft.mode)}</UiText>
      ) : (
        <View style={styles.choices}>
          {(["SPLIT", "UNSPLIT"] as const).map((mode) => (
            <UiChoiceChip
              key={mode}
              label={modeLabel(mode)}
              selected={draft.mode === mode}
              onPress={() => update({ mode })}
            />
          ))}
        </View>
      )}
      {draft.mode === "SPLIT" ? (
        <>
          {input("familyName")}
          {input("givenNames")}
        </>
      ) : (
        input("fullName")
      )}
      <UiText accessibilityRole="header" style={styles.heading}>
        {t("privateProfile.globalAkaDraft")}
      </UiText>
      <UiText style={styles.hint}>{t("privateProfile.akaDraftHint")}</UiText>
      {(draft.globalAkaDraft ?? []).map((alias, index) => (
        <UiTextInput
          key={index}
          testID={`private-profile-aka-${index}`}
          accessibilityLabel={t("privateProfile.globalAkaDraft")}
          value={alias}
          editable={!disabled}
          autoCorrect={false}
          autoCapitalize="none"
          onChangeText={(value) => {
            const aliases = [...(latest.current.draft.globalAkaDraft ?? [])];
            if (index >= aliases.length) return;
            aliases[index] = value;
            update({ globalAkaDraft: aliases });
          }}
        />
      ))}
      <UiButton
        label={t("privateProfile.addAkaDraft")}
        disabled={disabled}
        onPress={() =>
          update({ globalAkaDraft: [...(latest.current.draft.globalAkaDraft ?? []), ""] })
        }
      />
      <UiText style={styles.hint}>{t("privateProfile.privateHint")}</UiText>
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    fields: { gap: visual.space.row },
    field: { gap: visual.space.heading },
    choices: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    label: { ...visual.type.row, color: colors.textPrimary },
    heading: { ...visual.type.section, color: colors.textPrimary },
    hint: { ...visual.type.meta, color: colors.textSecondary },
  });
