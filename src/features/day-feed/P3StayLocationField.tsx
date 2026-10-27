import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { useNetworkState } from "expo-network";
import { AppIcon } from "@/components/AppIcon";
import { captureAccountScope } from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  readApplePlaceProvider,
  type ApplePlaceCandidate,
  type PlaceSearchBinding,
} from "@/data/places/applePlaceProvider";
import {
  PlaceSearchSheet,
  type PlaceSearchResult,
} from "@/features/place-search/PlaceSearchSheet";
import {
  PlaceSearchSession,
  type PlaceSearchState,
} from "@/features/place-search/placeSearchSession";
import { UiButton, UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { getFormatLocale, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

type Props = {
  tripId: string;
  editorId: string;
  title: string;
  nameQuery: string | null;
  value: string | null;
  disabled: boolean;
  isCurrent(): boolean;
  onChange(value: string | null): void;
  onSelectHotel(title: string, location: string): void;
  onPlaceSelected?(place: ApplePlaceCandidate): void;
  onKeepName(): void;
};
const empty: PlaceSearchState = { status: "IDLE", rows: [], more: false };

// P3 presentation only: both inline and full-screen search use the existing Apple session.
export function P3StayLocationField(props: Props) {
  useUiLocale();
  const locale = getFormatLocale();
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);
  const online = useNetworkState().isConnected !== false;
  const generation = getAccountGeneration();
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  }, [props]);
  const mounted = useRef(true),
    ticket = useRef({ value: 0 });
  const controller = useRef<PlaceSearchSession | null>(null);
  const [results, setResults] = useState<{ key: string; state: PlaceSearchState }>({
    key: "",
    state: empty,
  });
  const [contextError, setContextError] = useState(false);
  const [invalidSelection, setInvalidSelection] = useState<string | null>(null);
  const [search, setSearch] = useState<{
    binding: PlaceSearchBinding;
    query: string;
  } | null>(null);
  const { tripId, editorId, nameQuery, value, disabled } = props;
  const queryKey = JSON.stringify([
    tripId,
    editorId,
    nameQuery,
    value,
    online,
    generation,
    locale,
  ]);
  const state = results.key === queryKey ? results.state : empty;
  const setState = (state: PlaceSearchState) => setResults({ key: queryKey, state });
  const current = () =>
    mounted.current &&
    latest.current.isCurrent() &&
    !latest.current.disabled &&
    generation === getAccountGeneration();
  useEffect(() => {
    mounted.current = true;
    const requests = ticket.current;
    return () => {
      mounted.current = false;
      requests.value++;
    };
  }, []);
  useEffect(() => {
    let active = true;
    let session: PlaceSearchSession | undefined;
    const valid = () =>
      active &&
      mounted.current &&
      latest.current.isCurrent() &&
      !latest.current.disabled &&
      generation === getAccountGeneration() &&
      latest.current.nameQuery === nameQuery &&
      latest.current.value === value;
    if (disabled || !nameQuery?.trim() || search) return;
    void (async () => {
      const account = await captureAccountScope(requireActiveUserId);
      if (!valid() || account.generation !== generation) return;
      const binding: PlaceSearchBinding = {
        accountId: account.accountId,
        tripId,
        editorId,
        accountGeneration: generation,
        isCurrent: valid,
      };
      const provider = await readApplePlaceProvider(binding);
      let more;
      try {
        more = await readApplePlaceProvider(binding);
      } catch (error) {
        provider.close();
        throw error;
      }
      if (!valid()) {
        provider.close();
        more.close();
        return;
      }
      session = new PlaceSearchSession(provider, more, (next) => {
        if (valid()) setResults({ key: queryKey, state: next });
      });
      controller.current = session;
      session.update({ text: nameQuery, locale }, 450, online);
    })().catch((error) => {
      if (valid())
        setResults({
          key: queryKey,
          state: {
            status: "ERROR",
            rows: [],
            more: false,
            error: error instanceof Error ? error.message : "ERROR",
          },
        });
    });
    return () => {
      active = false;
      session?.close();
      if (controller.current === session) controller.current = null;
    };
  }, [
    tripId,
    editorId,
    nameQuery,
    value,
    disabled,
    search,
    online,
    generation,
    locale,
    queryKey,
  ]);
  const apply = (text: string) => {
    if (!current() || text.length > 500) return;
    controller.current?.close();
    controller.current = null;
    latest.current.onKeepName();
    setState(empty);
    latest.current.onChange(text.trim() || null);
  };
  const choose = async (candidate: ApplePlaceCandidate) => {
    const snapshot = latest.current,
      session = controller.current;
    if (!current() || !session) return;
    const result = await session.resolve(candidate);
    if (
      !result ||
      !current() ||
      latest.current.nameQuery !== snapshot.nameQuery ||
      latest.current.value !== snapshot.value
    )
      return;
    const title = result.title.trim(),
      address = result.address?.trim();
    if (!title || title.length > 200 || !address || address.length > 500) {
      setInvalidSelection(snapshot.nameQuery);
      return;
    }
    Keyboard.dismiss();
    session.close();
    controller.current = null;
    setState(empty);
    latest.current.onSelectHotel(title, address);
    latest.current.onPlaceSelected?.(result);
  };
  const closeSearch = () => {
    ticket.current.value++;
    setSearch(null);
  };
  const openSearch = async () => {
    Keyboard.dismiss();
    if (!current()) return;
    const request = ++ticket.current.value,
      snapshot = latest.current;
    setContextError(false);
    try {
      const account = await captureAccountScope(requireActiveUserId);
      const valid = () =>
        current() &&
        request === ticket.current.value &&
        latest.current.title === snapshot.title &&
        latest.current.value === snapshot.value;
      if (!valid() || account.generation !== generation) return;
      setSearch({
        binding: {
          accountId: account.accountId,
          tripId,
          editorId,
          accountGeneration: generation,
          isCurrent: valid,
        },
        query: snapshot.value || snapshot.title,
      });
    } catch {
      if (current() && request === ticket.current.value) setContextError(true);
    }
  };
  const confirm = (result: PlaceSearchResult) => {
    if (!search?.binding.isCurrent()) return;
    const text = result.kind === "MANUAL" ? result.text : result.place.address;
    if (
      text === undefined ||
      text.length > 500 ||
      (result.kind === "SELECTED" && !text.trim())
    )
      return;
    closeSearch();
    apply(text);
    if (result.kind === "SELECTED") latest.current.onPlaceSelected?.(result.place);
  };
  return (
    <View style={styles.fields}>
      {nameQuery && !disabled && !search ? (
        <View style={styles.field}>
          {state.status === "LOADING" ? (
            <UiText accessibilityLiveRegion="polite" style={styles.meta}>
              {t("placeSearch.loading")}
            </UiText>
          ) : null}
          {state.rows.length ? (
            <UiText style={styles.meta}>{t("placeSearch.apple")}</UiText>
          ) : null}
          {state.rows.map((candidate) => (
            <Pressable
              key={candidate.handle}
              accessibilityRole="button"
              accessibilityLabel={`${candidate.title}, ${candidate.secondary}`}
              disabled={state.status === "LOADING"}
              style={styles.result}
              onPress={() => void choose(candidate)}
            >
              <UiText style={styles.resultTitle}>{candidate.title}</UiText>
              <UiText style={styles.meta}>{candidate.secondary}</UiText>
            </Pressable>
          ))}
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
                    : "placeSearch.error",
              )}
            </UiText>
          ) : null}
          {invalidSelection === nameQuery ? (
            <UiText accessibilityRole="alert" style={styles.meta}>
              {t("placeSearch.shorten")}
            </UiText>
          ) : null}
          <UiButton
            label={t("placeSearch.useEnteredName")}
            variant="text"
            disabled={disabled}
            onPress={() => {
              if (!current()) return;
              controller.current?.close();
              controller.current = null;
              latest.current.onKeepName();
              setState(empty);
              Keyboard.dismiss();
            }}
          />
        </View>
      ) : null}
      <View style={styles.field}>
        <UiText style={styles.caption}>{t("tripCreate.stayLocation")}</UiText>
        <View>
          <UiTextInput
            accessibilityLabel={t("tripCreate.stayLocation")}
            placeholder={t("tripCreate.stayLocation")}
            value={value ?? ""}
            maxLength={500}
            editable={!disabled}
            style={styles.locationInput}
            onFocus={() => void openSearch()}
            onChangeText={(text) => apply(text)}
          />
          {value ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("tripCreate.clearLocation")}
              disabled={disabled}
              style={styles.clearLocation}
              onPress={() => apply("")}
            >
              <AppIcon name="xmark.circle.fill" color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        {contextError ? (
          <UiText accessibilityRole="alert" style={styles.meta}>
            {t("placeSearch.contextUnavailable")}
          </UiText>
        ) : null}
      </View>
      {search && !disabled ? (
        <PlaceSearchSheet
          binding={search.binding}
          initialQuery={search.query}
          nameChoice={false}
          selectionMode="immediate"
          onCancel={closeSearch}
          onConfirm={confirm}
        />
      ) : null}
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    field: { gap: visual.space.heading },
    caption: { ...visual.type.action, color: c.textPrimary },
    fields: { gap: visual.space.section },
    locationInput: { paddingRight: 48 },
    clearLocation: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    meta: { ...visual.type.meta, color: c.textSecondary },
    result: {
      minHeight: 44,
      paddingVertical: visual.space.heading,
      gap: visual.space.heading,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
    },
    resultTitle: { ...visual.type.row, color: c.textPrimary },
  });
