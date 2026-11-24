import { UiButton } from "@/ui/controls";
import { subscribeLedgerOperationalSyncCompletion } from "@/data/operations/ledgerActivity";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { systemMessage } from "@/ui/domainLabels";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkState } from "expo-network";

import { AppIcon } from "@/components/AppIcon";
import { readLocalTripRepository } from "@/data/repositories/tripRepository";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import {
  classifyJourneyCurrencyPreviewFailure,
  ledgerCurrencyRepository,
} from "@/data/repositories/ledgerCurrencyRepository";
import type {
  JourneyCurrencyPreview,
  JourneyCurrencyPreviewFailure,
} from "@/data/repositories/ledgerCurrencyRepository";
import { chooseJourneyEntry } from "@/domain/ledger/journeyContext";
import { createLocalId } from "@/domain/localId";
import { CurrencyPicker } from "@/features/ledger/CurrencyPicker";
import { currencyName } from "@/features/ledger/currencyPickerData";
import { hostedLedgerCurrencySheetEnabled, useLedgerCurrencySheet } from "@/features/ledger/ledgerCurrencySheet";
import { ExchangeRateLookup } from "@/features/ledger/ExchangeRateLookup";
import { SheetHeader } from "@/components/SheetHeader";
import {
  requireActiveUserId,
  readCommittedLocalPrincipal,
} from "@/data/auth/authRepository";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  captureAccountScope,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import {
  readGuestTripCurrencyRepository,
  type GuestTripCurrency,
} from "@/data/repositories/guestTripCurrencyRepository";

const previewFailureMessages: Record<
  JourneyCurrencyPreviewFailure["kind"],
  Parameters<typeof t>[0]
> = {
  CONFIG_UNAVAILABLE: "currencySettings.previewConfigUnavailable",
  CONNECTIVITY: "currencySettings.copy1",
  AUTH: "currencySettings.previewAuth",
  FORBIDDEN: "currencySettings.previewForbidden",
  CONFLICT: "currencySettings.previewConflict",
  SERVICE: "currencySettings.previewService",
  INVALID_RESPONSE: "currencySettings.previewInvalid",
  UNKNOWN: "currencySettings.previewUnknown",
};

type CurrencyLane = {
  generation: number;
  journeyId?: string;
  tripId?: string;
  active: boolean;
  scope?: AccountScope;
  valid(): boolean;
};
type JourneySetting = { journeyId: string; settlementCurrency: string; title: string };
async function tripCurrencyCloudReady(tripId: string) {
  const trip = await (await readLocalTripRepository()).getTrip(tripId);
  return trip === null || trip.serverId === tripId;
}

