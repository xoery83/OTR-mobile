import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
} from "@/domain/auth/privateAccountProfile";
import { UiButton, UiSection, UiText } from "@/ui/controls";
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
};
type Feedback = "draftSaved" | "loadFailed" | "saveFailed";

// Unmounted local-draft candidate. No cloud write or sync acceptance is implied.
export function AccountPrivateProfileScreen({
  scope,
  local,
}: {
  scope: AccountScope;
  local: LocalProfile;
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
    const current: Lane = { key, local, active: true, busy: false, draft: null };
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
      const draft = privateProfileNameDraftSchema.parse(current.draft);
      const result = await local.saveDraft(Object.freeze({ ...scope }), draft);
      if (!valid(current)) return;
      if (result.accountId !== scope.accountId)
        throw Error("PRIVATE_PROFILE_ACCOUNT_MISMATCH");
      setView((prior) => prior && { ...prior, feedback: "draftSaved" });
    } catch {
      if (valid(current))
        setView((prior) => prior && { ...prior, feedback: "saveFailed" });
    } finally {
      if (valid(current)) {
        current.busy = false;
        setView((prior) => prior && { ...prior, busy: false });
      }
    }
  };
  if (generation !== accountGeneration) return null;
  const visible = view?.key === key && view.local === local ? view : null;
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <UiSection title={t("privateProfile.title")}>
        <UiText style={styles.hint}>{t("privateProfile.draftOnlyHint")}</UiText>
        {!visible ? <ActivityIndicator accessibilityLabel={t("common.loading")} /> : null}
        {visible?.draft ? (
          <>
            <PrivateProfileNameFields
              scope={scope}
              draft={visible.draft}
              disabled={visible.busy}
              onChange={(draft) => {
                const current = lane.current;
                if (!valid(current) || current.busy) return;
                current.draft = draft;
                setView((prior) => prior && { ...prior, draft, feedback: undefined });
              }}
            />
            <UiButton
              label={t("privateProfile.saveDraft")}
              disabled={visible.busy}
              onPress={() => void save()}
            />
          </>
        ) : null}
        {visible?.feedback ? (
          <UiText
            accessibilityLiveRegion="polite"
            style={visible.feedback === "draftSaved" ? styles.hint : styles.error}
          >
            {t(`privateProfile.${visible.feedback}`)}
          </UiText>
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
      </UiSection>
    </ScrollView>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    hint: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
