import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { assertAccountRequestGeneration } from "@/data/auth/accountRequestContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readTripHomeLedgerRepository,
  type TripHomeLedgerSnapshot,
} from "@/data/repositories/tripHomeLedgerRepository";
import { subscribeLedgerOperationalSyncCompletion } from "@/data/sync/ledgerOperationalSync";
import type { TripHomeWidget } from "@/features/trip/TripHomeWidgetHost";
import { UiButton, UiText } from "@/ui/controls";
import { categoryLabel } from "@/ui/domainLabels";
import { t } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";
import { createLatestRequest } from "./latestRequest";
import { MoneyText } from "./MoneyText";
import {
  readSharedSettlementProjection,
  readSavedSettlementProjection,
  type SettlementSummaryProjection,
} from "./settlementSummaryProjection";

type Lifecycle = "Upcoming" | "Active" | "Past" | "Undated";
export type TripHomeFinanceData = TripHomeLedgerSnapshot & {
  settlement: SettlementSummaryProjection | null;
};

export function financeDataForHome(
  snapshot: TripHomeLedgerSnapshot,
  lifecycle: Lifecycle,
): TripHomeFinanceData | null {
  const shared =
    lifecycle === "Past"
      ? readSharedSettlementProjection(snapshot.journey.journeyId)
      : null;
  const settlement =
    shared?.actorMemberId === snapshot.memberId &&
    shared.accountGeneration === snapshot.context.generation
      ? readSavedSettlementProjection(snapshot.journey.journeyId)
      : null;
  return snapshot.expenseCount || settlement ? { ...snapshot, settlement } : null;
}

// This is a read-only subscriber: startup and Ledger's existing sync owner remain authoritative.
export function useTripHomeFinanceWidget(
  tripId: string | null,
  lifecycle: Lifecycle | null,
): TripHomeWidget | null {
  useUiLocale();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const request = useMemo(() => createLatestRequest(), []);
  const [loaded, setLoaded] = useState<TripHomeLedgerSnapshot | null>(null);
  const load = useCallback(async () => {
    const ticket = request.begin();
    if (!tripId || !lifecycle) return;
    try {
      const snapshot = await (await readTripHomeLedgerRepository()).read(tripId);
      if (request.isCurrent(ticket) && generation === getAccountGeneration())
        setLoaded(snapshot);
    } catch {
      if (request.isCurrent(ticket)) setLoaded(null);
    }
  }, [tripId, lifecycle, generation, request]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => request.cancel();
    }, [load, request]),
  );
  useEffect(
    () =>
      subscribeLedgerOperationalSyncCompletion((event) => {
        if (
          event.generation === generation &&
          (event.discoveryChanged || (tripId && event.journeyIds.includes(tripId)))
        )
          void load();
      }),
    [generation, tripId, load],
  );
  const data =
    loaded &&
    loaded.context.tripId === tripId &&
    loaded.context.generation === generation &&
    lifecycle
      ? financeDataForHome(loaded, lifecycle)
      : null;
  return data && lifecycle
    ? {
        id: "ledger-finance",
        title: t("ledger.spending"),
        content: <TripHomeFinanceWidget data={data} lifecycle={lifecycle} />,
      }
    : null;
}

