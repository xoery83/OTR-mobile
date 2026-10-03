import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { systemMessage } from "@/ui/domainLabels";
import { useEffect, useRef, useState } from "react";
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
import { useLocalSearchParams } from "expo-router";
import { useNetworkState } from "expo-network";

import { AppIcon } from "@/components/AppIcon";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { ledgerCurrencyRepository } from "@/data/repositories/ledgerCurrencyRepository";
import type { JourneyCurrencyPreview } from "@/data/repositories/ledgerCurrencyRepository";
import { chooseJourneyEntry } from "@/domain/ledger/journeyContext";
import { createLocalId } from "@/domain/localId";
import { CurrencyPicker } from "@/features/ledger/CurrencyPicker";
import { currencyName } from "@/features/ledger/currencyPickerData";
import { ExchangeRateLookup } from "@/features/ledger/ExchangeRateLookup";
import { SheetHeader } from "@/components/SheetHeader";

type JourneySetting = { journeyId: string; settlementCurrency: string; title: string };

export default function CurrencyRoute() {
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ journeyId?: string }>();
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [journey, setJourney] = useState<JourneySetting | null>(null);
  const [locked, setLocked] = useState(false);
  const [canChange, setCanChange] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [preview, setPreview] = useState<JourneyCurrencyPreview | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const committing = useRef(false);
  const locale = useUiLocale();

  useEffect(() => {
    void getDefaultLedgerReportingRepository()
      .then(async (repository) => {
        const [selectedId, journeys] = await Promise.all([
          repository.getSelectedJourneyId(),
          repository.listJourneys(),
        ]);
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        const entry = chooseJourneyEntry(journeys, today, selectedId, params.journeyId);
        const activeJourneyId = entry.kind === "JOURNEY" ? entry.journeyId : null;
        const selected =
          journeys.find((item) => item.journeyId === activeJourneyId) ?? null;
        setJourney(selected);
        if (selected) {
          const [actor, settlement] = await Promise.all([
            repository.getActorContext(selected.journeyId),
            getDefaultLedgerSettlementRepository(),
          ]);
          setCanChange(actor?.role === "owner");
          setLocked(await settlement.hasFinalized(selected.journeyId));
        }
      })
      .catch(() => setMessage(t("currencySettings.loadFailed")))
      .finally(() => setLoading(false));
  }, [params.journeyId]);

  const selectCurrency = async (currency: string) => {
    setPickerOpen(false);
    setPreview(null);
    setOperationId(null);
    if (!journey || !online || currency === journey.settlementCurrency) return;
    setWorking(true);
    setMessage(null);
    try {
      const next = await ledgerCurrencyRepository.preview(journey.journeyId, currency);
      setPreview(next);
      setOperationId(createLocalId("journeyCurrency"));
    } catch {
      setMessage(t("currencySettings.copy1"));
    } finally {
      setWorking(false);
    }
  };

  const confirmChange = () => {
    if (!journey || !preview || !operationId || working || committing.current) return;
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
              committing.current = true;
              setWorking(true);
              try {
                await ledgerCurrencyRepository.commit(
                  journey.journeyId,
                  preview,
                  operationId,
                );
                setJourney({ ...journey, settlementCurrency: preview.proposedCurrency });
                setPreview(null);
                setMessage(t("currencySettings.copy6"));
              } catch {
                setPreview(null);
                setMessage(t("currencySettings.copy7"));
              } finally {
                committing.current = false;
                setWorking(false);
              }
            })(),
        },
      ],
    );
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
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
                disabled: locked || !canChange || !online || working,
              }}
              disabled={locked || !canChange || !online || working}
              onPress={() => setPickerOpen(true)}
              style={styles.row}
            >
              <View style={styles.grow}>
                <Text style={styles.label}>{journey.title}</Text>
                <Text style={styles.detail}>{t("currencySettings.copy8")}</Text>
                {locked ? (
                  <Text style={styles.detail}>{t("currencySettings.copy9")}</Text>
                ) : null}
                {!canChange && !locked ? (
                  <Text style={styles.detail}>{t("currencySettings.copy10")}</Text>
                ) : null}
                {!online ? (
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
        {journey ? (
          <ExchangeRateLookup
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
