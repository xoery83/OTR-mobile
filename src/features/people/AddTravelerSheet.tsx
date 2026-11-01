import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Keyboard, Modal, ScrollView, StyleSheet } from "react-native";
import { SheetHeader } from "@/components/SheetHeader";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { createUuid } from "@/domain/localId";
import {
  personCloudCreateSchema,
  type PersonCloudCreate,
} from "@/domain/trip/tripPersonCloudCreate";
import { UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";
import type { TripPersonEditorDraftPort } from "@/data/repositories/tripPersonEditorDraft";

export type AddTravelerInput = Readonly<
  Pick<PersonCloudCreate, "operationId" | "personId" | "displayName">
>;
type Props = {
  visible: boolean;
  onClose(): void;
  // The owning caller fences the Account/Trip and saves through the existing repository.
  onSave(input: AddTravelerInput): Promise<void>;
  draft?: TripPersonEditorDraftPort;
};

export function AddTravelerSheet(props: Props) {
  return props.visible ? <AddTravelerForm {...props} /> : null;
}

function AddTravelerForm({ onClose, onSave, draft }: Props) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const currentGeneration = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ready, setReady] = useState(!draft);
  const [draftError, setDraftFeedback] = useState<"LOAD_FAILED" | "SAVE_FAILED" | null>(
    null,
  );
  const [generation] = useState(currentGeneration);
  const alive = useRef(true);
  const running = useRef(false);
  const loading = useRef(false);
  const attempt = useRef<AddTravelerInput | null>(null);
  const currentName = useRef("");
  const [originalDraft] = useState(draft);
  const latestDraft = useRef(draft);
  useLayoutEffect(() => {
    latestDraft.current = draft;
  }, [draft]);
  const valid = () =>
    alive.current &&
    generation === getAccountGeneration() &&
    originalDraft === latestDraft.current &&
    (!draft || draft.context.generation === generation);
  async function loadDraft() {
    if (!draft || !valid() || running.current || loading.current) return;
    loading.current = true;
    setDraftFeedback(null);
    try {
      const saved = await draft.read();
      if (!valid()) return;
      if (
        saved &&
        (saved.accountId !== draft.context.accountId ||
          saved.tripId !== draft.context.tripId)
      )
        throw Error("PERSON_DRAFT_CONTEXT_MISMATCH");
      currentName.current = saved?.displayName ?? "";
      setName(currentName.current);
      attempt.current = saved?.attempt ?? null;
      setSubmitted(!!attempt.current);
      setFailed(!!attempt.current);
      setReady(true);
    } catch {
      if (valid()) setDraftFeedback({ key: "people.draftLoadFailed" });
    } finally {
      loading.current = false;
    }
  }
  useEffect(() => {
    alive.current = true;
    void loadDraft();
    return () => {
      alive.current = false;
    };
    // The mounted editor owns its original scope; changes invalidate rather than reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const parsed = personCloudCreateSchema.shape.displayName.safeParse(name.trim());
  async function save() {
    const current = personCloudCreateSchema.shape.displayName.safeParse(
      currentName.current.trim(),
    );
    if (!valid() || !ready || running.current || !current.success) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    setDraftFeedback(null);
    let saved = false;
    try {
      Keyboard.dismiss();
      if (draft) await draft.saveName(current.data);
      if (!valid()) return;
      // A lost local-save reply retries the same Person and intent, never a second traveler.
      attempt.current ??= Object.freeze({
        operationId: createUuid(),
        personId: createUuid(),
        displayName: current.data,
      });
      setSubmitted(true);
      if (draft) await draft.retainAttempt(attempt.current);
      if (!valid()) return;
      await onSave(attempt.current);
      if (!valid()) return;
      if (draft) await draft.complete(attempt.current.operationId);
      saved = true;
    } catch {
      if (valid()) setFailed(true);
    } finally {
      running.current = false;
      if (valid()) setBusy(false);
    }
    if (saved && valid()) {
      alive.current = false;
      onClose();
    }
  }
  const close = () => {
    if (!valid() || running.current) return;
    if (!draft || !ready || attempt.current) {
      alive.current = false;
      onClose();
      return;
    }
    running.current = true;
    setBusy(true);
    void draft
      .discard()
      .then(() => {
        if (valid()) {
          alive.current = false;
          onClose();
        }
      })
      .catch(() => {
        if (valid()) setDraftFeedback({ key: "people.draftSaveFailed" });
      })
      .finally(() => {
        running.current = false;
        if (valid()) setBusy(false);
      });
  };
  if (generation !== currentGeneration || originalDraft !== draft) return null;
  return (
    <Modal
      visible
      presentationStyle="pageSheet"
      animationType="slide"
      allowSwipeDismissal={!busy}
      onRequestClose={close}
    >
      <SheetHeader
        category="form"
        title={t("people.addTraveler")}
        leftLabel={t(submitted ? "common.close" : "common.cancel")}
        onLeft={close}
        leftDisabled={busy}
        rightLabel={t(
          !ready
            ? "common.tryAgain"
            : failed
              ? "people.retrySave"
              : "people.saveTraveler",
        )}
        onRight={() => void (!ready ? loadDraft() : save())}
        rightDisabled={
          busy ||
          (!ready ? draftError?.key !== "people.draftLoadFailed" : !parsed.success)
        }
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.body}
        contentContainerStyle={styles.content}
      >
        {draftError ? (
          <UiText accessibilityRole="alert" style={styles.error}>
            {t(draftError.key)}
          </UiText>
        ) : null}
        {failed ? (
          <UiText
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.error}
          >
            {t("people.saveUnconfirmed")}
          </UiText>
        ) : null}
        <UiTextInput
          testID="people-add-traveler-name"
          accessibilityLabel={t("people.travelerName")}
          placeholder={t("people.travelerName")}
          value={name}
          onChangeText={(value) => {
            if (!valid() || running.current || !ready || attempt.current) return;
            currentName.current = value;
            setName(value);
            if (draft)
              void draft
                .saveName(value)
                .then(() => {
                  if (valid()) setDraftFeedback(null);
                })
                .catch(() => {
                  if (valid()) setDraftFeedback({ key: "people.draftSaveFailed" });
                });
          }}
          editable={ready && !busy && !submitted}
          maxLength={256}
          autoCapitalize="words"
        />
        <UiText style={styles.hint}>{t("people.addTravelerHint")}</UiText>
      </ScrollView>
    </Modal>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.section },
    hint: { ...visual.type.meta, color: colors.textSecondary },
    error: { ...visual.type.meta, color: colors.destructive },
  });
