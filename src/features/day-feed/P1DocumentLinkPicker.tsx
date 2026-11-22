import { useCallback, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SheetHeader } from "@/components/SheetHeader";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { coreDocumentDisplayTitle } from "@/features/documents/documentListPresentation";
import { UiText } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { formatUiDate, t } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

async function readLinkPicker(tripId: string, itemId: string, generation: number) {
  const [
    { requireAdoptedUserId },
    { readInitializedDatabase },
    { createTripCoreV2Repository },
    { tripCoreSha256Hex },
  ] = await Promise.all([
    import("@/data/auth/authRepository"),
    import("@/data/db/database"),
    import("@/data/repositories/tripCoreV2Repository"),
    import("@/data/repositories/tripCoreSha256"),
  ]);
  const repository = createTripCoreV2Repository(
    await readInitializedDatabase(),
    requireAdoptedUserId,
    tripCoreSha256Hex,
  );
  const context = await repository.captureContext(tripId);
  if (context.generation !== generation) return null;
  const choices = await repository.readP1DocumentLinkChoices(context, itemId);
  if (!choices) return null;
  return {
    ...choices,
    save: (document: (typeof choices.candidates)[number]) =>
      repository.enqueueP1DocumentLink(context, itemId, document.id, {
        itemRevision: choices.itemRevision,
        documentRevision: document.revision,
      }),
  };
}

export function useP1DocumentLinks(
  tripId: string,
  itemId: string,
  generation: number,
  revision: number,
  onQueued: () => void,
) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const key = `${generation}:${tripId}:${itemId}`;
  type Picker = NonNullable<Awaited<ReturnType<typeof readLinkPicker>>>;
  const [choices, setChoices] = useState<{ key: string; revision: number; picker: Picker } | null>(
    null,
  );
  const [opened, setOpened] = useState<{ key: string; picker: Picker } | null>(null);
  const [selected, setSelected] = useState<Picker["candidates"][number] | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const focus = useRef<{ key: string } | null>(null);
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focus.current = { key };
      return () => {
        focus.current = null;
        setOpened(null);
      };
    }, [key]),
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void readLinkPicker(tripId, itemId, generation)
        .then((picker) => {
          if (active && generation === getAccountGeneration())
            setChoices(picker ? { key, revision, picker } : null);
        })
        .catch(() => {
          if (active) setChoices(null);
        });
      return () => {
        active = false;
      };
    }, [tripId, itemId, generation, key, revision]),
  );

  const current = (scope: typeof focus.current) =>
    scope !== null &&
    focus.current === scope &&
    scope.key === key &&
    generation === getAccountGeneration();
  const close = () => {
    if (!busy.current) setOpened(null);
  };
  async function save() {
    const token = focus.current;
    if (!current(token) || busy.current || !opened || !selected) return;
    busy.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await opened.picker.save(selected);
      if (current(token)) {
        setOpened(null);
        onQueued();
      }
    } catch {
      if (current(token)) setFailed(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const picker = choices?.key === key && choices.revision === revision ? choices.picker : null;
  const modal = opened?.key === key ? opened.picker : null;
  return {
    open: picker?.candidates.length
      ? () => {
          if (!current(focus.current) || busy.current) return;
          setSelected(null);
          setFailed(false);
          setOpened({ key, picker });
        }
      : undefined,
    pending: picker?.pendingLink ? (
      <UiText style={styles.notice}>
        {t("documents.linkPending")}
      </UiText>
    ) : null,
    dialog: modal ? (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
        <SafeAreaView edges={["bottom"]} style={styles.root}>
          <SheetHeader
            category="picker"
            surface="background"
            title={t("documents.linkToItem")}
            onLeft={close}
            leftDisabled={saving}
            rightLabel={t("ui.save")}
            rightDisabled={!selected || saving}
            onRight={() => void save()}
            wrapActions
          />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {modal.candidates.map((document) => (
              <UiChoiceChip
                key={document.id}
                label={t("documents.linkChoice", {
                  title: coreDocumentDisplayTitle(document, t("capture.ai.submittedText")),
                  date: formatUiDate(new Date(document.recordedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }),
                })}
                selected={selected?.id === document.id}
                disabled={saving}
                onPress={() => {
                  if (!busy.current) setSelected(document);
                }}
              />
            ))}
            {failed ? (
              <UiText accessibilityRole="alert" style={styles.error}>
                {t("documents.linkFailed")}
              </UiText>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    ) : null,
  };
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.heading },
    notice: { ...visual.type.meta, color: colors.textSecondary, margin: visual.space.page },
    error: { ...visual.type.row, color: colors.destructive },
  });
