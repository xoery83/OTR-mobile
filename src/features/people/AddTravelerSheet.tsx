import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

export type AddTravelerInput = Readonly<
  Pick<PersonCloudCreate, "operationId" | "personId" | "displayName">
>;
type Props = {
  visible: boolean;
  onClose(): void;
  // The owning caller fences the Account/Trip and saves through the existing repository.
  onSave(input: AddTravelerInput): Promise<void>;
};

export function AddTravelerSheet(props: Props) {
  return props.visible ? <AddTravelerForm {...props} /> : null;
}

function AddTravelerForm({ onClose, onSave }: Props) {
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
  const [generation] = useState(currentGeneration);
  const alive = useRef(true);
  const running = useRef(false);
  const attempt = useRef<AddTravelerInput | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const parsed = personCloudCreateSchema.shape.displayName.safeParse(name.trim());
  async function save() {
    if (
      !alive.current ||
      running.current ||
      !parsed.success ||
      generation !== getAccountGeneration()
    )
      return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    let saved = false;
    try {
      Keyboard.dismiss();
      // A lost local-save reply retries the same Person and intent, never a second traveler.
      attempt.current ??= Object.freeze({
        operationId: createUuid(),
        personId: createUuid(),
        displayName: parsed.data,
      });
      setSubmitted(true);
      await onSave(attempt.current);
      saved = true;
    } catch {
      if (alive.current && generation === getAccountGeneration()) setFailed(true);
    } finally {
      running.current = false;
      if (alive.current && generation === getAccountGeneration()) setBusy(false);
    }
    if (saved && alive.current && generation === getAccountGeneration()) onClose();
  }
  const close = () => {
    if (alive.current && !running.current && generation === getAccountGeneration())
      onClose();
  };
  if (generation !== currentGeneration) return null;
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
        rightLabel={t(failed ? "people.retrySave" : "people.saveTraveler")}
        onRight={() => void save()}
        rightDisabled={busy || !parsed.success}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={styles.body}
        contentContainerStyle={styles.content}
      >
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
          accessibilityLabel={t("people.travelerName")}
          placeholder={t("people.travelerName")}
          value={name}
          onChangeText={setName}
          editable={!busy && !submitted}
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