export function CurrencySettingsScreen({ journeyId, hostLookupPickers = false }: { journeyId?: string; hostLookupPickers?: boolean }) {
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const { left, right } = useSafeAreaInsets();
  const lookupInsets = hostLookupPickers && hostedLedgerCurrencySheetEnabled
    ? { paddingLeft: 16 + left, paddingRight: 16 + right }
    : undefined;
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [journeyRead, setJourney] = useState<JourneySetting | null>(null);
  const [locked, setLocked] = useState(false);
  const [canChange, setCanChange] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [previewRead, setPreview] = useState<JourneyCurrencyPreview | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const committing = useRef(false);
  const locale = useUiLocale();
  const [guestLocal, setGuestLocal] = useState(false);
  const guestRead = useRef<GuestTripCurrency | null>(null);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const [loadedGeneration, setLoadedGeneration] = useState<number | null>(null);
  const [cloudReady, setCloudReady] = useState<boolean | null>(null);
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const lane = useRef<CurrencyLane | null>(null);
  const journey =
    loadedGeneration === generation &&
    journeyRead &&
    (journeyId === undefined || journeyRead.journeyId === journeyId)
      ? journeyRead
      : null;
  const preview = journey ? previewRead : null;
  const openHostedCurrency = useLedgerCurrencySheet(journey?.journeyId, journeyId, hostLookupPickers);

  useLayoutEffect(
    () => () => {
      if (lane.current) lane.current.active = false;
    },
    [generation, journeyId],
  );

  useEffect(() => {
    const current: CurrencyLane = {
      generation,
      journeyId,
      active: true,
      valid: () =>
        current.active &&
        lane.current === current &&
        getAccountGeneration() === generation,
    };
    lane.current = current;
    const stopSync = subscribeLedgerOperationalSyncCompletion((event) => {
      if (
        !current.valid() ||
        !current.scope ||
        !current.tripId ||
        event.accountId !== current.scope.accountId ||
        event.generation !== generation ||
        !event.journeyIds.includes(current.tripId)
      )
        return;
      void tripCurrencyCloudReady(current.tripId)
        .then((ready) => {
          if (current.valid()) setCloudReady(ready);
        })
        .catch(() => {
          if (current.valid()) setCloudReady(null);
        });
    });
    void (async () => {
      await Promise.resolve();
      if (!current.valid()) return null;
      setLoading(true);
      setJourney(null);
      setPreview(null);
      setOperationId(null);
      setCloudReady(null);
      setPendingCurrency(null);
      setCanChange(false);
      setLocked(false);
      setGuestLocal(false);
      setMessage(null);
      setPickerOpen(false);
      setHelpOpen(false);
      setWorking(false);
      committing.current = false;
      const principal = await readCommittedLocalPrincipal();
      if (!current.valid()) return null;
      if (principal?.kind === "GUEST") {
        if (!journeyId) throw Error("GUEST_CURRENCY_UNAVAILABLE");
        const value = await (await readGuestTripCurrencyRepository()).read(journeyId);
        if (!current.valid() || value.context.generation !== getAccountGeneration())
          return null;
        guestRead.current = value;
        setGuestLocal(true);
        setJourney({ journeyId, title: value.title, settlementCurrency: value.code });
        setCanChange(true);
        setLocked(Boolean(value.historyLocked));
        return null;
      }
      if (principal?.kind !== "ACCOUNT") throw Error("CURRENCY_ACCOUNT_REQUIRED");
      current.scope = await captureAccountScope(requireActiveUserId);
      if (!current.valid() || current.scope.accountId !== principal.accountId)
        return null;
      return getDefaultLedgerReportingRepository();
    })()
      .then(async (repository) => {
        if (!repository || !current.valid()) return;
        const [selectedId, journeys] = await Promise.all([
          repository.getSelectedJourneyId(),
          repository.listJourneys(),
        ]);
        if (!current.valid()) return;
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const entry = chooseJourneyEntry(journeys, today, selectedId);
        // A task opened for a specific Trip must never fall back to another Ledger.
        const activeJourneyId =
          journeyId !== undefined
            ? journeyId
            : entry.kind === "JOURNEY"
              ? entry.journeyId
              : null;
        const selected =
          journeys.find((item) => item.journeyId === activeJourneyId) ?? null;
        setJourney(selected);
        if (selected) {
          current.tripId = selected.journeyId;
          const [actor, settlement] = await Promise.all([
            repository.getActorContext(selected.journeyId),
            getDefaultLedgerSettlementRepository(),
          ]);
          if (!current.valid()) return;
          setCanChange(actor?.role === "owner");
          const finalized = await settlement.hasFinalized(selected.journeyId);
          if (!current.valid()) return;
          setLocked(finalized);
          // The local Trip owns its authored name; Ledger identity/authority stay unchanged.
          try {
            const trips = await (await readLocalTripRepository()).listTrips();
            if (!current.valid()) return;
            const local = trips.find((trip) => trip.id === selected.journeyId);
            setCloudReady(!local || local.serverId === selected.journeyId);
            const name = local?.name;
            if (name) setJourney({ ...selected, title: name });
          } catch {
            // A Ledger without a local Trip retains its existing caption.
          }
        }
      })
      .catch(() => {
        if (current.valid()) setMessage(t("currencySettings.loadFailed"));
      })
      .finally(() => {
        if (current.valid()) {
          setLoadedGeneration(generation);
          setLoading(false);
        }
      });
    return () => {
      current.active = false;
      stopSync();
      if (lane.current === current) guestRead.current = null;
    };
  }, [journeyId, generation]);

  const selectCurrency = async (currency: string) => {
    const current = lane.current;
    if (
      !current?.valid() ||
      current.generation !== generation ||
      current.journeyId !== journeyId ||
      !journey ||
      !canChange ||
      locked ||
      working
    )
      return;
    setPickerOpen(false);
    setPreview(null);
    setOperationId(null);
    setPendingCurrency(null);
    if (!journey || currency === journey.settlementCurrency) return;
    if (guestLocal) {
      const before = guestRead.current;
      if (!before || locked || working) return;
      setWorking(true);
      setMessage(null);
      try {
        const value = await (
          await readGuestTripCurrencyRepository()
        ).save(before, currency);
        if (
          !current.valid() ||
          guestRead.current !== before ||
          value.context.generation !== getAccountGeneration()
        )
          return;
        guestRead.current = value;
        setJourney({
          journeyId: value.context.tripId,
          title: value.title,
          settlementCurrency: value.code,
        });
        setMessage(t("currencySettings.copy6"));
      } catch {
        if (current.valid() && guestRead.current === before)
          setMessage(`${t("ui.couldNotSave")} · ${t("common.tryAgain")}`);
      } finally {
        if (
          current.valid() &&
          guestRead.current?.context.generation === getAccountGeneration()
        )
          setWorking(false);
      }
      return;
    }
    if (!online || !current.scope) return;
    setWorking(true);
    setMessage(null);
    setPendingCurrency(currency);
    let readinessRead = false;
    try {
      const ready = await tripCurrencyCloudReady(journey.journeyId);
      if (!current.valid()) return;
      setCloudReady(ready);
      readinessRead = true;
      if (!ready) return;
      const next = await ledgerCurrencyRepository.preview(
        journey.journeyId,
        currency,
        current.scope,
      );
      if (!current.valid()) return;
      setPreview(next);
      setPendingCurrency(null);
      setOperationId(createLocalId("journeyCurrency"));
    } catch (error) {
      if (!current.valid()) return;
      if (!readinessRead) {
        setCloudReady(null);
        setMessage(t("currencySettings.loadFailed"));
      } else {
        setMessage(
          t(previewFailureMessages[classifyJourneyCurrencyPreviewFailure(error).kind]),
        );
      }
    } finally {
      if (current.valid()) setWorking(false);
    }
  };

  const availableCurrencyPicker = journey && canChange && !locked && !working && (guestLocal || online);
  const currentPicker = useRef<{
    journey: NonNullable<typeof journey>;
    guestLocal: boolean;
    select: typeof selectCurrency;
  } | null>(null);
  useLayoutEffect(() => {
    currentPicker.current = availableCurrencyPicker ? { journey, guestLocal, select: selectCurrency } : null;
    return () => { currentPicker.current = null; };
  });
  const presentCurrencyPicker = () => {
    const owner = lane.current;
    const scope = currentPicker.current;
    if (!owner?.valid() || !scope) return;
    const current = () => {
      const picker = currentPicker.current;
      return owner.valid() && picker?.journey.journeyId === scope.journey.journeyId &&
        picker.journey.settlementCurrency === scope.journey.settlementCurrency &&
        picker.guestLocal === scope.guestLocal ? picker : null;
    };
    if (!openHostedCurrency({
      kind: "currency",
      titleKey: "currencySettings.copy31",
      selected: scope.journey.settlementCurrency,
      suggestions: [scope.journey.settlementCurrency, "EUR", "USD"],
      isCurrent: () => current() !== null,
      choose: code => { void current()?.select(code); },
    })) setPickerOpen(true);
  };

  const confirmChange = () => {
    const current = lane.current;
    const scope = current?.scope;
    if (
      !current?.valid() ||
      current.generation !== generation ||
      current.journeyId !== journeyId ||
      !scope ||
      !journey ||
      !canChange ||
      locked ||
      !online ||
      !preview ||
      !operationId ||
      working ||
      committing.current
    )
      return;
    if (
      preview.finalizedSettlementCount > 0 ||
      preview.openSettlementCount > 0 ||
      preview.conflictCount > 0
    )
      return;
    Alert.alert(
      t("currencySettings.copy2"),
      `${preview.currentCurrency} → ${preview.proposedCurrency}. ${t(
        "currencySettings.copy3",
      )}`,
      [
        { text: t("currencySettings.copy4"), style: "cancel" },
        {
          text: t("currencySettings.copy5"),
          onPress: () =>
            void (async () => {
              if (!current.valid()) return;
              committing.current = true;
              setWorking(true);
              try {
                await ledgerCurrencyRepository.commit(
                  journey.journeyId,
                  preview,
                  operationId,
                  scope,
                );
                if (!current.valid()) return;
                setJourney({ ...journey, settlementCurrency: preview.proposedCurrency });
                setPreview(null);
                setMessage(t("currencySettings.copy6"));
              } catch {
                if (!current.valid()) return;
                setPreview(null);
                setMessage(t("currencySettings.copy7"));
              } finally {
                if (current.valid()) {
                  committing.current = false;
                  setWorking(false);
                }
              }
            })(),
        },
      ],
    );
  };

  if (loading || loadedGeneration !== generation)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, lookupInsets]}
      >
        <View style={styles.headingRow}>
          <Text
            accessibilityRole="header"
            style={[styles.sectionTitle, styles.inlineTitle]}
          >
            {t("currencySettings.heading")}
          </Text>
          <Pressable
            accessibilityLabel={t("currencySettings.about")}
            accessibilityRole="button"
            accessibilityState={{ expanded: helpOpen }}
            onPress={() => setHelpOpen(!helpOpen)}
            style={styles.infoButton}
          >
            <AppIcon color={colors.accent} name="info.circle" size={18} />
          </Pressable>
        </View>
        <View style={styles.group}>
          {journey ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: locked || !canChange || (!guestLocal && !online) || working,
              }}
              disabled={locked || !canChange || (!guestLocal && !online) || working}
              onPress={presentCurrencyPicker}
              style={styles.row}
            >
              <View style={styles.grow}>
                <Text style={styles.label}>{journey.title}</Text>
                <Text style={styles.detail}>{t("currencySettings.copy8")}</Text>
                {locked ? (
                  <Text style={styles.detail}>
                    {guestLocal
                      ? t("tripForm.currencyReadOnly", {
                          code: journey.settlementCurrency,
                        })
                      : t("currencySettings.copy9")}
                  </Text>
                ) : null}
                {!canChange && !locked ? (
                  <Text style={styles.detail}>{t("currencySettings.copy10")}</Text>
                ) : null}
                {!guestLocal && !online ? (
                  <Text style={styles.detail}>{t("currencySettings.copy11")}</Text>
                ) : null}
              </View>
              <View style={styles.currencyValue}>
                <Text style={styles.currencyCode}>{journey.settlementCurrency}</Text>
                <Text style={styles.currencyName}>
                  {currencyName(journey.settlementCurrency, locale)}
                </Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.label}>{t("currencySettings.copy12")}</Text>
              <Text style={styles.detail}>{t("currencySettings.copy13")}</Text>
            </View>
          )}
        </View>
        {working ? <ActivityIndicator /> : null}
        {journey && !guestLocal && cloudReady === false ? (
          <Text style={styles.detail}>{t("tripCreate.pendingTrip")}</Text>
        ) : null}
        {journey && !guestLocal && pendingCurrency && !preview ? (
          <View style={styles.preview}>
            <Text style={styles.label}>
              {t("currencySettings.copy14")}: {journey.settlementCurrency} →{" "}
              {pendingCurrency}
            </Text>
            <UiButton
              variant="text"
              label={t(cloudReady ? "currencySettings.copy14" : "common.tryAgain")}
              disabled={working || !online || locked || !canChange}
              onPress={() => void selectCurrency(pendingCurrency)}
            />
          </View>
        ) : null}
        {preview ? (
          <View style={styles.preview}>
            <Text accessibilityRole="header" style={styles.label}>
              {t("currencySettings.copy14")}: {preview.currentCurrency} →{" "}
              {preview.proposedCurrency}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.copy15")}: {preview.affectedExpenses}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.copy16")}: {preview.sameCurrencyCount}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.copy17")}: {preview.referenceCandidateCount}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.copy18")}: {preview.missingEconomicDateCount}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.copy19")}: {preview.missingHistoricalQuoteCount}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.manual")} {preview.manualAgreedCount}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.actual")} {preview.actualPayerCostCount}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.copy20")}: {preview.otherPolicyCount}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.copy21")}: {preview.conflictCount}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.copy22")}: {preview.expectedUnresolvedCount}
            </Text>
            <Text style={styles.detail}>
              {t("currencySettings.copy23")}: {preview.openSettlementCount};{" "}
              {t("currencySettings.copy24")}: {preview.finalizedSettlementCount}
            </Text>
            <Text style={styles.detail}>{t("currencySettings.copy25")}</Text>
            {preview.openSettlementCount ? (
              <Text style={styles.error}>{t("currencySettings.copy26")}</Text>
            ) : null}
            {preview.finalizedSettlementCount ? (
              <Text style={styles.error}>{t("currencySettings.copy27")}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled:
                  working ||
                  preview.finalizedSettlementCount > 0 ||
                  preview.openSettlementCount > 0 ||
                  preview.conflictCount > 0,
              }}
              disabled={
                working ||
                preview.finalizedSettlementCount > 0 ||
                preview.openSettlementCount > 0 ||
                preview.conflictCount > 0
              }
              onPress={confirmChange}
              style={styles.confirm}
            >
              <Text style={styles.confirmText}>{t("currencySettings.copy28")}</Text>
            </Pressable>
          </View>
        ) : null}
        {journey && !guestLocal ? (
          <ExchangeRateLookup
            hostPickers={hostLookupPickers}
            journeyId={journey.journeyId}
            key={`${journey.journeyId}:${journey.settlementCurrency}`}
            online={online}
            settlementCurrency={journey.settlementCurrency}
          />
        ) : null}
        {message ? <Text style={styles.error}>{systemMessage(message)}</Text> : null}
      </ScrollView>
      {helpOpen ? (
        <View style={styles.helpOverlay}>
          <Pressable
            accessibilityLabel={t("currencySettings.closeHelp")}
            accessibilityRole="button"
            onPress={() => setHelpOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.helpPopover}>
            <Text style={styles.helpText}>{t("currencySettings.copy29")}</Text>
          </View>
        </View>
      ) : null}
      <Modal
        allowSwipeDismissal
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
        presentationStyle="pageSheet"
        visible={pickerOpen}
      >
        <SheetHeader
          leftLabel={t("currencySettings.copy30")}
          onLeft={() => setPickerOpen(false)}
          title={t("currencySettings.copy31")}
        />
        <CurrencyPicker
          selected={journey?.settlementCurrency ?? "NZD"}
          suggestions={[journey?.settlementCurrency ?? "NZD", "EUR", "USD"]}
          onSelect={(code) => void selectCurrency(code)}
        />
      </Modal>
    </View>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    center: {
      backgroundColor: colors.background,
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
    },
    content: {
      backgroundColor: colors.background,
      flexGrow: 1,
      padding: 16,
      paddingBottom: 40,
    },
    sectionTitle: {
      color: colors.textTertiary,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 7,
      marginLeft: 4,
      marginTop: 18,
      textTransform: "uppercase",
    },
    headingRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
      marginBottom: 7,
      marginTop: 18,
    },
    inlineTitle: { marginBottom: 0, marginTop: 0 },
    infoButton: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 36,
      minWidth: 36,
    },
    helpOverlay: { ...StyleSheet.absoluteFill, zIndex: 10 },
    helpPopover: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 6,
      left: 16,
      padding: 14,
      position: "absolute",
      right: 16,
      shadowColor: colors.textPrimary,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
      top: 80,
      zIndex: 10,
    },
    helpText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
    group: { backgroundColor: colors.surface, borderRadius: 12, overflow: "hidden" },
    row: {
      alignItems: "center",
      borderBottomColor: colors.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      minHeight: 54,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    grow: { flex: 1 },
    label: { color: colors.textPrimary, flex: 1, fontSize: 16, fontWeight: "600" },
    detail: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
    currencyValue: { alignItems: "flex-end", maxWidth: "42%" },
    currencyCode: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    currencyName: {
      color: colors.textTertiary,
      fontSize: 12,
      marginTop: 2,
      textAlign: "right",
    },
    emptyState: { minHeight: 82, padding: 14 },
    error: { color: colors.destructive, fontSize: 14, margin: 8 },
    preview: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      gap: 5,
      marginTop: 16,
      padding: 16,
    },
    confirm: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      marginTop: 12,
      padding: 14,
    },
    confirmText: {
      color: colors.onAccent,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    },
  });
