import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet } from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
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
import { hostedP1DocumentLinkEnabled, notifyP1DocumentLink, releaseP1DocumentLink, stageP1DocumentLink } from "./p1DocumentLinkSheet";

export async function readLinkPicker(tripId: string, itemId: string, generation: number) {
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

type Picker = NonNullable<Awaited<ReturnType<typeof readLinkPicker>>>;

export function DocumentLinkChoices({ picker, selected, disabled, failed, onSelect }: {
  picker: Picker;
  selected: Picker["candidates"][number] | null;
  disabled: boolean;
  failed: boolean;
  onSelect(document: Picker["candidates"][number]): void;
}) {
  const styles = useThemedStyles(createStyles);
  return <>
    {picker.candidates.map(document => (
      <UiChoiceChip
        key={document.id}
        label={t("documents.linkChoice", {
          title: coreDocumentDisplayTitle(document, t("capture.ai.submittedText")),
          date: formatUiDate(new Date(document.recordedAt), { dateStyle: "medium", timeStyle: "short" }),
        })}
        selected={selected?.id === document.id}
        disabled={disabled}
        onPress={() => onSelect(document)}
      />
    ))}
    {failed ? <UiText accessibilityRole="alert" style={styles.error}>{t("documents.linkFailed")}</UiText> : null}
  </>;
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
  const root = useNavigation("/");
  const route = useRoute();
  const lease = useRef<object | null>(null);
  const liveRevision = useRef(revision);
  const invocation = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    liveRevision.current = revision;
    notifyP1DocumentLink(invocation.current);
  }, [revision]);
  useLayoutEffect(() => {
    lease.current = {};
    return () => {
      lease.current = null;
      releaseP1DocumentLink(invocation.current);
    };
  }, [key, route.key]);
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
  const openHosted = () => {
    const state = root.getState();
    const token = lease.current;
    if (!picker || !token || !state || state.routes[state.index]?.key !== route.key) return true;
    const isCurrent = () => {
      const origin = root.getState()?.routes.find(candidate => candidate.key === route.key);
      const params = origin?.params;
      return token === lease.current && generation === getAccountGeneration() && !!params &&
        "tripId" in params && params.tripId === tripId && "itemId" in params && params.itemId === itemId;
    };
    const id = stageP1DocumentLink({
      generation, tripId, itemId, itemRevision: picker.itemRevision, originKey: route.key, isCurrent,
      revisionCurrent: () => liveRevision.current === revision,
      onQueued: () => {
        const current = root.getState();
        if (current?.routes[current.index]?.key === route.key) onQueued();
      },
    });
    if (!id) return true;
    root.dispatch({
      type: "PUSH", target: state.key, source: route.key,
      payload: { name: "p1-document-link", params: { invocation: id, screen: "index", params: { invocation: id } } },
    });
    const opened = root.getState();
    const active = opened?.routes[opened.index];
    if (active?.name === "p1-document-link" && active.params && "invocation" in active.params &&
        active.params.invocation === id) {
      invocation.current = id;
      return true;
    }
    releaseP1DocumentLink(id);
    const returned = root.getState();
    return !isCurrent() || returned?.routes[returned.index]?.key !== route.key;
  };
  return {
    open: picker?.candidates.length
      ? () => {
          if (!current(focus.current) || busy.current) return;
          if (hostedP1DocumentLinkEnabled && openHosted()) return;
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
            <DocumentLinkChoices
              picker={modal}
              selected={selected}
              disabled={saving}
              failed={failed}
              onSelect={document => { if (!busy.current) setSelected(document); }}
            />
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