export function TripHomeFinanceWidget({
  data,
  lifecycle,
}: {
  data: TripHomeFinanceData;
  lifecycle: Lifecycle;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const { journey, group, mine } = data;
  const open = (href: Href) => {
    try {
      assertAccountRequestGeneration(data.context);
    } catch {
      return;
    }
    router.push(href);
  };
  const openSpending = () =>
    open({
      pathname: "/expenses/journey/[journeyId]",
      params: { journeyId: journey.journeyId },
    });
  return (
    <View style={styles.content}>
      <View style={styles.metrics}>
        {[
          { label: t("ui.groupSpending"), summary: group },
          { label: t("ui.mySpending"), summary: mine },
        ].map(({ label, summary }) => (
          <View
            key={label}
            style={[styles.metric, fontScale > 1 && { flexBasis: "100%" }]}
          >
            <UiText style={styles.secondary}>{label}</UiText>
            {summary.expenseCount ? (
              <MoneyText
                minor={summary.totalMinor}
                currency={journey.settlementCurrency}
                scale={journey.settlementScale}
                variant="headline"
              />
            ) : (
              <UiText style={styles.body}>{t("ui.spendingTotalUnavailable")}</UiText>
            )}
          </View>
        ))}
      </View>
      {group.expenseCount < data.expenseCount ? (
        <UiText style={styles.secondary}>
          {t("analysis.excludedDescription", {
            count: data.expenseCount - group.expenseCount,
          })}
        </UiText>
      ) : null}
      {group.unresolvedRateCount ? (
        <UiText style={styles.secondary}>
          {t("ui.waitingForConfirmedJourneyCurrencyValue")}
        </UiText>
      ) : null}
      {group.openConflictCount ? (
        <UiText style={styles.secondary}>{t("ui.changesNeedReview")}</UiText>
      ) : null}
      {data.categories.map(({ category }) => (
        <View key={category} style={styles.category}>
          <UiText style={styles.body}>{categoryLabel(category)}</UiText>
        </View>
      ))}
      {lifecycle !== "Past" && data.recent.length ? (
        <View style={styles.section}>
          <UiText style={styles.heading}>{t("ledger.recentExpenses")}</UiText>
          {data.recent.map((expense) => (
            <Pressable
              key={expense.id}
              accessibilityRole="button"
              onPress={() =>
                open({
                  pathname: "/trip-expense/[id]",
                  params: { id: expense.id },
                })
              }
              style={styles.recentRow}
            >
              <View style={[styles.recentTitle, fontScale > 1 && { flexBasis: "100%" }]}>
                <UiText style={styles.body}>{expense.title}</UiText>
                <UiText style={styles.secondary}>
                  {categoryLabel(expense.category)}
                </UiText>
              </View>
              <MoneyText
                minor={expense.originalMinor}
                currency={expense.originalCurrency}
                scale={expense.originalScale}
                variant="standard"
              />
            </Pressable>
          ))}
        </View>
      ) : null}
      {lifecycle === "Past" && data.settlement ? (
        <View style={styles.section}>
          <UiText style={styles.heading}>{t("ledger.settlement")}</UiText>
          <UiText style={styles.secondary}>
            {t(
              data.settlement.balanceMinor < 0
                ? "settlement.youOwe"
                : data.settlement.balanceMinor > 0
                  ? "settlement.youAreOwed"
                  : "settlement.balance",
            )}
          </UiText>
          <MoneyText
            minor={data.settlement.balanceMinor}
            currency={data.settlement.currency}
            scale={data.settlement.scale}
            signed
            variant="headline"
          />
          <UiText style={styles.secondary}>
            {t(
              data.settlement.freshness === "LOCAL_PENDING"
                ? "ledger.changesWaiting"
                : "ledger.savedCalculation",
            )}
          </UiText>
        </View>
      ) : null}
      <View style={styles.actions}>
        <UiButton
          label={t("tripHome.finance.openSpending")}
          variant="secondary"
          onPress={openSpending}
        />
        {lifecycle === "Past" ? (
          <UiButton
            label={t("ledger.settlement")}
            variant="text"
            onPress={() =>
              open({
                pathname: "/expenses/settlement",
                params: { journeyId: journey.journeyId, journeyTitle: journey.title },
              })
            }
          />
        ) : null}
        <UiButton
          label={t("ledger.seeAnalysis")}
          variant="secondary"
          onPress={() =>
            open({
              pathname: "/expenses/analysis",
              params: {
                journeyId: journey.journeyId,
                memberId: data.memberId,
                scope: "MINE",
              },
            })
          }
        />
      </View>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    content: { gap: visual.space.card },
    actions: {
      paddingTop: visual.space.card,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: visual.space.heading,
    },
    section: { gap: visual.space.heading },
    metrics: { gap: visual.space.card, flexDirection: "row", flexWrap: "wrap" },
    metric: { gap: visual.space.heading, minWidth: 0, flexBasis: "45%", flexGrow: 1 },
    recentRow: {
      minHeight: 44,
      gap: visual.space.heading,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
    },
    recentTitle: { flexBasis: "55%", flexGrow: 1 },
    heading: { ...visual.type.eyebrow, color: colors.textSecondary },
    body: { ...visual.type.row, color: colors.textPrimary, flexShrink: 1 },
    secondary: { ...visual.type.meta, color: colors.textSecondary, flexShrink: 1 },
    category: {
      gap: visual.space.heading,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
  });
