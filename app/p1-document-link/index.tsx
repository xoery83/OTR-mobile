import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useIsFocused, usePreventRemove } from "expo-router/react-navigation";
import { StyleSheet, View } from "react-native";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { DocumentLinkChoices, readLinkPicker } from "@/features/day-feed/P1DocumentLinkPicker";
import {
  beginP1DocumentLink, finishP1DocumentLink, p1DocumentLinkVersion, readP1DocumentLink, subscribeP1DocumentLink,
} from "@/features/day-feed/p1DocumentLinkSheet";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";

type Picker = NonNullable<Awaited<ReturnType<typeof readLinkPicker>>>;
type Candidate = Picker["candidates"][number];

export default function P1DocumentLinkRoute() {
  useUiLocale();
  useSyncExternalStore(subscribeP1DocumentLink, p1DocumentLinkVersion);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const navigation = useNavigation();
  const root = useNavigation("/");
  const focused = useIsFocused();
  const { requestClose, isExitPending, exitPending } = useSheetMotion();
  const owner = readP1DocumentLink(invocation);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [failed, setFailed] = useState(false);
  const attemptedClose = useRef<string | undefined>(undefined);
  const saving = owner?.busy ?? false;
  const queued = owner?.queued ?? false;
  const current = useCallback(() => {
    const state = root.getState();
    const active = state?.routes[state.index];
    return !!owner && readP1DocumentLink(invocation) === owner && owner.isCurrent() &&
      navigation.isFocused() && active?.name === "p1-document-link" && !!active.params &&
      "invocation" in active.params && active.params.invocation === invocation &&
      state?.routes[state.index - 1]?.key === owner.originKey;
  }, [invocation, navigation, owner, root]);
  usePreventRemove(saving, () => {});

  useEffect(() => {
    if (!focused || !owner || owner.queued || !current() || !owner.revisionCurrent()) return;
    let active = true;
    void readLinkPicker(owner.tripId, owner.itemId, owner.generation).then(result => {
      if (!active || !current() || !owner.revisionCurrent()) return;
      if (result?.itemRevision === owner.itemRevision && result.candidates.length) setPicker(result);
      else setFailed(true);
    }).catch(() => {
      if (active && current() && owner.revisionCurrent()) setFailed(true);
    });
    return () => {
      active = false;
      setPicker(null);
      setSelected(null);
    };
  }, [current, focused, owner]);

  useEffect(() => {
    if (!owner || !queued || attemptedClose.current === owner.id || !focused || saving || !current()) return;
    attemptedClose.current = owner.id;
    requestClose();
  }, [current, focused, owner, queued, requestClose, saving]);

  const save = async () => {
    if (!owner || !current() || !owner.revisionCurrent() || !picker || !selected ||
        owner.busy || owner.queued || isExitPending()) return;
    if (!beginP1DocumentLink(invocation)) return;
    setFailed(false);
    let queued = false;
    try {
      await picker.save(selected);
      queued = true;
    } catch {
      if (current()) setFailed(true);
    } finally {
      finishP1DocumentLink(invocation, queued);
    }
  };

  const visible = current() && owner?.revisionCurrent() === true;
  const disabled = saving || exitPending || queued;
  return <SheetRoutePanel title={t("documents.linkToItem")} leadingDisabled={saving}
    action={visible && picker && !queued ? {
      label: t("ui.save"), disabled: !selected || disabled, onPress: () => { void save(); },
    } : undefined}
  >
    {visible ? <View style={styles.content}>
      {picker ? <DocumentLinkChoices
        picker={picker} selected={selected} disabled={disabled} failed={failed}
        onSelect={document => {
          if (current() && owner?.revisionCurrent() && !owner.busy && !owner.queued && !isExitPending())
            setSelected(document);
        }}
      /> : failed ? <UiText accessibilityRole="alert">{t("documents.linkFailed")}</UiText> : null}
    </View> : null}
  </SheetRoutePanel>;
}

const styles = StyleSheet.create({
  content: { padding: visual.space.page, gap: visual.space.heading },
});
