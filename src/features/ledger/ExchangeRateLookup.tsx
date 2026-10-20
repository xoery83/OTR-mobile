import { systemMessage } from "@/ui/domainLabels";
import { t, getFormatLocale } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useUiLocale } from "@/ui/useUiLocale";
import { useEffect, useRef, useState } from "react";
import { UiDatePicker as DateTimePicker } from "@/ui/forms";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ledgerCurrencyRepository,
  type LedgerRateLookupResult,
} from "@/data/repositories/ledgerCurrencyRepository";
import { CurrencyPicker } from "./CurrencyPicker";
import { formatLedgerRate, localDateKey } from "./format";
import { SheetHeader } from "@/components/SheetHeader";

export function ExchangeRateLookup({
  journeyId,
  online,
  settlementCurrency,
}: {
  journeyId: string;
  online: boolean;
  settlementCurrency: string;
}) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState(settlementCurrency);
  const [date, setDate] = useState(() => localDateKey(new Date()));
  const [picker, setPicker] = useState<"FROM" | "TO" | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState(() => new Date());
  const [result, setResult] = useState<LedgerRateLookupResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const request = useRef(0);
  const reset = () => {
    setResult(null);
    setChecking(false);
    setMessage(null);
  };

  useEffect(() => {
    const current = ++request.current;
    if (!from) return;
    const input = { quoteCurrency: from, baseCurrency: to, requestedDate: date };
    void (async () => {
      try {
        const cached = await ledgerCurrencyRepository.cachedRateLookup(journeyId, input);
        if (request.current !== current) return;
        setResult(cached);
        if (!online) {
          setChecking(false);
          if (!cached) setMessage(t("ui.noSavedReferenceRateIsAvailableOffline"));
          return;
        }
      } catch {
        if (request.current !== current) return;
        setMessage(t("ui.savedReferenceRatesCouldNotBeRead"));
        if (!online) return;
      }
      setChecking(true);
      try {
        const fresh = await ledgerCurrencyRepository.refreshRateLookup(journeyId, input);
        if (request.current === current) setResult(fresh);
      } catch {
        if (request.current === current)
          setMessage(t("ui.couldNotCheckForAMoreExactReferenceRate"));
      } finally {
        if (request.current === current) setChecking(false);
      }
    })();
  }, [date, from, journeyId, online, to]);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {t("ui.exchangeRateLookup")}
      </Text>
      <View style={styles.card}>
        <View style={styles.fields}>
          <CurrencyField
            label={t("ui.from")}
            onPress={() => setPicker("FROM")}
            value={from}
          />
          <CurrencyField label={t("ui.to")} onPress={() => setPicker("TO")} value={to} />
        </View>
        <Text style={styles.fieldLabel}>{t("ui.date")}</Text>
        <Pressable
          accessibilityLabel={t("rate.referenceDate", { date })}
          accessibilityRole="button"
          onPress={() => {
            setPendingDate(new Date(`${date}T12:00:00`));
            setDateOpen(true);
          }}
          style={styles.dateField}
        >
          <Text style={styles.fieldValue}>{formatDate(date)}</Text>
        </Pressable>
        <LookupResult checking={checking} online={online} result={result} />
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {systemMessage(message)}
          </Text>
        ) : null}
      </View>
      <Modal
        allowSwipeDismissal
        animationType="slide"
        onRequestClose={() => setPicker(null)}
        presentationStyle="pageSheet"
        visible={picker !== null}
      >
        <SheetHeader
          onLeft={() => setPicker(null)}
          title={picker === "FROM" ? t("ui.fromCurrency") : t("ui.toCurrency")}
        />
        <CurrencyPicker
          onSelect={(code) => {
            reset();
            if (picker === "FROM") setFrom(code);
            if (picker === "TO") setTo(code);
            setPicker(null);
          }}
          selected={picker === "FROM" ? from : to}
          suggestions={[settlementCurrency, from, to, "EUR", "USD"]}
        />
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => setDateOpen(false)}
        transparent
        visible={dateOpen}
      >
        <View style={styles.dateOverlay}>
          <Pressable
            accessibilityLabel={t("ui.dismissDatePicker")}
            accessibilityRole="button"
            onPress={() => setDateOpen(false)}
            style={styles.dateBackdrop}
          />
          <SafeAreaView edges={["bottom"]} style={styles.datePanel}>
            <SheetHeader
              leftLabel={t("ui.cancel")}
              onLeft={() => setDateOpen(false)}
              onRight={() => {
                reset();
                setDate(localDateKey(pendingDate));
                setDateOpen(false);
              }}
              safeTop={false}
              title={t("ui.referenceDate2")}
            />
            {dateOpen ? (
              <View style={styles.dateWheelContainer}>
                <DateTimePicker
                  display="spinner"
                  maximumDate={new Date()}
                  mode="date"
                  onChange={(_, value) => {
                    if (value) setPendingDate(value);
                  }}
                  style={styles.dateWheel}

                  value={pendingDate}
                />
              </View>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

function CurrencyField({
  label,
  onPress,
  value,
}: {
  label: string;
  onPress: () => void;
  value: string;
}) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.currencyField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.fieldButton}>
        <Text style={value ? styles.fieldValue : styles.placeholder}>
          {value || t("ui.selectCurrency")}
        </Text>
      </Pressable>
    </View>
  );
}

