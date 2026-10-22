import { tripDestinationDisplay } from "./tripDestinationDisplay";
import { readLocalSession } from "@/data/auth/authRepository";
import type { LocalTripDestinationInput } from "@/domain/trip/localTripDestination";
import { CreateTripDestinations } from "./CreateTripDestinations";
import type { TripDestinationDraftSelection } from "@/data/places/tripDestinationSelection";
import { CreateTripV2Fields } from "./CreateTripV2Fields";
import { ManualItineraryContent } from "./ManualItineraryContent";
import * as ImagePicker from "expo-image-picker";
import { readLocalTripPhotoRepository } from "@/data/repositories/tripPhotoRepository";
import { TripCoverPicker } from "./TripCoverPicker";
import { useTripPersonalCover } from "./useTripPersonalCover";
import { isTripCoverAssetId, tripPhotoCoverRef } from "@/domain/trip/tripCoverAssets";
import type { LocalManualRead } from "@/data/repositories/tripLocalManualReadRepository";
import { useTripPreparationWidget } from "./useTripPreparationWidget";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useTripHomeFinanceWidget } from "@/features/ledger/TripHomeFinanceWidget";
import type { TripHomeWidget } from "@/features/trip/TripHomeWidgetHost";
import { router, useFocusEffect } from "expo-router";
import { SheetHeader } from "@/components/SheetHeader";
import { useTripView } from "./TripViewContext";
import { TripHomeFrame } from "@/features/trip/TripHomeFrame";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import type { BuiltInTripCoverId, Trip } from "@/domain/trip/types";
import type { LocalPersonNameSlot } from "@/domain/trip/localTripPerson";
import { localCalendarDate, validateCalendarDate } from "@/domain/trip/dayReadModel";
import { createUuid } from "@/domain/localId";
import { readLocalTripRepository } from "@/data/repositories/tripRepository";
import {
  readLocalTripDiscoveryRepository,
  type TripListSummary,
} from "@/data/repositories/tripDiscoveryRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { UiButton, UiText as Text } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { readTripDayFeed } from "@/data/repositories/tripDayFeedRepository";
import { boundaryZone } from "./presentation";
import { groupLocalTrips, possibleTodayTrips } from "./tripListPresentation";
import { MyTripsList, type TodayEntry } from "./MyTripsList";
import { calendarDate } from "./TripCalendarField";
import { TripBasicEditor } from "./TripBasicEditor";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import { TripMembersSummary } from "./TripSetupRows";
import { TripMembersSheet } from "./TripMembersSheet";
import { LocalTripPhotos } from "./LocalTripPhotos";
import { tripCoverId, tripCoverSource } from "./tripCovers";

