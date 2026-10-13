import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { readTripDayFeedLab } from "@/data/repositories/tripDayFeedLabRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { localCalendarDate, nextCalendarDate } from "@/domain/trip/dayReadModel";
import { DayFeed } from "@/features/day-feed/DayFeed";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton } from "@/ui/controls";
import { UiChoiceChip, UiFormRow } from "@/ui/forms";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { getLabFixtures } from "./fixtureRegistration";
import { selectLabContext } from "./fixtureCatalog";
import type { TtrLabFacts } from "@/features/ttr/labFixtures";
import { ttrIdentityKey } from "@/domain/trip/ttr";
import { flexibleFixtureUpdate } from "./flexibleReactiveContribution";
import type { FlexibleSnapshot } from "@/features/day-feed/flexibleSnapshot";
import { useTtrSessionHost } from "./useTtrSessionHost";
import {
  TtrLabSheetContent,
  type TtrLabSheetCopy,
} from "@/features/ttr/TtrLabSheetContent";

// The selector formats a calendar key without shifting it to the device timezone.
const dateLabel = (date: string) =>
  formatUiDate(new Date(`${date}T12:00:00Z`), {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

type Reader = Awaited<ReturnType<typeof readTripDayFeedLab>>;
type Candidates = Awaited<ReturnType<Reader["candidates"]>>;
type CoreRead = Awaited<ReturnType<Reader["trip"]>>;
type ReadStatus = "LOADING" | "READY" | "AUTH_REQUIRED" | "DENIED" | "UNAVAILABLE";
const readStatus = (error: unknown): ReadStatus => {
  const message = error instanceof Error ? error.message : "";
  return message === "CORE_LAB_AUTH_REQUIRED"
    ? "AUTH_REQUIRED"
    : /CORE_ACCESS_REVOKED|CORE_READ_ACCESS_MISMATCH|CORE_LAB_SCOPE|Account changed/.test(
          message,
        )
      ? "DENIED"
      : "UNAVAILABLE";
};

export function DayFeedLabScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const fixtureCatalog = getLabFixtures();
  const [context, setContext] = useState(() =>
    selectLabContext(fixtureCatalog[0].id, undefined, fixtureCatalog),
  );
  const [choosing, setChoosing] = useState(false);
  const [mode, setMode] = useState<"FIXTURE" | "CORE">("FIXTURE");
  const [catalog, setCatalog] = useState<Candidates | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<ReadStatus>("LOADING");
  const [coreSelection, setCoreSelection] = useState({
    tripId: "",
    date: "",
    generation,
    accountId: "",
  });
  const [coreRead, setCoreRead] = useState<(CoreRead & { date: string }) | null>(null);
  const [status, setStatus] = useState<ReadStatus>("LOADING");
  const reader = useRef<Reader | null>(null),
    requests = useRef({ catalog: 0, day: 0 });
  const refresh = useCallback(async () => {
    const captured = getAccountGeneration(),
      ticket = ++requests.current.catalog;
    await Promise.resolve();
    setCatalogStatus("LOADING");
    try {
      const nextReader = await readTripDayFeedLab();
      const result = await nextReader.candidates();
      if (captured !== getAccountGeneration() || ticket !== requests.current.catalog)
        return;
      reader.current = nextReader;
      setCatalog(result);
      setCatalogStatus("READY");
    } catch (error) {
      if (captured !== getAccountGeneration() || ticket !== requests.current.catalog)
        return;
      reader.current = null;
      setCatalog(null);
      setCatalogStatus(readStatus(error));
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    const activeRequests = requests.current;
    const subscription = AppState.addEventListener("change", (value) => {
      if (value === "active") void refresh();
    });
    return () => {
      ++activeRequests.catalog;
      ++activeRequests.day;
      subscription.remove();
    };
  }, [refresh, generation]);
  const currentCatalog =
    catalog?.scope.generation === generation && catalogStatus === "READY"
      ? catalog
      : null;
  const selection =
    coreSelection.generation === generation &&
    coreSelection.accountId === currentCatalog?.scope.accountId
      ? coreSelection
      : { tripId: "", date: "" };
  const coreId = currentCatalog?.tripIds.includes(selection.tripId)
    ? selection.tripId
    : (currentCatalog?.tripIds[0] ?? "");
  const fixture = selectLabContext(context.trip.id, context.date, fixtureCatalog);
  const ttrFacts =
    (fixture.trip.supplemental as TtrLabFacts | undefined)?.source === "SYNTHETIC_TTR_LAB"
      ? (fixture.trip.supplemental as TtrLabFacts)
      : null;
  const [ttrPaused, setTtrPaused] = useState(false);
  const [testNesting, setTestNesting] = useState<{
    tripId: string;
    snapshot: FlexibleSnapshot;
  } | null>(null);
  const ttrVisit = useMemo(
    () => ({ context, mode, generation }),
    [context, mode, generation],
  );
  const ttrHost = useTtrSessionHost({
    facts: ttrFacts,
    accountId: fixture.trip.projection.accountId,
    tripId: fixture.trip.id,
    date: fixture.date,
    generation,
    instant: fixture.trip.instant,
    visit: ttrVisit,
    permitted: mode === "FIXTURE" && !choosing && !ttrPaused,
  });
  const sheetCopy: TtrLabSheetCopy = {
    title: t("ttr.lab.title"),
    confirm: t("ttr.lab.confirm"),
    checkSaved: t("ttr.lab.checkSaved"),
    externalMaps: t("ttr.lab.externalMaps"),
    noMode: t("ttr.lab.noMode"),
    opening: t("ttr.lab.opening"),
    saving: t("ttr.lab.saving"),
    checking: t("ttr.lab.checking"),
    unavailable: t("ttr.lab.unavailable"),
    failure: t("ttr.lab.failure"),
    uncertain: t("ttr.lab.uncertain"),
    published: t("ttr.lab.published"),
    savedUnpublished: t("ttr.lab.savedUnpublished"),
    endpoints: (from, to) => t("ttr.lab.endpoints", { from, to }),
    confirmed: (mode) => t("ttr.lab.confirmed", { mode }),
    preview: (mode) => t("ttr.lab.preview", { mode }),
  };
  useEffect(() => {
    const activeRequests = requests.current;
    const ticket = ++activeRequests.day;
    if (mode !== "CORE" || !coreId || !currentCatalog || !reader.current) return;
    const scope = currentCatalog.scope,
      activeReader = reader.current;
    void Promise.resolve().then(async () => {
      setStatus("LOADING");
      try {
        const result = await activeReader.trip(coreId, scope);
        if (
          scope.generation !== getAccountGeneration() ||
          ticket !== requests.current.day
        )
          return;
        const date =
          selection.date ||
          (result.dates.includes(context.date) ? context.date : result.dates[0]) ||
          localCalendarDate(new Date().toISOString(), "UTC");
        setCoreRead({ ...result, date });
        setStatus("READY");
      } catch (error) {
        if (
          scope.generation !== getAccountGeneration() ||
          ticket !== requests.current.day
        )
          return;
        setCoreRead(null);
        setStatus(readStatus(error));
      }
    });
    return () => {
      ++activeRequests.day;
    };
  }, [mode, coreId, currentCatalog, selection.date, context.date]);
  const visibleCore =
    status === "READY" &&
    coreRead?.scope.generation === generation &&
    coreRead.scope.accountId === currentCatalog?.scope.accountId &&
    coreRead.projection.tripId === coreId
      ? coreRead
      : null;
  const today = localCalendarDate(new Date().toISOString(), "UTC");
  const date =
    mode === "FIXTURE" ? fixture.date : (visibleCore?.date ?? (selection.date || today));
  const dates =
    mode === "FIXTURE"
      ? fixture.trip.dates
      : [
          ...new Set([
            today,
            nextCalendarDate(today),
            date,
            ...(visibleCore?.dates ?? []),
          ]),
        ].sort();
  const index = dates.indexOf(date);
  const tripId = mode === "FIXTURE" ? fixture.trip.id : coreId;
  const tripTitle =
    mode === "FIXTURE" ? fixture.trip.title : t("dayLab.coreTrip", { id: tripId });
  const nativeDiagnostics = ttrFacts ? (
    <ScrollView
      horizontal
      style={styles.ttrDiagnosticStrip}
      contentContainerStyle={styles.ttrDiagnostics}
    >
      <UiButton
        label={t(ttrPaused ? "ttr.lab.resume" : "ttr.lab.pause")}
        variant="text"
        onPress={() => setTtrPaused((v) => !v)}
      />
      <UiButton
        label={t("ttr.lab.replaceProjection")}
        variant="text"
        onPress={ttrHost.replacePublication}
      />
      {ttrHost.sheetOpen ? (
        <>
          <UiButton
            label={t("ttr.lab.failNext")}
            variant="text"
            onPress={ttrHost.failNextConfirm}
          />
          {fixture.trip.flexiblePublication?.snapshot ? (
            <UiButton
              label={t("ttr.lab.nestAnchor")}
              variant="text"
              onPress={() =>
                setTestNesting({
                  tripId: fixture.trip.id,
                  snapshot: flexibleFixtureUpdate(
                    testNesting?.tripId === fixture.trip.id
                      ? testNesting.snapshot
                      : fixture.trip.flexiblePublication!.snapshot!,
                    "NEST_ANCHOR",
                  ),
                })
              }
            />
          ) : null}
        </>
      ) : (
        <>
          <UiButton
            label={t("ttr.lab.queueTap")}
            variant="text"
            onPress={ttrHost.queueTap}
          />
          <UiButton
            label={t("ttr.lab.dispatchTap")}
            variant="text"
            onPress={ttrHost.dispatchQueuedTap}
          />
          <UiButton
            label={t("ttr.lab.accountGuard")}
            variant="text"
            onPress={() => {
              void ttrHost.testAccountGuard();
            }}
          />
          <Text style={styles.meta}>
            {t("ttr.lab.rejectedTaps", { count: ttrHost.rejectedTaps })}
          </Text>
          <Text style={styles.meta}>{t(`ttr.lab.scopeGuard.${ttrHost.scopeGuard}`)}</Text>
        </>
      )}
    </ScrollView>
  ) : null;
  const selectDate = (value: string) =>
    mode === "FIXTURE"
      ? setContext(selectLabContext(tripId, value, fixtureCatalog))
      : setCoreSelection({
          tripId,
          date: value,
          generation,
          accountId: currentCatalog?.scope.accountId ?? "",
        });
  const tripChoices =
    mode === "FIXTURE"
      ? fixtureCatalog.map((entry) => ({ id: entry.id, title: entry.title }))
      : (currentCatalog?.tripIds ?? []).map((id) => ({
          id,
          title: t("dayLab.coreTrip", { id }),
        }));
  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <View style={styles.navigation}>
          <UiButton
            label={t("dayLab.fixtureSource")}
            variant={mode === "FIXTURE" ? "secondary" : "text"}
            onPress={() => setMode("FIXTURE")}
          />
          <UiButton
            label={t("dayLab.coreSource")}
            variant={mode === "CORE" ? "secondary" : "text"}
            disabled={!currentCatalog?.tripIds.length}
            onPress={() => setMode("CORE")}
          />
          <UiButton
            label={t("capture.activityRefresh")}
            variant="text"
            onPress={() => {
              void refresh();
            }}
          />
        </View>
        {catalogStatus !== "READY" || !currentCatalog?.tripIds.length ? (
          <Text style={styles.meta}>
            {t(
              catalogStatus === "READY"
                ? "dayLab.noCoreTrips"
                : `dayLab.read.${catalogStatus}`,
            )}
          </Text>
        ) : null}
        <UiFormRow
          label={t("dayLab.trip")}
          value={tripTitle}
          disabled={!tripChoices.length}
          onPress={() => setChoosing(true)}
        />
        <View style={styles.navigation}>
          <UiButton
            label={t("dayLab.previous")}
            variant="text"
            disabled={index === 0}
            onPress={() => selectDate(dates[index - 1])}
          />
          <ScrollView
            horizontal
            style={styles.dateStrip}
            contentContainerStyle={styles.dates}
          >
            {dates.map((value) => (
              <UiChoiceChip
                key={value}
                label={dateLabel(value)}
                selected={date === value}
                onPress={() => selectDate(value)}
              />
            ))}
          </ScrollView>
          <UiButton
            label={t("dayLab.next")}
            variant="text"
            disabled={index === dates.length - 1}
            onPress={() => selectDate(dates[index + 1])}
          />
        </View>
        <Text style={styles.meta}>
          {mode === "FIXTURE"
            ? t("dayLab.diagnostics", {
                id: fixture.trip.id,
                date,
                version: fixture.trip.projection.version,
                instant: fixture.trip.instant,
              })
            : t("dayLab.coreDiagnostics", { id: tripId, date })}
        </Text>
        {mode === "CORE" && visibleCore?.unsupportedFamilies.length ? (
          <Text style={styles.meta}>
            {t("dayLab.unsupported", {
              families: visibleCore.unsupportedFamilies.join(", "),
            })}
          </Text>
        ) : null}
        {mode === "CORE" && !visibleCore ? (
          <Text style={styles.meta}>
            {t(
              `dayLab.read.${currentCatalog?.tripIds.length ? status : catalogStatus === "READY" ? "UNAVAILABLE" : catalogStatus}`,
            )}
          </Text>
        ) : null}
        <Text style={styles.meta}>{t("dayLab.deferred")}</Text>
        {!ttrHost.sheetOpen ? nativeDiagnostics : null}
      </View>
      {mode === "FIXTURE" ? (
        <DayFeed
          key={`FIXTURE/${fixture.trip.id}/${date}`}
          projection={fixture.trip.projection}
          services={fixture.trip.services}
          date={date}
          zone={fixture.trip.zone}
          instant={fixture.trip.instant}
          query={fixture.trip.query}
          renderer={fixture.trip.renderer}
          flexibleRenderer={fixture.trip.flexibleRenderer}
          flexiblePublication={
            testNesting?.tripId === fixture.trip.id && fixture.trip.flexiblePublication
              ? { ...fixture.trip.flexiblePublication, snapshot: testNesting.snapshot }
              : fixture.trip.flexiblePublication
          }
          ports={
            ttrFacts && ttrHost.projection
              ? { ...fixture.trip.ports, transitions: [ttrHost.projection] }
              : fixture.trip.ports
          }
          ttrSession={ttrFacts ? ttrHost.sessionPort : undefined}
          onOpenTtr={ttrFacts ? ttrHost.onOpenTtr : undefined}
        />
      ) : visibleCore ? (
        <DayFeed
          key={`CORE/${visibleCore.scope.accountId}/${generation}/${tripId}/${date}`}
          projection={visibleCore.projection}
          services={{}}
          emptyMessage={t("dayLab.coreDayEmpty")}
          date={date}
          zone="UTC"
        />
      ) : (
        <View style={styles.root} />
      )}
      <Modal
        visible={ttrHost.sheetOpen && mode === "FIXTURE"}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={ttrHost.adapter.dismiss}
      >
        <View style={styles.root}>
          {ttrFacts && ttrHost.projection?.identity ? (
            <TtrLabSheetContent
              view={ttrHost.adapter.view}
              facts={{
                source: "SYNTHETIC_TTR_LAB",
                identityKey: ttrIdentityKey(ttrHost.projection.identity),
                fromLabel:
                  fixture.trip.projection.events.find(
                    (e) => e.id === ttrFacts.input.from?.eventId,
                  )?.title ?? t("ttr.lab.unavailable"),
                toLabel:
                  fixture.trip.projection.events.find(
                    (e) => e.id === ttrFacts.input.to?.eventId,
                  )?.title ?? t("ttr.lab.unavailable"),
              }}
              copy={sheetCopy}
              onPreview={ttrHost.adapter.preview}
              onConfirm={() => {
                void ttrHost.adapter.confirm();
              }}
              onDismiss={ttrHost.adapter.dismiss}
              onRecover={() => {
                void ttrHost.adapter.recover();
              }}
            />
          ) : null}
          {nativeDiagnostics}
        </View>
      </Modal>
      <Modal
        visible={choosing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setChoosing(false)}
      >
        <View style={styles.root}>
          <SheetHeader title={t("dayLab.trip")} onLeft={() => setChoosing(false)} />
          <ScrollView contentContainerStyle={styles.controls}>
            {tripChoices.map((entry) => (
              <UiChoiceChip
                key={entry.id}
                label={entry.title}
                selected={entry.id === tripId}
                onPress={() => {
                  if (mode === "FIXTURE")
                    setContext(selectLabContext(entry.id, undefined, fixtureCatalog));
                  else
                    setCoreSelection({
                      tripId: entry.id,
                      date: "",
                      generation,
                      accountId: currentCatalog?.scope.accountId ?? "",
                    });
                  setChoosing(false);
                }}
              />
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    controls: { padding: visual.space.page, gap: visual.space.heading },
    navigation: { flexDirection: "row", alignItems: "center" },
    ttrDiagnosticStrip: { flexGrow: 0 },
    ttrDiagnostics: {
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.heading,
      padding: visual.space.row,
    },
    dateStrip: { flex: 1 },
    dates: { gap: visual.space.heading, alignItems: "center" },
    meta: { ...visual.type.meta, color: c.textSecondary },
    intent: { ...visual.type.row, color: c.textPrimary, padding: visual.space.page },
  });
