import { useNetworkState } from "expo-network";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextInput,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { SheetHeader } from "@/components/SheetHeader";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readApplePlaceProvider,
  type ApplePlaceCandidate,
  type PlaceSearchBinding,
} from "@/data/places/applePlaceProvider";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip, UiTextInput } from "@/ui/forms";
import { getFormatLocale, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { PlaceSearchSession, type PlaceSearchState } from "./placeSearchSession";
export type PlaceSearchResult =
  | { kind: "SELECTED"; place: ApplePlaceCandidate; usePlaceName: boolean }
  | { kind: "MANUAL"; text: string };
export function PlaceSearchSheet({
  binding,
  initialQuery,
  nameChoice,
  onCancel,
  onConfirm,
}: {
  binding: PlaceSearchBinding;
  initialQuery: string;
  nameChoice: boolean;
  onCancel(): void;
  onConfirm(result: PlaceSearchResult): void;
}) {
  useUiLocale();
  const network = useNetworkState();
  const online = network.isConnected !== false;
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const [query, setQuery] = useState(initialQuery),
    [state, setState] = useState<PlaceSearchState>({
      status: "IDLE",
      rows: [],
      more: false,
    });
  const [selection, setSelection] = useState<ApplePlaceCandidate | null>(null),
    [usePlaceName, setUsePlaceName] = useState(false);
  const [regionSearch, setRegionSearch] = useState(false),
    [regionName, setRegionName] = useState<string | null>(null);
  const input = useRef<TextInput>(null),
    session = useRef<PlaceSearchSession | null>(null),
    text = useRef(initialQuery);
  const region = useRef<{ latitude: number; longitude: number } | undefined>(undefined),
    targetQuery = useRef(initialQuery);
  const [inputError, setInputError] = useState(false);
  const providerLease = useMemo(
    () => Object.freeze({ binding, online }),
    [binding, online],
  );
  const [readyLease, setReadyLease] = useState<typeof providerLease | null>(null);
  const providerReady = readyLease === providerLease;
  const current = () => generation === getAccountGeneration() && binding.isCurrent();
  const update = (value: string) => {
    text.current = value;
    setQuery(value);
    setSelection(null);
    setUsePlaceName(false);
    setInputError(false);
    session.current?.update(
      {
        text: value,
        locale: getFormatLocale(),
        ...(region.current ? { region: region.current } : {}),
      },
      450,
      online,
    );
  };
  useEffect(() => {
    let alive = true;
    void (async () => {
      const provider = await readApplePlaceProvider(binding);
      let moreProvider;
      try {
        moreProvider = await readApplePlaceProvider(binding);
      } catch (error) {
        provider.close();
        throw error;
      }
      if (!alive || !binding.isCurrent()) {
        provider.close();
        moreProvider.close();
        return;
      }
      const controller = new PlaceSearchSession(provider, moreProvider, (next) => {
        if (alive && binding.isCurrent()) setState(next);
      });
      session.current = controller;
      setReadyLease(providerLease);
      controller.update(
        {
          text: text.current,
          locale: getFormatLocale(),
          ...(region.current ? { region: region.current } : {}),
        },
        450,
        online,
      );
    })().catch((error) => {
      if (alive && binding.isCurrent())
        setState({
          status: "ERROR",
          rows: [],
          more: false,
          error: error instanceof Error ? error.message : "ERROR",
        });
    });
    return () => {
      alive = false;
      session.current?.close();
      session.current = null;
    };
  }, [binding, online, providerLease]);
  const back = () => {
    if (regionSearch) {
      setRegionSearch(false);
      update(targetQuery.current);
      return;
    }
    if (state.more) {
      setSelection(null);
      session.current?.backToQuick();
      return;
    }
    onCancel();
  };
  const choose = async (candidate: ApplePlaceCandidate) => {
    if (!current()) return;
    const resolved = await session.current?.resolve(candidate);
    if (!resolved || !current()) return;
    if (regionSearch) {
      if (!resolved.point || (!resolved.point.latitude && !resolved.point.longitude)) {
        setInputError(true);
        return;
      }
      region.current = resolved.point;
      setRegionName(resolved.title);
      setRegionSearch(false);
      update(targetQuery.current);
      return;
    }
    setSelection(resolved);
    setUsePlaceName(false);
  };
  if (generation !== binding.accountGeneration) return null;
  const tooLong = query.length > (nameChoice ? 200 : 500);
  const selectedInvalid =
    !!selection &&
    (!selection.address?.trim() ||
      selection.address.length > 500 ||
      (usePlaceName && selection.title.length > 200));
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={back}
    >
      <SafeAreaProvider style={styles.body}>
        <SheetHeader
          title={t(regionSearch ? "placeSearch.region" : "placeSearch.title")}
          leftLabel={t(state.more || regionSearch ? "common.back" : "common.cancel")}
          onLeft={back}
        />
        <View style={styles.search}>
          <UiTextInput
            ref={input}
            autoFocus
            accessibilityLabel={t("placeSearch.query")}
            placeholder={t("placeSearch.query")}
            value={query}
            maxLength={2048}
            onChangeText={update}
            style={styles.input}
            returnKeyType="search"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("placeSearch.clear")}
              style={styles.clear}
              onPress={() => {
                update("");
                input.current?.focus();
              }}
            >
              <AppIcon name="xmark.circle.fill" color={colors.textSecondary} size={22} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <UiText style={styles.meta}>{t("placeSearch.apple")}</UiText>
          {!regionSearch ? (
            <View style={styles.actions}>
              <UiButton
                label={regionName ?? t("placeSearch.region")}
                variant="text"
                onPress={() => {
                  targetQuery.current = text.current;
                  setRegionSearch(true);
                  update("");
                  input.current?.focus();
                }}
              />
              <UiButton
                label={t("placeSearch.worldwide")}
                variant="text"
                onPress={() => {
                  region.current = undefined;
                  setRegionName(null);
                  update(text.current);
                }}
              />
            </View>
          ) : null}
          {state.status === "LOADING" ? (
            <UiText accessibilityLiveRegion="polite" style={styles.meta}>
              {t("placeSearch.loading")}
            </UiText>
          ) : null}
          {state.status === "EMPTY" ? (
            <UiText style={styles.meta}>{t("placeSearch.empty")}</UiText>
          ) : null}
          {state.status === "ERROR" ? (
            <UiText accessibilityRole="alert" style={styles.meta}>
              {t(
                state.error === "OFFLINE"
                  ? "placeSearch.offline"
                  : state.error === "NATIVE_UNAVAILABLE"
                    ? "placeSearch.nativeUnavailable"
                    : ["NETWORK_ERROR", "TIMED_OUT"].includes(state.error ?? "")
                      ? "placeSearch.networkError"
                      : "placeSearch.error",
              )}
            </UiText>
          ) : null}
          {inputError ? (
            <UiText accessibilityRole="alert" style={styles.meta}>
              {t("placeSearch.regionUnavailable")}
            </UiText>
          ) : null}
          {selectedInvalid || tooLong ? (
            <UiText accessibilityRole="alert" style={styles.meta}>
              {t("placeSearch.shorten")}
            </UiText>
          ) : null}
          {state.rows.map((candidate) => (
            <Pressable
              key={`${candidate.sessionId}:${candidate.generation}:${candidate.handle}`}
              accessibilityRole="button"
              accessibilityLabel={`${candidate.title}, ${candidate.secondary}`}
              disabled={state.status === "LOADING"}
              onPress={() => {
                void choose(candidate);
              }}
              style={styles.row}
            >
              <UiText style={styles.title}>{candidate.title}</UiText>
              <UiText style={styles.meta}>{candidate.secondary}</UiText>
            </Pressable>
          ))}
          {selection ? (
            <View style={styles.selected}>
              <UiText style={styles.title}>{selection.title}</UiText>
              <UiText style={styles.meta}>{selection.address ?? ""}</UiText>
              {nameChoice ? (
                <UiChoiceChip
                  label={t("placeSearch.usePlaceName")}
                  selected={usePlaceName}
                  onPress={() => setUsePlaceName(!usePlaceName)}
                />
              ) : null}
              <UiButton
                label={t("placeSearch.usePlace")}
                disabled={selectedInvalid || state.status === "LOADING"}
                onPress={() => {
                  if (current())
                    onConfirm({ kind: "SELECTED", place: selection, usePlaceName });
                }}
              />
            </View>
          ) : null}
          {!state.more ? (
            <UiButton
              label={t("placeSearch.more")}
              variant="text"
              disabled={
                query.trim().length < 2 ||
                state.status === "LOADING" ||
                !providerReady ||
                !online
              }
              onPress={() => {
                setSelection(null);
                void session.current?.searchMore();
              }}
            />
          ) : null}
          {!regionSearch ? (
            <UiButton
              label={t(
                nameChoice
                  ? "placeSearch.useEnteredName"
                  : "placeSearch.useEnteredAddress",
              )}
              variant="text"
              disabled={!query.trim() || tooLong}
              onPress={() => {
                if (current()) onConfirm({ kind: "MANUAL", text: query.trim() });
              }}
            />
          ) : null}
        </ScrollView>
      </SafeAreaProvider>
    </Modal>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    search: {
      flexDirection: "row",
      alignItems: "center",
      padding: visual.space.page,
      gap: visual.space.heading,
    },
    input: { flex: 1 },
    clear: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      padding: visual.space.page,
      gap: visual.space.card,
      paddingBottom: visual.space.page * 2,
    },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    title: { ...visual.type.row, color: colors.textPrimary },
    row: {
      paddingVertical: visual.space.heading,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.separator,
      gap: visual.space.heading,
    },
    selected: {
      backgroundColor: colors.surface,
      padding: visual.space.page,
      borderRadius: visual.radius.card,
      gap: visual.space.card,
    },
  });
