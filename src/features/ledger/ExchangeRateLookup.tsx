import { useEffect, useRef, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  ledgerCurrencyRepository,
  type LedgerRateLookupResult,
} from "@/data/repositories/ledgerCurrencyRepository";
import { CurrencyPicker } from "./CurrencyPicker";
import { formatLedgerRate } from "./format";

export function ExchangeRateLookup({
  journeyId,
  online,
  settlementCurrency,
}: {
  journeyId: string;
  online: boolean;
  settlementCurrency: string;
}) {
  const [from, setFrom] = useState(settlementCurrency === "USD" ? "EUR" : "USD");
  const [to, setTo] = useState(settlementCurrency);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [picker, setPicker] = useState<"FROM" | "TO" | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
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
    const input = { quoteCurrency: from, baseCurrency: to, requestedDate: date };
    void (async () => {
      try {
        const cached = await ledgerCurrencyRepository.cachedRateLookup(journeyId, input);
        if (request.current !== current) return;
        setResult(cached);
        if (!online) {
          setChecking(false);
          if (!cached) setMessage("No saved reference rate is available offline.");
          return;
        }
      } catch {
        if (request.current !== current) return;
        setMessage("Saved reference rates could not be read.");
        if (!online) return;
      }
      setChecking(true);
      try {
        const fresh = await ledgerCurrencyRepository.refreshRateLookup(journeyId, input);
        if (request.current === current) setResult(fresh);
      } catch {
        if (request.current === current)
          setMessage("Could not check for a more exact reference rate.");
      } finally {
        if (request.current === current) setChecking(false);
      }
    })();
  }, [date, from, journeyId, online, to]);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Exchange Rate Lookup
      </Text>
      <View style={styles.card}>
        <View style={styles.fields}>
          <CurrencyField label="From" onPress={() => setPicker("FROM")} value={from} />
          <CurrencyField label="To" onPress={() => setPicker("TO")} value={to} />
        </View>
        <Text style={styles.fieldLabel}>Date</Text>
        <Pressable
          accessibilityLabel={`Reference date ${date}`}
          accessibilityRole="button"
          onPress={() => setDateOpen(true)}
          style={styles.dateField}
        >
          <Text style={styles.fieldValue}>{formatDate(date)}</Text>
        </Pressable>
        <LookupResult checking={checking} online={online} result={result} />
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {message}
          </Text>
        ) : null}
      </View>
      <Modal
        animationType="slide"
        onRequestClose={() => setPicker(null)}
        visible={picker !== null}
      >
        <View style={styles.pickerHeader}>
          <Pressable accessibilityRole="button" onPress={() => setPicker(null)}>
            <Text style={styles.done}>Close</Text>
          </Pressable>
        </View>
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
      {dateOpen ? (
        <DateTimePicker
          display="spinner"
          maximumDate={new Date()}
          mode="date"
          onChange={(_, value) => {
            setDateOpen(false);
            if (value) {
              reset();
              setDate(value.toISOString().slice(0, 10));
            }
          }}
          value={new Date(`${date}T12:00:00`)}
        />
      ) : null}
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
  return (
    <View style={styles.currencyField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.fieldButton}>
        <Text style={styles.fieldValue}>{value}</Text>
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
  if (!result)
    return checking ? <ActivityIndicator accessibilityLabel="Looking up rate" /> : null;
  if (!result.decimalRate)
    return (
      <View style={styles.result}>
        <Text style={styles.resultTitle}>{unavailableCopy(result.resolution)}</Text>
        <Text style={styles.detail}>
          Requested date {formatDate(result.requestedDate)}
        </Text>
        {checking ? <Text style={styles.checking}>Checking again…</Text> : null}
      </View>
    );
  return (
    <View accessibilityLiveRegion="polite" style={styles.result}>
      <Text style={styles.rate}>
        1 {result.quoteCurrency} {result.resolution === "SAME_CURRENCY" ? "=" : "≈"}{" "}
        {formatLedgerRate(result.decimalRate)} {result.baseCurrency}
      </Text>
      <Text style={styles.detail}>Requested date {formatDate(result.requestedDate)}</Text>
      <Text style={styles.detail}>
        Reference date {formatDate(result.referenceDate ?? result.requestedDate)}
      </Text>
      <Text style={styles.detail}>{resolutionCopy(result.resolution)}</Text>
      {result.provider ? (
        <Text style={styles.source}>{result.provider} reference rate</Text>
      ) : null}
      {!online ? (
        <Text style={styles.offline}>Saved reference rate · offline</Text>
      ) : null}
      {checking ? (
        <Text style={styles.checking}>Checking for a more exact rate…</Text>
      ) : null}
    </View>
  );
}

function resolutionCopy(resolution: LedgerRateLookupResult["resolution"]) {
  if (resolution === "SAME_CURRENCY") return "No conversion is needed.";
  if (resolution === "EXACT_DATE") return "Exact reference date match.";
  return "Using the nearest available reference rate within the allowed window.";
}

function unavailableCopy(resolution: LedgerRateLookupResult["resolution"]) {
  if (resolution === "PENDING_PUBLICATION")
    return "The requested date's reference rate is not published yet.";
  if (resolution === "UNSUPPORTED") return "This currency pair is not supported by ECB.";
  if (resolution === "NO_REFERENCE_WITHIN_POLICY")
    return "No reference rate is available within the allowed lookup window.";
  return "A reference rate is temporarily unavailable.";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  sectionTitle: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
    marginLeft: 4,
    textTransform: "uppercase",
  },
  card: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 12, padding: 14 },
  fields: { flexDirection: "row", gap: 12 },
  currencyField: { flex: 1, gap: 5 },
  fieldLabel: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  fieldButton: {
    borderColor: "#CBD5E1",
    borderRadius: 9,
    borderWidth: 1,
    minHeight: 44,
    padding: 11,
  },
  dateField: {
    borderColor: "#CBD5E1",
    borderRadius: 9,
    borderWidth: 1,
    minHeight: 44,
    padding: 11,
  },
  fieldValue: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  result: { borderTopColor: "#E5E7EB", borderTopWidth: 1, gap: 5, paddingTop: 14 },
  resultTitle: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  rate: { color: "#0F172A", fontSize: 22, fontWeight: "800" },
  detail: { color: "#475569", fontSize: 13, lineHeight: 19 },
  source: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  offline: { color: "#7C5B00", fontSize: 13, fontWeight: "700" },
  checking: { color: "#0F766E", fontSize: 13, fontWeight: "700" },
  message: { color: "#7C5B00", fontSize: 13, lineHeight: 19 },
  pickerHeader: { backgroundColor: "#FFFFFF", padding: 16 },
  done: { color: "#0F766E", fontSize: 16, fontWeight: "700" },
});
