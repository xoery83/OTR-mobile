import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Stack } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import type { createAccountProfileRepository } from "@/data/auth/accountProfileRepository";
import type { AccountScope } from "@/data/auth/accountRequestContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  privateProfileDraft,
  privateProfileNameDraftSchema,
  type PrivateProfileNameDraft,
  type PendingProfileAlias,
  withPendingProfileAlias,
} from "@/domain/auth/privateAccountProfile";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";
import { PrivateProfileNameFields } from "./PrivateProfileNameFields";

type LocalProfile = NonNullable<
  ReturnType<typeof createAccountProfileRepository>["local"]
>;
type Lane = {
  key: string;
  local: LocalProfile;
  active: boolean;
  busy: boolean;
  draft: PrivateProfileNameDraft | null;
  pendingAlias: PendingProfileAlias | null;
};
type Feedback = "draftSaved" | "loadFailed" | "saveFailed";

// The native editor saves the existing account-scoped draft on this device.
export function AccountPrivateProfileScreen({
  scope,
  local,
  onSaved,
}: {
  scope: AccountScope;
  local: LocalProfile;
  onSaved(): void;
}) {
  useUiLocale();
  const { accountId, generation: accountGeneration } = scope;
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const key = `${accountId}:${accountGeneration}`;
  const lane = useRef<Lane | null>(null);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<{
    key: string;
    local: LocalProfile;
    draft: PrivateProfileNameDraft | null;
    busy: boolean;
    feedback?: Feedback;
  } | null>(null);

  useEffect(() => {
    const current: Lane = { key, local, active: true, busy: false, draft: null, pendingAlias: null };
    lane.current = current;
    const valid = () =>
      current.active &&
      lane.current === current &&
      getAccountGeneration() === accountGeneration;
    void local
      .read(Object.freeze({ accountId, generation: accountGeneration }))
      .then((value) => {
        if (!valid()) return;
        if (value && value.accountId !== accountId)
          throw Error("PRIVATE_PROFILE_ACCOUNT_MISMATCH");
        current.draft = value?.draft ?? privateProfileDraft();
        setView({ key, local, draft: current.draft, busy: false });
      })
      .catch(() => {
        if (valid())
          setView({
            key,
            local,
            draft: null,
            busy: false,
            feedback: "loadFailed",
          });
      });
    return () => {
      current.active = false;
    };
  }, [key, local, retry, accountId, accountGeneration]);

  const valid = (current: Lane | null): current is Lane =>
    !!current &&
    current.active &&
    lane.current === current &&
    current.local === local &&
    current.key === key &&
    getAccountGeneration() === accountGeneration;
  const save = async () => {
    const current = lane.current;
    if (!valid(current) || current.busy || !current.draft) return;
    current.busy = true;
    setView((prior) => prior && { ...prior, busy: true, feedback: undefined });
    try {
      const draft = privateProfileNameDraftSchema.parse(
        withPendingProfileAlias(current.draft, current.pendingAlias),
      );
      const result = await local.saveDraft(Object.freeze({ ...scope }), draft);
      if (!valid(current)) return;
      if (result.accountId !== scope.accountId)
        throw Error("PRIVATE_PROFILE_ACCOUNT_MISMATCH");
      setView((prior) => prior && { ...prior, busy: false, feedback: "draftSaved" });
    } catch {
      if (!valid(current)) return;
      current.busy = false;
      setView((prior) => prior && { ...prior, busy: false, feedback: "saveFailed" });
    }
  };
  const visible = generation === accountGeneration && view?.key === key && view.local === local
    ? view
    : null;
  const readyToClose = visible?.feedback === "draftSaved";
  usePreventRemove(visible?.busy === true, () => {});
  // Wait for the pending-save navigation guard to release before returning.
  useEffect(() => {
    const current = lane.current;
    if (!readyToClose || !current?.active || current.key !== key ||
        current.local !== local || getAccountGeneration() !== accountGeneration) return;
    current.active = false;
    onSaved();
  }, [readyToClose, key, local, accountGeneration, onSaved]);
  if (generation !== accountGeneration) return null;
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t("ui.save")}
          disabled={!visible?.draft || visible.busy || readyToClose}
          onPress={() => void save()}
        >
          {t("ui.save")}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        <UiText style={styles.hint}>{t("privateProfile.draftOnlyHint")}</UiText>
        {!visible ? <ActivityIndicator accessibilityLabel={t("common.loading")} /> : null}
        {visible?.feedback && !readyToClose ? (
          <UiText
            accessibilityLiveRegion="polite"
            style={styles.error}
          >
            {t(`privateProfile.${visible.feedback}`)}
          </UiText>
        ) : null}
        {visible?.draft ? (
          <PrivateProfileNameFields
            key={key}
            scope={scope}
            draft={visible.draft}
            disabled={visible.busy || readyToClose}
            onPendingAliasChange={(pending) => {
              const current = lane.current;
              if (valid(current) && !current.busy) current.pendingAlias = pending;
            }}
            onChange={(draft) => {
              const current = lane.current;
              if (!valid(current) || current.busy) return;
              current.draft = draft;
              setView((prior) => prior && { ...prior, draft, feedback: undefined });
            }}
          />
        ) : null}
        {visible?.feedback === "loadFailed" ? (
          <UiButton
            label={t("common.tryAgain")}
            onPress={() => {
              if (!valid(lane.current)) return;
              setView(null);
              setRetry((value) => value + 1);
            }}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: {
      width: "100%", maxWidth: 640, alignSelf: "center",
      padding: visual.space.page, gap: visual.space.row,
    },
    hint: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
