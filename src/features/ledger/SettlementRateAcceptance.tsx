import { systemMessage, domainLabel } from "@/ui/domainLabels";
import { useUiLocale } from "@/ui/useUiLocale";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { MoneyText } from "./MoneyText";
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

type RateAcceptanceProps = {
  rates: Rate[];
  journeyId: string | null;
  onAccepted: () => void;
};
export function SettlementRateAcceptance(props: RateAcceptanceProps) {
  useUiLocale();

  return (
    <RateAcceptanceForm key={`${getAccountGeneration()}:${props.journeyId}`} {...props} />
  );
}
function RateAcceptanceForm({ rates, journeyId, onAccepted }: RateAcceptanceProps) {
  useUiLocale();

  const styles = useThemedStyles(createStyles);
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
      t("ui.acceptTheseExchangeRates"),
      t("ui.theseReferenceRatesAreFromAnEarlierDateAcceptingSaves"),
      [
        { text: t("ui.cancel"), style: "cancel" },
        {
          text: t("ui.acceptRates"),
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
                  setError(t("ui.ratesCouldNotBeSavedYourExpensesRemainAvailable")),
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
          ? t("settlement.earlierRates", { count: rates.length })
          : t("ui.yourRateDecisions")}
      </Text>
      <Text style={styles.body}>{t("ui.reviewAndAcceptTheseRatesHereToUseThemFor")}</Text>
      {rates.map((item) => (
        <View key={item.expenseId} style={styles.row}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>
            {t("ui.referenceDate")}
            {item.referenceDate} {t("ui.ecb")}
          </Text>
          <Text style={styles.body}>
            {t("ui.1")}
            {item.original.currency} ={" "}
            {item.decimalRate.includes(".")
              ? item.decimalRate.replace(/0+$/, "").replace(/\.$/, "")
              : item.decimalRate}{" "}
            {item.settlement.currency}
          </Text>
          <Text style={styles.body}>
            <MoneyText
              style={styles.body}
              accessible={false}
              minor={item.original.minor}
              currency={item.original.currency}
              scale={item.original.scale}
            />{" "}
            →{" "}
            <MoneyText
              style={styles.body}
              accessible={false}
              minor={item.settlement.minor}
              currency={item.settlement.currency}
              scale={item.settlement.scale}
            />
          </Text>
        </View>
      ))}
      {results.map((item) => (
        <View key={item.expenseId} style={styles.row}>
          <Text style={styles.title}>{item.title}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            {domainLabel(rateAcceptanceMessage(item))}
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
                {item.operationId ? t("ui.reviewChanges") : t("ui.reviewLatestRate")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {systemMessage(error)}
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
          {busy ? t("ui.savingAcceptedRates") : t("ui.acceptTheseRates")}
        </Text>
      </Pressable>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    card: {
      padding: 16,
      gap: 10,
      backgroundColor: colors.warningSurface,
      borderRadius: 16,
    },
    title: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    body: { color: colors.textTertiary, fontSize: 14, lineHeight: 20 },
    row: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      paddingTop: 10,
      gap: 4,
    },
    button: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
    },
    buttonText: { color: colors.onAccent, fontWeight: "700", fontSize: 16 },
    error: { color: colors.warning, fontSize: 14 },
  });