const displayDate = (value: string) =>
  formatUiDate(new Date(`${value}T12:00:00Z`), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const knownDate = (value: string | null) => {
  if (!value) return null;
  try {
    return validateCalendarDate(value);
  } catch {
    return null;
  }
};

type Props = {
  widgetsForHome?: (
    tripId: string,
    lifecycle: "Upcoming" | "Active" | "Past" | "Undated",
    planningDate?: string | null,
  ) => readonly TripHomeWidget[];
  onOpenHomeItem?: (tripId: string, itemId: string, epoch: string) => Promise<void>;
  onOpenLocalHomeItem?: (
    tripId: string,
    itemId: string,
    expected: Pick<LocalManualRead, "scope" | "source">,
  ) => Promise<void>;
  tripId: string | null;
  homePerspective?: { now: string; date: string; zone: string };
  mode?: "LIST" | "CREATE" | "PAST";
  onOpen(id: string): void;
  onCreate(): void;
  onOpenToday(id: string, context: TodayEntry): void;
  onKnownTrip(kind: "LOCAL" | "CACHED" | "NONE"): void;
  onBackToTrips(): void;
  onHomeHeroHeight?: (height: number) => void;
  onChooseDay?: (date?: string | null) => void;
  onManualItemSaved?: (tripId: string, generation: number) => void;
};
export function LocalTripWorkspace(props: Props) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  return (
    <LocalTripContent
      key={JSON.stringify([generation, props.tripId, props.mode])}
      {...props}
      generation={generation}
    />
  );
}
function LocalTripContent({
  tripId,
  mode = "LIST",
  onOpen,
  onCreate,
  onOpenToday,
  onKnownTrip,
  onBackToTrips,
  onHomeHeroHeight,
  onChooseDay,
  onManualItemSaved,
  widgetsForHome,
  onOpenHomeItem,
  onOpenLocalHomeItem,
  homePerspective,
  generation,
}: Props & { generation: number }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [trips, setTrips] = useState<Trip[]>([]),
    [remoteTrips, setRemoteTrips] = useState<TripListSummary[]>([]),
    [selected, setSelected] = useState<Trip | null>(null),
    [remoteSelected, setRemoteSelected] = useState<TripListSummary | null>(null),
    [eligibleToday, setEligibleToday] = useState<Record<string, TodayEntry>>({});
  const [status, setStatus] = useState<"LOADING" | "READY" | "UNAVAILABLE">("LOADING");
  const [name, setName] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [travelers, setTravelers] = useState<LocalPersonNameSlot[]>([]);
  const [selfNickname, setSelfNickname] = useState("");
  const [knownSelfName, setKnownSelfName] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(readLocalSession)
      .then((session) => {
        const identity = session?.identity,
          value = identity?.displayName.trim();
        if (
          active &&
          generation === getAccountGeneration() &&
          value &&
          value !== "Account" &&
          value !== identity?.email?.split("@")[0]
        )
          setKnownSelfName(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [generation]);
  const [createDraftId] = useState(createUuid);
  const [destinations, setDestinations] = useState<
    readonly TripDestinationDraftSelection[]
  >([]);
  const [destinationQueryDirty, setDestinationQueryDirty] = useState(false);
  const [destinationBusy, setDestinationBusy] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [personalCoverOpen, setPersonalCoverOpen] = useState(false);
  const personalCover = useTripPersonalCover(tripId);
  const [editorSaving, setEditorSaving] = useState(false);
  const editorBusy = useRef(false);
  const editorDismiss = useRef<(() => void) | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [metadataEditable, setMetadataEditable] = useState(false);
  const [setup, setSetup] = useState<TripPreparationSetup | null>(null);
  const receiveSetup = useCallback(
    (value: TripPreparationSetup | null) => setSetup(value),
    [],
  );
  const [itemStart, setItemStart] = useState("");
  const { publishQuickActions, localOutcome } = useTripView();
  const [quickActionsOwner] = useState(() => Symbol("mounted-trip-quick-actions"));
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const itemDismiss = useRef<(() => void) | null>(null);
  const registerItemDismiss = (handler: () => void) => {
    itemDismiss.current = handler;
    return () => {
      if (itemDismiss.current === handler) itemDismiss.current = null;
    };
  };
  const [photosReady, setPhotosReady] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const photoAdd = useRef<(() => void) | null>(null);
  const registerPhotos = useCallback((add: (() => void) | null) => {
    photoAdd.current = add;
    setPhotosReady(Boolean(add));
  }, []);
  const photosSaved = useCallback(() => setSavedNotice(true), []);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(false);
  const [menuMembersTrip, setMenuMembersTrip] = useState<string | null>(null);
  const request = useRef(0),
    busy = useRef(false),
    tripOperation = useRef({ operationId: createUuid(), tripId: createUuid() });
  const alive = useRef(true),
    saveOwner = useRef<symbol | null>(null);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      saveOwner.current = null;
      request.current += 1;
    };
  }, []);
  const load = useCallback(async () => {
    const captured = generation,
      ticket = ++request.current;
    try {
      const repo = await readLocalTripRepository();
      const local = tripId ? await repo.getTrip(tripId) : null;
      const list = tripId ? [] : await repo.listTrips();
      const canEditMetadata = local ? await repo.canUpdateMetadata(local.id) : false;
      // A local Repository result already wins; discovery is only needed for list/remote fallback.
      const discovery = local
        ? null
        : await readLocalTripDiscoveryRepository()
            .then((reader) => reader.readMerged())
            .catch(() => null);
      const cached =
        tripId && !local
          ? (discovery?.trips.find(
              (trip) => trip.id === tripId && trip.localStatus === null,
            ) ?? null)
          : null;
      const localIds = new Set(list.map((trip) => trip.id));
      if (
        !alive.current ||
        captured !== getAccountGeneration() ||
        ticket !== request.current
      )
        return;
      setMetadataEditable(canEditMetadata);
      setTrips(list);
      setRemoteTrips(
        tripId
          ? []
          : (discovery?.trips.filter(
              (trip) => trip.localStatus === null && !localIds.has(trip.id),
            ) ?? []),
      );
      setEligibleToday({});
      setSelected(local);
      setRemoteSelected(cached);
      setStatus("READY");
      onKnownTrip(local ? "LOCAL" : cached ? "CACHED" : "NONE");
      if (!tripId && list.length) {
        const possible = possibleTodayTrips(list, calendarDate(new Date()));
        if (possible.length) {
          void (async () => {
            try {
              const reader = await readTripDayFeed();
              const matches = await Promise.all(
                possible.map(async (trip) => {
                  try {
                    const result = await reader.trip(trip.id);
                    if (result.scope.generation !== captured || !result.observed)
                      return null;
                    const zone = boundaryZone(result.observed.projection);
                    if (!zone) return null;
                    const date = localCalendarDate(new Date().toISOString(), zone);
                    if (!groupLocalTrips([trip], date).active.length) return null;
                    return [trip.id, { date, zone }] as const;
                  } catch {
                    return null;
                  }
                }),
              );
              if (
                alive.current &&
                captured === getAccountGeneration() &&
                ticket === request.current
              )
                setEligibleToday(
                  Object.fromEntries(matches.filter((entry) => entry !== null)),
                );
            } catch {
              // A missing accepted Day never hides the local Trip list.
            }
          })();
        }
      }
    } catch {
      if (
        !alive.current ||
        captured !== getAccountGeneration() ||
        ticket !== request.current
      )
        return;
      setTrips([]);
      setRemoteTrips([]);
      setSelected(null);
      setRemoteSelected(null);
      setEligibleToday({});
      setStatus("UNAVAILABLE");
      onKnownTrip("NONE");
    }
  }, [tripId, onKnownTrip, generation]);
  useEffect(() => {
    void Promise.resolve().then(load);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      request.current += 1;
      sub.remove();
    };
  }, [load, generation]);
  const save = async () => {
    if (
      busy.current ||
      destinationBusy ||
      !alive.current ||
      generation !== getAccountGeneration()
    )
      return;
    busy.current = true;
    setSaving(true);
    setError(false);
    const captured = generation,
      owner = Symbol("trip-ui-save");
    saveOwner.current = owner;
    const current = () =>
      alive.current && saveOwner.current === owner && captured === getAccountGeneration();
    try {
      const repo = await readLocalTripRepository();
      if (!current()) return;
      const trip = await repo.createTrip({
        ...tripOperation.current,
        name,
        destinations: destinations.map((item): LocalTripDestinationInput => {
          if (item.source === "MANUAL")
            return {
              destinationId: item.localId,
              displayLabel: item.text,
              source: "MANUAL",
            };
          if (!item.match?.providerPlaceId) throw new Error("DESTINATION_NOT_CONFIRMED");
          return {
            destinationId: item.localId,
            displayLabel: item.text,
            source: "APPLE_PLACE_ID",
            provider: "apple",
            providerPlaceId: item.match.providerPlaceId,
          };
        }),
        creatorDisplayName: selfNickname.trim(),
        startDate: start || null,
        endDate: end || null,
        ...(travelers.some((slot) => slot.displayName.trim())
          ? {
              travelers: travelers
                .filter((slot) => slot.displayName.trim())
                .map((slot) => ({ ...slot, displayName: slot.displayName.trim() })),
            }
          : {}),
      });
      if (!current()) return;
      onOpen(trip.id);
    } catch {
      if (current()) setError(true);
    } finally {
      if (saveOwner.current === owner) {
        saveOwner.current = null;
        busy.current = false;
        if (alive.current && captured === getAccountGeneration()) setSaving(false);
      }
    }
  };
  const closeCreate = () => {
    if (busy.current || !alive.current || generation !== getAccountGeneration()) return;
    if (
      !name.trim() &&
      !destinations.length &&
      !destinationQueryDirty &&
      !start &&
      !end &&
      !selfNickname.trim() &&
      !travelers.some((person) => person.displayName.trim())
    ) {
      onBackToTrips();
      return;
    }
    Alert.alert(t("actionIsland.unsavedTitle"), t("actionIsland.unsavedHint"), [
      { text: t("actionIsland.stay"), style: "cancel" },
      {
        text: t("actionIsland.discard"),
        style: "destructive",
        onPress: () => {
          if (!busy.current && alive.current && generation === getAccountGeneration())
            onBackToTrips();
        },
      },
    ]);
  };
  const openToday = async (id: string) => {
    const prior = eligibleToday[id];
    if (!prior || generation !== getAccountGeneration()) return;
    try {
      const reader = await readTripDayFeed();
      const result = await reader.trip(id);
      if (
        !alive.current ||
        generation !== getAccountGeneration() ||
        result.scope.generation !== generation ||
        !result.observed
      )
        return;
      const zone = boundaryZone(result.observed.projection);
      if (!zone || zone !== prior.zone) return;
      const date = localCalendarDate(new Date().toISOString(), zone);
      if (date !== prior.date) return;
      const repo = await readLocalTripRepository();
      const local = await repo.getTrip(id);
      if (
        !local ||
        !groupLocalTrips([local], date).active.length ||
        !alive.current ||
        generation !== getAccountGeneration()
      )
        return;
      onOpenToday(id, { date, zone });
    } catch {
      // A stale or revoked Day action simply stays on My Trips.
    }
  };
  const selectCover = async (id: BuiltInTripCoverId | null) => {
    const trip = selected;
    if (!trip || !alive.current || generation !== getAccountGeneration()) return;
    const repo = await readLocalTripRepository();
    if (!alive.current || generation !== getAccountGeneration()) return;
    await repo.selectBuiltInCover(trip.id, id);
    if (alive.current && generation === getAccountGeneration()) await load();
  };
  const leaveHome = useCallback(() => {
    if (!alive.current || generation !== getAccountGeneration()) return;
    if (!itemStart) {
      onBackToTrips();
      return;
    }
    if (saving) return;
    Alert.alert(t("actionIsland.unsavedTitle"), t("actionIsland.unsavedHint"), [
      { text: t("actionIsland.stay"), style: "cancel" },
      {
        text: t("actionIsland.discard"),
        style: "destructive",
        onPress: () => {
          if (!alive.current || generation !== getAccountGeneration()) return;
          setItemStart("");
          onBackToTrips();
        },
      },
    ]);
  }, [generation, itemStart, saving, onBackToTrips]);
  useFocusEffect(
    useCallback(() => {
      if (!selected || status !== "READY") return;
      const owner = selected.id;
      publishQuickActions(
        {
          tripName: selected.name,
          tripId: owner,
          generation,
          owner: quickActionsOwner,
          backToTrips: leaveHome,
          ...(metadataEditable
            ? {
                editTrip: () => {
                  if (alive.current && generation === getAccountGeneration())
                    setCoverOpen(true);
                },
              }
            : {}),
          ...(setup?.context.tripId === owner &&
          setup.context.generation === generation &&
          setup.members.state === "AVAILABLE"
            ? {
                members: () => {
                  if (alive.current && generation === getAccountGeneration())
                    setMenuMembersTrip(owner);
                },
              }
            : {}),
          ...(onChooseDay ? { chooseDay: () => onChooseDay(selected.startDate) } : {}),
          itinerary: (date) => {
            if (!alive.current || generation !== getAccountGeneration()) return;
            if (selected.id !== tripId) return;
            setItemStart(date ?? "");
            setItemFormOpen(true);
          },
          ...(photosReady
            ? {
                photos: () => {
                  if (alive.current && generation === getAccountGeneration())
                    photoAdd.current?.();
                },
              }
            : {}),
        },
        owner,
        generation,
        quickActionsOwner,
      );
      return () => publishQuickActions(null, owner, generation, quickActionsOwner);
    }, [
      selected,
      tripId,
      status,
      generation,
      metadataEditable,
      photosReady,
      setup,
      publishQuickActions,
      quickActionsOwner,
      leaveHome,
      onChooseDay,
    ]),
  );
  const remoteStart = knownDate(remoteSelected?.startDate ?? null);
  const remoteEnd = knownDate(remoteSelected?.endDate ?? null);
  const metadata = selected ?? remoteSelected;
  const displayCover =
    metadata && personalCover.selection
      ? { ...metadata, selectedCoverAssetIdRaw: personalCover.selection.raw }
      : metadata;
  const openPersonalCover = personalCover.selection
    ? async () => {
        if (await personalCover.open()) {
          if (alive.current && generation === getAccountGeneration())
            setPersonalCoverOpen(true);
        }
      }
    : undefined;
  const lifecycleGroups = metadata
    ? groupLocalTrips([metadata], homePerspective?.date ?? calendarDate(new Date()))
    : null;
  const lifecycle = lifecycleGroups?.past.length
    ? "Past"
    : lifecycleGroups?.active.length
      ? "Active"
      : lifecycleGroups?.upcoming.length
        ? "Upcoming"
        : metadata
          ? "Undated"
          : null;
  const preparation = useTripPreparationWidget({
    tripId: metadata?.id ?? null,
    metadata: metadata
      ? {
          startDate: metadata.startDate,
          endDate: metadata.endDate,
          destination: metadata.destination,
          destinations: "destinations" in metadata ? metadata.destinations : undefined,
        }
      : undefined,
    onSetup: receiveSetup,
    onEdit: selected && metadataEditable ? () => setCoverOpen(true) : undefined,
    onCover: openPersonalCover,
    undated: lifecycle === "Undated",
    onImport: selected
      ? () => {
          if (generation === getAccountGeneration())
            router.push({
              pathname: "/import-plans",
              params: {
                tripId: selected.id,
                origin: "TRIP",
                originGeneration: String(generation),
              },
            });
        }
      : undefined,
    onBuild: selected
      ? () => {
          if (generation === getAccountGeneration()) {
            setItemStart("");
            setItemFormOpen(true);
          }
        }
      : undefined,
    onOpenDay: onChooseDay ? () => onChooseDay(metadata?.startDate) : undefined,
    onOpenItem: onOpenHomeItem,
    onOpenLocalItem: onOpenLocalHomeItem,
  });
  const finance = useTripHomeFinanceWidget(metadata?.id ?? null, lifecycle);
  const pages = [
    ...(preparation && (lifecycle === "Upcoming" || lifecycle === "Undated")
      ? [preparation]
      : []),
    ...(metadata && lifecycle
      ? (widgetsForHome?.(metadata.id, lifecycle, metadata.startDate) ?? [])
      : []),
    ...(finance ? [finance] : []),
  ];
  if (mode === "PAST")
    return status === "READY" ? (
      <MyTripsList
        pastOnly
        trips={trips}
        remoteTrips={remoteTrips}
        today={calendarDate(new Date())}
        eligibleToday={eligibleToday}
        onOpen={onOpen}
        onOpenToday={(id) => void openToday(id)}
        onCreate={onCreate}
      />
    ) : (
      <View style={styles.pastRoot}>
        <Text style={styles.status}>
          {t(status === "LOADING" ? "dayFeed.loading" : "tripCreate.unavailable")}
        </Text>
      </View>
    );
  if (tripId && !selected && !remoteSelected) return null;
  return (
    <View style={styles.root}>
      {personalCoverOpen && displayCover && personalCover.selection ? (
        <TripCoverPicker
          key={displayCover.id}
          presentation="standalone"
          trip={displayCover}
          selectedRaw={personalCover.selection.raw}
          onClose={() => setPersonalCoverOpen(false)}
          onSelect={personalCover.select}
          onChoosePhoto={async (processing) => {
            const current = () => alive.current && generation === getAccountGeneration();
            if (!current() || !(await personalCover.open())) return false;
            const choice = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              allowsMultipleSelection: false,
              quality: 1,
              base64: false,
              exif: false,
            });
            if (!current() || choice.canceled) return false;
            await processing();
            if (!current()) return false;
            const uri = choice.assets[0]?.uri;
            if (!uri?.startsWith("file://"))
              throw new Error("TRIP_PHOTO_PICKER_FILE_UNAVAILABLE");
            const repository = await readLocalTripPhotoRepository();
            if (!current()) return false;
            const photo = await repository.addTripPhoto(displayCover.id, uri);
            if (!current()) return false;
            if (!photo.localUri) throw new Error("TRIP_PHOTO_FILE_UNAVAILABLE");
            await personalCover.select(tripPhotoCoverRef(photo.assetId));
            return true;
          }}
        />
      ) : null}
      {error && !selected && !remoteSelected ? (
        <Text accessibilityRole="alert" style={styles.status}>
          {t("tripCreate.saveFailed")}
        </Text>
      ) : null}
      {selected ? (
        <>
          <TripHomeFrame
            canChooseCover={!!personalCover.selection}
            onChooseCover={openPersonalCover}
            onEdit={
              metadataEditable
                ? () => {
                    if (alive.current && generation === getAccountGeneration())
                      setCoverOpen(true);
                  }
                : undefined
            }
            onHeroHeight={onHomeHeroHeight}
            widgets={pages}
            tripId={selected.id}
            rawCoverSelection={displayCover?.selectedCoverAssetIdRaw}
            title={selected.name}
            cover={tripCoverSource(displayCover ?? selected)}
            coverAssetId={tripCoverId(displayCover ?? selected)}
            metadata={[
              ...(selected.startDate && selected.endDate
                ? [
                    t("myTrips.dateRange", {
                      start: displayDate(selected.startDate),
                      end: displayDate(selected.endDate),
                    }),
                  ]
                : selected.startDate
                  ? [t("myTrips.starts", { date: displayDate(selected.startDate) })]
                  : selected.endDate
                    ? [t("myTrips.ends", { date: displayDate(selected.endDate) })]
                    : [t("myTrips.datesToBeDecided")]),
              ...(tripDestinationDisplay(selected)
                ? [tripDestinationDisplay(selected)!]
                : []),
            ]}
            modules={
              <View style={styles.root}>
                <TripMembersSummary
                  tripId={selected.id}
                  generation={generation}
                  setup={setup?.context.tripId === selected.id ? setup : null}
                />
                <LocalTripPhotos
                  compact
                  tripId={selected.id}
                  registerAdd={registerPhotos}
                  onSaved={photosSaved}
                />
              </View>
            }
          />
          {savedNotice ||
          (localOutcome?.tripId === selected.id &&
            localOutcome.generation === generation) ? (
            <Text style={styles.status}>{t("actionIsland.savedLocally")}</Text>
          ) : null}
          {localOutcome?.tripId === selected.id &&
          localOutcome.generation === generation ? (
            <UiButton
              label={t("actionIsland.openSavedExpense")}
              variant="text"
              onPress={() =>
                router.push({
                  pathname: "/expenses/expense/[id]",
                  params: { id: localOutcome.id },
                })
              }
            />
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.status}>
              {t("tripCreate.saveFailed")}
            </Text>
          ) : null}
          <TripMembersSheet
            visible={
              menuMembersTrip === selected.id &&
              setup?.context.tripId === selected.id &&
              setup.context.generation === generation &&
              setup.members.state === "AVAILABLE"
            }
            members={
              setup?.context.tripId === selected.id &&
              setup.context.generation === generation
                ? setup.members
                : null
            }
            onClose={() => setMenuMembersTrip(null)}
          />
          <Modal
            visible={coverOpen}
            presentationStyle="pageSheet"
            allowSwipeDismissal={!editorSaving && !editorDirty}
            onRequestClose={() => {
              if (!editorBusy.current) {
                if (editorDismiss.current) editorDismiss.current();
                else setCoverOpen(false);
              }
            }}
            animationType="slide"
          >
            <SafeAreaProvider style={styles.modal}>
              {coverOpen ? (
                <TripBasicEditor
                  trip={{
                    ...selected,
                    selectedCoverAssetIdRaw: displayCover?.selectedCoverAssetIdRaw,
                  }}
                  onClose={() => {
                    if (!editorBusy.current) setCoverOpen(false);
                  }}
                  registerDismiss={(handler) => {
                    editorDismiss.current = handler;
                  }}
                  onDirtyChange={setEditorDirty}
                  onSavingChange={(saving) => {
                    editorBusy.current = saving;
                    setEditorSaving(saving);
                  }}
                  setup={setup?.context.tripId === selected.id ? setup : null}
                  currencyAvailable
                  metadataEditable={metadataEditable}
                  onSelectCover={selectCover}
                  onSaveMetadata={async (
                    before,
                    after,
                    cover,
                    operationId,
                    destinations,
                  ) => {
                    if (!alive.current || generation !== getAccountGeneration())
                      throw new Error("TRIP_METADATA_CONTEXT_CHANGED");
                    const repo = await readLocalTripRepository();
                    if (!alive.current || generation !== getAccountGeneration())
                      throw new Error("TRIP_METADATA_CONTEXT_CHANGED");
                    await repo.updateMetadata(
                      {
                        operationId,
                        tripId: selected.id,
                        before,
                        after,
                      },
                      cover,
                      destinations,
                    );
                    const committed = await repo.getTrip(selected.id);
                    if (alive.current && generation === getAccountGeneration()) {
                      // Fence an older focus read that started before this local commit.
                      request.current++;
                      setSelected({
                        ...selected,
                        ...after,
                        ...(committed ? { destinations: committed.destinations } : {}),
                        ...(cover
                          ? {
                              selectedCoverAssetId: isTripCoverAssetId(cover.after)
                                ? cover.after
                                : null,
                              selectedCoverAssetIdRaw: cover.after,
                            }
                          : {}),
                      });
                      setCoverOpen(false);
                      // The committed value is visible now; normal focus reads refresh later.
                    }
                  }}
                />
              ) : null}
            </SafeAreaProvider>
          </Modal>
          {itemFormOpen ? (
            <Modal
              visible
              animationType="slide"
              transparent
              presentationStyle="overFullScreen"
              onRequestClose={() => {
                if (itemDismiss.current) itemDismiss.current();
                else setItemFormOpen(false);
              }}
            >
              <SafeAreaProvider style={styles.manualModal}>
                <ManualItineraryContent
                  key={`${selected.id}:${generation}:${itemStart}`}
                  tripId={selected.id}
                  generation={generation}
                  registerDismissHandler={registerItemDismiss}
                  initialDate={itemStart || null}
                  tripStartDate={selected.startDate}
                  tripEndDate={selected.endDate}
                  onClose={() => {
                    setItemFormOpen(false);
                    setItemStart("");
                  }}
                  onSaved={() => {
                    if (!alive.current || generation !== getAccountGeneration()) return;
                    onManualItemSaved?.(selected.id, generation);
                    setItemFormOpen(false);
                    setItemStart("");
                    setSavedNotice(true);
                    void load();
                  }}
                />
              </SafeAreaProvider>
            </Modal>
          ) : null}
        </>
      ) : remoteSelected ? (
        <>
          <TripHomeFrame
            canChooseCover={!!personalCover.selection}
            onChooseCover={openPersonalCover}
            onHeroHeight={onHomeHeroHeight}
            modules={
              <TripMembersSummary
                tripId={remoteSelected.id}
                generation={generation}
                setup={setup?.context.tripId === remoteSelected.id ? setup : null}
              />
            }
            widgets={pages}
            tripId={remoteSelected.id}
            rawCoverSelection={displayCover?.selectedCoverAssetIdRaw}
            title={remoteSelected.name}
            cover={tripCoverSource(displayCover ?? remoteSelected)}
            coverAssetId={tripCoverId(displayCover ?? remoteSelected)}
            notice={t("myTrips.cachedDetails")}
            metadata={[
              ...(remoteStart && remoteEnd
                ? [
                    t("myTrips.dateRange", {
                      start: displayDate(remoteStart),
                      end: displayDate(remoteEnd),
                    }),
                  ]
                : remoteStart
                  ? [t("myTrips.starts", { date: displayDate(remoteStart) })]
                  : remoteEnd
                    ? [t("myTrips.ends", { date: displayDate(remoteEnd) })]
                    : [t("myTrips.datesToBeDecided")]),
              ...(remoteSelected.destination ? [remoteSelected.destination] : []),
            ]}
          />
          {localOutcome?.tripId === remoteSelected.id &&
          localOutcome.generation === generation ? (
            <>
              <Text style={styles.status}>{t("actionIsland.savedLocally")}</Text>
              <UiButton
                label={t("actionIsland.openSavedExpense")}
                variant="text"
                onPress={() =>
                  router.push({
                    pathname: "/expenses/expense/[id]",
                    params: { id: localOutcome.id },
                  })
                }
              />
            </>
          ) : null}
        </>
      ) : mode === "LIST" ? (
        status === "READY" ? (
          <MyTripsList
            trips={trips}
            remoteTrips={remoteTrips}
            today={calendarDate(new Date())}
            eligibleToday={eligibleToday}
            onOpen={onOpen}
            onOpenToday={(id) => void openToday(id)}
            onCreate={onCreate}
          />
        ) : (
          <Text style={styles.status}>
            {t(status === "LOADING" ? "dayFeed.loading" : "tripCreate.unavailable")}
          </Text>
        )
      ) : (
        <>
          <MyTripsList
            trips={trips}
            remoteTrips={remoteTrips}
            today={calendarDate(new Date())}
            eligibleToday={eligibleToday}
            onOpen={onOpen}
            onOpenToday={(id) => void openToday(id)}
            onCreate={onCreate}
          />
          <Modal
            visible
            presentationStyle="pageSheet"
            animationType="slide"
            onRequestClose={closeCreate}
          >
            <SafeAreaProvider style={styles.modal}>
              <SafeAreaView edges={["bottom"]} style={styles.modal}>
                <SheetHeader
                  category="form"
                  safeTop={false}
                  title={t("createTripV2.title")}
                  leftLabel={t("common.cancel")}
                  onLeft={closeCreate}
                  leftDisabled={saving}
                  rightLabel={t("createTripV2.create")}
                  rightDisabled={
                    saving ||
                    destinationBusy ||
                    status !== "READY" ||
                    !name.trim() ||
                    name.trim().length > 256
                  }
                  onRight={() => {
                    void save();
                  }}
                />
                <KeyboardAvoidingView
                  style={styles.modal}
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                  <ScrollView
                    style={styles.modal}
                    contentContainerStyle={styles.form}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                  >
                    <CreateTripV2Fields
                      name={name}
                      onName={setName}
                      range={{ start, end }}
                      onRange={(range) => {
                        setStart(range.start);
                        setEnd(range.end);
                      }}
                      selfNickname={selfNickname}
                      knownSelfName={knownSelfName}
                      onSelfNickname={(value) => {
                        setSelfNickname(value);
                      }}
                      travelers={travelers}
                      onTravelers={setTravelers}
                      disabled={saving}
                      destinationEntry={
                        <CreateTripDestinations
                          name={name}
                          draftId={createDraftId}
                          generation={generation}
                          items={destinations}
                          onChange={(items) => {
                            setDestinations(items);
                          }}
                          onQueryDirty={setDestinationQueryDirty}
                          onBusy={setDestinationBusy}
                          disabled={saving}
                        />
                      }
                    />
                    {error ? (
                      <Text accessibilityRole="alert" style={styles.status}>
                        {t("tripCreate.saveFailed")}
                      </Text>
                    ) : null}
                  </ScrollView>
                </KeyboardAvoidingView>
              </SafeAreaView>
            </SafeAreaProvider>
          </Modal>
        </>
      )}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    modal: { flex: 1, backgroundColor: colors.background },
    manualModal: { flex: 1 },
    form: { padding: visual.space.page, gap: visual.space.card },
    pastRoot: { flex: 1, backgroundColor: colors.background, padding: visual.space.page },
    root: { gap: visual.space.section },
    body: { color: colors.textPrimary, ...visual.type.row },
    status: { color: colors.textSecondary, ...visual.type.meta },
    travelers: { gap: visual.space.heading },
  });
