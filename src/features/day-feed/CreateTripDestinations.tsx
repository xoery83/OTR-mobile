import { createTripNameQuery } from "@/data/places/createTripNameQuery";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNetworkState } from "expo-network";
import { readLocalSession } from "@/data/auth/authRepository";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  readApplePlaceProvider,
  type ApplePlaceCandidate,
} from "@/data/places/applePlaceProvider";
import {
  addTripDestination,
  manualTripDestination,
  removeTripDestination,
  resolvedTripDestination,
  type TripDestinationDraftSelection,
} from "@/data/places/tripDestinationSelection";
import {
  PlaceSearchSession,
  type PlaceSearchState,
} from "@/features/place-search/placeSearchSession";
import { AppIcon } from "@/components/AppIcon";
import { UiText } from "@/ui/controls";
import { UiTextInput } from "@/ui/forms";
import { getFormatLocale, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export function CreateTripDestinations({
  name,
  draftId,
  generation,
  items,
  onChange,
  onQueryDirty,
  onBusy,
  disabled,
}: {
  name: string;
  draftId: string;
  generation: number;
  items: readonly TripDestinationDraftSelection[];
  onChange(items: readonly TripDestinationDraftSelection[]): void;
  onQueryDirty(dirty: boolean): void;
  onBusy(busy: boolean): void;
  disabled: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const online = useNetworkState().isConnected !== false;
  const [query, setQuery] = useState("");
  const [dismissedName, setDismissedName] = useState<string | null>(null);
  const suggestionsVisible = !!query.trim() || (!items.length && dismissedName !== name);
  const [state, setState] = useState<PlaceSearchState>({
    status: "IDLE",
    rows: [],
    more: false,
  });
  const [choosing, setChoosing] = useState(false);
  const [customRequired, setCustomRequired] = useState(false);
  const [inputInvalid, setInputInvalid] = useState(false);
  const session = useRef<PlaceSearchSession | null>(null);
  const alive = useRef(true),
    currentQuery = useRef(query || createTripNameQuery(name));
  const searchText = suggestionsVisible
    ? query.trim() || (!items.length ? createTripNameQuery(name) : "")
    : "";
  const tags = useRef<ScrollView>(null);
  useEffect(() => {
    currentQuery.current = searchText;
  }, [searchText]);
  const current = useCallback(
    () => alive.current && generation === getAccountGeneration(),
    [generation],
  );
  useEffect(() => {
    alive.current = true;
    let active = true;
    void (async () => {
      const accountId = (await readLocalSession())?.identity?.userId;
      if (!active || !current()) return;
      if (!accountId) throw new Error("NATIVE_UNAVAILABLE");
      const binding = {
        accountId,
        draftId,
        editorId: draftId,
        accountGeneration: generation,
        isCurrent: () => active && current(),
      };
      const quick = await readApplePlaceProvider(binding);
      let more;
      try {
        more = await readApplePlaceProvider(binding);
      } catch (error) {
        quick.close();
        throw error;
      }
      if (!active || !current()) {
        quick.close();
        more.close();
        return;
      }
      const controller = new PlaceSearchSession(quick, more, (next) => {
        if (active && current()) setState(next);
      });
      session.current = controller;
      controller.update(
        { text: currentQuery.current, locale: getFormatLocale() },
        450,
        online,
      );
    })().catch(() => {
      if (active && current()) setState({ status: "ERROR", rows: [], more: false });
    });
    return () => {
      active = false;
      alive.current = false;
      session.current?.close();
      session.current = null;
    };
  }, [draftId, generation, online, current]);
  useEffect(() => {
    session.current?.update({ text: searchText, locale: getFormatLocale() }, 450, online);
  }, [searchText, online]);
  const changeQuery = (value: string) => {
    setQuery(value);
    setCustomRequired(false);
    setInputInvalid(false);
    onQueryDirty(!!value.trim());
  };
  const append = (item: TripDestinationDraftSelection) => {
    if (!current() || disabled || items.length >= 20) return;
    onChange(addTripDestination(items, item));
    changeQuery("");
    setDismissedName(name);
  };
  const choose = async (row: ApplePlaceCandidate) => {
    if (!current() || disabled || choosing || items.length >= 20) return;
    setChoosing(true);
    onBusy(true);
    try {
      const resolved = await session.current?.resolve(row);
      if (resolved && current()) {
        if (resolved.providerPlaceId) append(resolvedTripDestination(resolved));
        else {
          changeQuery(resolved.title);
          setCustomRequired(true);
        }
      }
    } catch {
      if (current()) setState({ status: "ERROR", rows: [], more: false });
    } finally {
      if (current()) {
        setChoosing(false);
        onBusy(false);
      }
    }
  };
  return (
    <View style={styles.section}>
      <UiText style={styles.caption}>{t("createTripV2.destinations")}</UiText>
      {items.length ? (
        <ScrollView
          ref={tags}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tags}
          onContentSizeChange={() => tags.current?.scrollToEnd({ animated: true })}
        >
          {items.map((item) => (
            <View key={item.localId} style={styles.tag}>
              <UiText style={styles.tagText}>{item.text}</UiText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("createTripV2.removeDestination", {
                  name: item.text,
                })}
                disabled={disabled || choosing}
                onPress={() => onChange(removeTripDestination(items, item.localId))}
                style={styles.remove}
              >
                <AppIcon name="xmark" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <UiTextInput
        accessibilityLabel={t("createTripV2.destinationInput")}
        placeholder={t("createTripV2.destinationInput")}
        value={query}
        maxLength={256}
        editable={!disabled && !choosing && items.length < 20}
        onChangeText={changeQuery}
      />
      {suggestionsVisible &&
      !items.length &&
      !query.trim() &&
      name.trim() &&
      state.rows.length ? (
        <UiText style={styles.meta}>{t("createTripV2.nameSuggestions")}</UiText>
      ) : null}
      {(suggestionsVisible && state.status === "LOADING") || choosing ? (
        <UiText accessibilityLiveRegion="polite" style={styles.meta}>
          {t("createTripV2.searching")}
        </UiText>
      ) : null}
      {(suggestionsVisible ? state.rows : []).map((row) => (
        <Pressable
          key={row.handle}
          accessibilityRole="button"
          accessibilityLabel={[row.title, row.secondary].filter(Boolean).join(", ")}
          disabled={disabled || choosing || items.length >= 20}
          onPress={() => void choose(row)}
          style={styles.result}
        >
          <AppIcon name="mappin.and.ellipse" size={20} color={colors.textSecondary} />
          <View style={styles.resultText}>
            <UiText style={styles.label}>{row.title}</UiText>
            {row.secondary ? <UiText style={styles.meta}>{row.secondary}</UiText> : null}
          </View>
        </Pressable>
      ))}
      {customRequired ? (
        <UiText style={styles.meta}>{t("createTripV2.customRequired")}</UiText>
      ) : null}
      {suggestionsVisible && (state.status === "ERROR" || !online) ? (
        <UiText style={styles.meta}>{t("createTripV2.searchUnavailable")}</UiText>
      ) : suggestionsVisible && state.status === "EMPTY" ? (
        <UiText style={styles.meta}>{t("createTripV2.noResults")}</UiText>
      ) : null}
      {inputInvalid ? (
        <UiText accessibilityRole="alert" style={styles.meta}>
          {t("createTripV2.destinationLength")}
        </UiText>
      ) : null}
      {query.trim() ? (
        <Pressable
          accessibilityRole="button"
          disabled={disabled || choosing || items.length >= 20}
          style={styles.result}
          accessibilityLabel={t("createTripV2.custom", { query: query.trim() })}
          onPress={() => {
            try {
              append(manualTripDestination(query));
            } catch {
              setInputInvalid(true);
            }
          }}
        >
          <AppIcon name="plus.circle" size={20} color={colors.accent} />
          <UiText style={styles.custom}>
            {t("createTripV2.custom", { query: query.trim() })}
          </UiText>
        </Pressable>
      ) : null}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    section: { gap: visual.space.heading },
    label: { ...visual.type.row, color: colors.textPrimary },
    caption: { ...visual.type.action, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    tags: { gap: visual.space.heading },
    tag: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: visual.radius.pill,
      backgroundColor: colors.accentSurface,
      paddingLeft: visual.space.card,
    },
    tagText: { ...visual.type.meta, color: colors.textPrimary },
    remove: {
      padding: visual.space.card,
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    result: {
      flexDirection: "row",
      gap: visual.space.card,
      alignItems: "center",
      paddingVertical: visual.space.card,
      minHeight: 44,
    },
    resultText: { flex: 1, gap: visual.space.heading },
    custom: { ...visual.type.action, color: colors.accent, flex: 1 },
  });