function LookupResult({
  checking,
  online,
  result,
}: {
  checking: boolean;
  online: boolean;
  result: LedgerRateLookupResult | null;
}) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);

  if (!result)
    return checking ? (
      <ActivityIndicator accessibilityLabel={t("ui.lookingUpRate")} />
    ) : null;
  if (!result.decimalRate)
    return (
      <View style={styles.result}>
        <Text style={styles.resultTitle}>{unavailableCopy(result.resolution)}</Text>
        <Text style={styles.detail}>
          {t("ui.requestedDate")}
          {formatDate(result.requestedDate)}
        </Text>
        {checking ? <Text style={styles.checking}>{t("ui.checkingAgain")}</Text> : null}
      </View>
    );
  return (
    <View accessibilityLiveRegion="polite" style={styles.result}>
      <Text style={styles.rate}>
        {t("ui.1")}
        {result.quoteCurrency} {result.resolution === "SAME_CURRENCY" ? "=" : "≈"}{" "}
        {formatLedgerRate(result.decimalRate)} {result.baseCurrency}
      </Text>
      <Text style={styles.detail}>
        {t("ui.requestedDate")}
        {formatDate(result.requestedDate)}
      </Text>
      <Text style={styles.detail}>
        {t("ui.referenceDate2")}
        {formatDate(result.referenceDate ?? result.requestedDate)}
      </Text>
      <Text style={styles.detail}>{resolutionCopy(result.resolution)}</Text>
      {result.provider ? (
        <Text style={styles.source}>
          {result.provider} {t("ui.referenceRate")}
        </Text>
      ) : null}
      {!online ? (
        <Text style={styles.offline}>{t("ui.savedReferenceRateOffline")}</Text>
      ) : null}
      {checking ? (
        <Text style={styles.checking}>{t("ui.checkingForAMoreExactRate")}</Text>
      ) : null}
    </View>
  );
}

function resolutionCopy(resolution: LedgerRateLookupResult["resolution"]) {
  if (resolution === "SAME_CURRENCY") return t("rate.noConversion");
  if (resolution === "EXACT_DATE") return t("rate.exactDate");
  return t("rate.nearestReference");
}

function unavailableCopy(resolution: LedgerRateLookupResult["resolution"]) {
  if (resolution === "PENDING_PUBLICATION") return t("rate.pendingPublication");
  if (resolution === "UNSUPPORTED") return t("rate.unsupported");
  if (resolution === "NO_REFERENCE_WITHIN_POLICY") return t("rate.outsidePolicy");
  return t("rate.unavailable");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(getFormatLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    section: { marginTop: 24 },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 7,
      marginLeft: 4,
      textTransform: "uppercase",
    },
    card: { backgroundColor: colors.surface, borderRadius: 12, gap: 12, padding: 14 },
    fields: { flexDirection: "row", gap: 12 },
    currencyField: { flex: 1, gap: 5 },
    fieldLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
    fieldButton: {
      borderColor: colors.separator,
      borderRadius: 9,
      borderWidth: 1,
      minHeight: 44,
      padding: 11,
    },
    dateField: {
      borderColor: colors.separator,
      borderRadius: 9,
      borderWidth: 1,
      minHeight: 44,
      padding: 11,
    },
    fieldValue: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    placeholder: { color: colors.textSecondary, fontSize: 16 },
    result: {
      borderTopColor: colors.separator,
      borderTopWidth: 1,
      gap: 5,
      paddingTop: 14,
    },
    resultTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    rate: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
    detail: { color: colors.textTertiary, fontSize: 13, lineHeight: 19 },
    source: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
    offline: { color: colors.warning, fontSize: 13, fontWeight: "700" },
    checking: { color: colors.accent, fontSize: 13, fontWeight: "700" },
    message: { color: colors.warning, fontSize: 13, lineHeight: 19 },
    dateOverlay: { flex: 1, justifyContent: "flex-end" },
    dateBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
    },
    datePanel: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      overflow: "hidden",
    },
    dateWheelContainer: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 280,
    },
    dateWheel: { height: 216, width: "100%" },
  });
