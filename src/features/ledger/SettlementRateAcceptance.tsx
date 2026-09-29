import { rateAcceptanceMessage } from "./settlementRateCandidates";
import { useState, useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import {
  acceptSettlementRates,
  readSettlementRateResults,
  loadPendingSettlementRates,
  type RateAcceptanceResult,
  type SettlementRateAcceptance as Rate,
} from "@/data/operations/acceptSettlementRates";
import { formatLedgerMoney } from "./format";

type RateAcceptanceProps = {
  rates: Rate[];
  journeyId: string | null;
  onAccepted: () => void;
};
export function SettlementRateAcceptance(props: RateAcceptanceProps) {
  return (
    <RateAcceptanceForm key={`${getAccountGeneration()}:${props.journeyId}`} {...props} />
  );
}
function RateAcceptanceForm({ rates, journeyId, onAccepted }: RateAcceptanceProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [results, setResults] = useState<RateAcceptanceResult[]>([]);
  const [attempted, setAttempted] = useState<string | null>(null);
  const generation = getAccountGeneration();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (journeyId)
        void loadPendingSettlementRates(journeyId)
          .then((next) => {
            if (active && generation === getAccountGeneration())
              setResults((previous) => (previous.length ? previous : next));
          })
          .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [journeyId, generation]),
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const poll = async () => {
        if (
          !results.some(
            (r) =>
              r.operationId &&
              ["LOCAL_SAVED", "PENDING_SYNC", "RETRYABLE_FAILURE"].includes(r.state),
          )
        )
          return;
        const updated = await readSettlementRateResults(results).catch(() => null);
        if (!active || generation !== getAccountGeneration() || !updated) return;
        setResults(updated);
        if (updated.some((r, i) => r.state !== results[i]?.state)) onAccepted();
      };
      const timer = setInterval(() => void poll(), 2000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [generation, results, onAccepted]),
  );
  if (!rates.length && !results.length) return null;
  const signature = JSON.stringify(rates);
  const available = rates.filter(
    (rate) =>
      !results.some(
        (r) =>
          r.expenseId === rate.expenseId &&
          r.operationId &&
          [
            "LOCAL_SAVED",
            "PENDING_SYNC",
            "SERVER_CONFIRMED",
            "RETRYABLE_FAILURE",
          ].includes(r.state),
      ),
  );
  const blocked =
    busy ||
    !available.length ||
    (attempted === signature &&
      !results.some((r) => r.state === "RETRYABLE_FAILURE" && !r.operationId));
  const accept = () =>
    Alert.alert(
      "Accept these exchange rates?",
      "These reference rates are from an earlier date. Accepting saves them as agreed values for these expenses. Published rates will not automatically replace them. Final confirmation follows a fresh check.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept rates",
          onPress: () => {
            if (blocked) return;
            setAttempted(signature);
            setBusy(true);
            setError(null);
            void acceptSettlementRates(available)
              .then(({ results: next }) => {
                if (generation === getAccountGeneration())
                  setResults((previous) => [
                    ...previous.filter(
                      (old) => !next.some((row) => row.expenseId === old.expenseId),
                    ),
                    ...next,
                  ]);
              })
              .catch(
                () =>
                  generation === getAccountGeneration() &&
                  setError("Rates could not be saved. Your expenses remain available."),
              )
              .finally(() => {
                if (generation === getAccountGeneration()) {
                  setBusy(false);
                  onAccepted();
                }
              });
          },
        },
      ],
    );
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        {rates.length
          ? `${rates.length} ${rates.length === 1 ? "expense uses" : "expenses use"} an earlier reference rate`
          : "Your rate decisions"}
      </Text>
      <Text style={styles.body}>
        Review and accept these rates here to use them for final settlement.
      </Text>
      {rates.map((item) => (
        <View key={item.expenseId} style={styles.row}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>Reference date: {item.referenceDate} · ECB</Text>
          <Text style={styles.body}>
            1 {item.original.currency} ={" "}
            {item.decimalRate.includes(".")
              ? item.decimalRate.replace(/0+$/, "").replace(/\.$/, "")
              : item.decimalRate}{" "}
            {item.settlement.currency}
          </Text>
          <Text style={styles.body}>
            {formatLedgerMoney(
              item.original.minor,
              item.original.currency,
              item.original.scale,
            )}{" "}
            →{" "}
            {formatLedgerMoney(
              item.settlement.minor,
              item.settlement.currency,
              item.settlement.scale,
            )}
          </Text>
        </View>
      ))}
      {results.map((item) => (
        <View key={item.expenseId} style={styles.row}>
          <Text style={styles.title}>{item.title}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            {rateAcceptanceMessage(item)}
          </Text>
          {item.state === "CONFLICT_REQUIRES_ACTION" &&
          item.operationResult?.error?.code !== "SETTLEMENT_INPUT_STALE" ? (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() =>
                item.operationId
                  ? router.push({
                      pathname: "/expenses/conflict/[id]",
                      params: { id: item.expenseId },
                    } as never)
                  : onAccepted()
              }
            >
              <Text style={styles.buttonText}>
                {item.operationId ? "Review changes" : "Review latest rate"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked, busy }}
        disabled={blocked}
        onPress={accept}
        style={styles.button}
      >
        <Text style={styles.buttonText}>
          {busy ? "Saving accepted rates…" : "Accept these rates"}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: 16, gap: 10, backgroundColor: "#FFF7ED", borderRadius: 16 },
  title: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  body: { color: "#475569", fontSize: 14, lineHeight: 20 },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D6D3D1",
    paddingTop: 10,
    gap: 4,
  },
  button: {
    backgroundColor: "#0F766E",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  buttonText: { color: "white", fontWeight: "700", fontSize: 16 },
  error: { color: "#9A3412", fontSize: 14 },
});
