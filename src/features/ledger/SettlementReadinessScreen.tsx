import { segmentedControlTokens } from "@/ui/segmented";
import { categoryLabel, systemMessage } from "@/ui/domainLabels";
import { UiButton } from "@/ui/controls";
import { t, formatUiDate } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { MoneyText } from "./MoneyText";
import { SettlementRateAcceptance } from "./SettlementRateAcceptance";
import { ExpenseConflictList } from "./ExpenseConflictList";
import { settlementRateCandidates } from "./settlementRateCandidates";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";
import { router, useFocusEffect } from "expo-router";
import { advanceScrollAnchor, restoredScrollY } from "./settlementScrollAnchor";

import { AppIcon } from "@/components/AppIcon";
import { visual as cv } from "@/ui/visual";
import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import { usePersonalSettlementReview } from "@/hooks/usePersonalSettlementReview";
import { useSettlementSections } from "@/hooks/useSettlementSections";
import { useStage7Settlement } from "@/hooks/useStage7Settlement";
import { useLedgerActiveSync } from "@/hooks/useLedgerActiveSync";
import { getDefaultLedgerPersonalPaymentRepository } from "@/data/repositories/defaultLedgerPersonalPaymentRepository";

import { formatLedgerDate, formatLedgerMoney } from "./format";
import { formatExpenseCount } from "./searchFilters";
import { settlementPositionLabel, shortMemberName } from "./dashboardPresentation";
import { PersonalPaymentSection } from "./PersonalPaymentSection";
import {
  buildSettlementComparison,
  currentSettlementTransfers,
  memberName,
  membersWithActorFirst,
  personalPaymentProgress,
  type SettlementCategory,
  visibleSettlementTransfers,
} from "./settlementSections";
import {
  countSettlementChanges,
  hasSettlementUpdate,
  isSettlementConfirmationRefreshing,
  rememberSettlementExpenseTitles,
} from "./settlementSummaryProjection";

export const settlementSectionNames = ["Summary", "Paid", "Shares", "Payments"] as const;
export type SettlementSectionName = (typeof settlementSectionNames)[number];
type PersonalReviewHook = ReturnType<typeof usePersonalSettlementReview>;
type PersonalReviewCoverage = NonNullable<PersonalReviewHook["state"]>["coverage"];
type PersonalReviewState = Parameters<PersonalReviewHook["setReviewState"]>[0];

const settlementSectionTabs = [
  { icon: "chart.pie.fill", labelKey: "settlement.summary", name: "Summary" },
  { icon: "banknote.fill", labelKey: "settlement.paid", name: "Paid" },
  { icon: "person.2.fill", labelKey: "settlement.shares", name: "Shares" },
  { icon: "arrow.left.arrow.right", labelKey: "settlement.payments", name: "Payments" },
] as const;
const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);
type PageProgress = { position: Animated.Value; offset: Animated.Value };

export function SettlementReadinessScreen({
  activeSection,
  debugMode = false,
  journeyId,
  journeyTitle,
  embedded = false,
  collapseDistance = 0,
  headerHeight = 0,
  viewportHeight = 0,
  sharedHeaderOffset,
  sharedCollapseRef,
  modeTransitionSeq,
  onCollapseChange,
  onSectionChange,
  pageProgress,
  showNavigation = true,
  ledgerChangeSeq,
}: {
  activeSection?: SettlementSectionName;
  debugMode?: boolean;
  journeyId?: string;
  journeyTitle?: string;
  embedded?: boolean;
  collapseDistance?: number;
  headerHeight?: number;
  viewportHeight?: number;
  sharedHeaderOffset?: Animated.Value;
  sharedCollapseRef?: RefObject<number>;
  modeTransitionSeq?: number;
  onCollapseChange?: (collapsed: boolean) => void;
  onSectionChange?: (section: SettlementSectionName) => void;
  pageProgress?: PageProgress;
  showNavigation?: boolean;
  ledgerChangeSeq?: number;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const settlement = useStage7Settlement(journeyId);
  const refreshSettlement = settlement.refresh;
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) refreshSettlement();
      focusedOnce.current = true;
    }, [refreshSettlement]),
  );
  const currentFinal = settlement.lineage.at(-1) ?? settlement.finalized;
  const review = usePersonalSettlementReview(
    settlement.journeyId ?? journeyId,
    currentFinal?.id,
  );
  const projection = settlement.summaryProjection;
  const comparison = buildSettlementComparison({
    currentDigest: settlement.preview?.inputDigest ?? null,
    currentFingerprint: projection?.sourceFingerprint ?? projection?.projectionId ?? null,
    currentFreshness:
      projection?.freshness === "CURRENT" ? "CURRENT_SERVER" : "CURRENT_CACHED",
    projectionAsOf: projection?.sourceAsOf ?? null,
    confirmed: currentFinal,
    hasPendingFinancialOperations: settlement.hasPendingFinancialOperations,
    currentMatchesConfirmed: projection
      ? projection.confirmationDiff.length === 0
      : undefined,
  });
  const displayedFinal = comparison.usesConfirmedSnapshot ? currentFinal : null;
  const sections = useSettlementSections(
    settlement.journeyId,
    settlement.actorMemberId,
    settlement.isOrganizer,
    displayedFinal,
    displayedFinal ? null : settlement.displayPreview,
    embedded ? ledgerChangeSeq : undefined,
  );
  const { updatePayments } = sections;
  const handlePersonalPaymentChange = useCallback(
    async (changedJourneyId: string) => {
      if (changedJourneyId !== (settlement.journeyId ?? journeyId)) return;
      const repository = await getDefaultLedgerPersonalPaymentRepository();
      updatePayments(await repository.listForJourney(changedJourneyId));
    },
    [journeyId, settlement.journeyId, updatePayments],
  );
  useLedgerActiveSync(
    embedded ? null : (settlement.journeyId ?? journeyId ?? null),
    handlePersonalPaymentChange,
    "SETTLEMENT",
  );
  const [localActive, setLocalActive] = useState<SettlementSectionName>("Summary");
  const active = activeSection ?? localActive;
  const pager = useRef<PagerView>(null);
  const pagerIndex = useRef<number>(settlementSectionNames.indexOf(active));
  const activePage = useRef(active);
  const internalCollapse = useRef(0);
  const sharedCollapse = sharedCollapseRef ?? internalCollapse;
  const pageAnchors = useRef(
    Object.fromEntries(
      settlementSectionNames.map((section) => [section, { y: 0, body: 0 }]),
    ) as Record<SettlementSectionName, { y: number; body: number }>,
  );
  const pageScrolls = useRef<Partial<Record<SettlementSectionName, ScrollView | null>>>(
    {},
  );
  const preparePage = useCallback(
    (section: SettlementSectionName) => {
      const scroll = pageScrolls.current[section];
      if (!scroll) return;
      const anchor = pageAnchors.current[section];
      const y = restoredScrollY(sharedCollapse.current, anchor.body);
      if (Math.abs(anchor.y - y) < 1) return;
      anchor.y = y;
      scroll.scrollTo({ y, animated: false });
    },
    [sharedCollapse],
  );
  useEffect(() => {
    if (embedded && modeTransitionSeq) preparePage(active);
  }, [active, embedded, modeTransitionSeq, preparePage]);
  useEffect(() => {
    if (!embedded) return;
    const index = settlementSectionNames.indexOf(active);
    if (pagerIndex.current !== index) {
      preparePage(active);
      pagerIndex.current = index;
      pager.current?.setPage(index);
    }
  }, [active, embedded, preparePage]);
  useEffect(() => {
    if (!embedded || !pageProgress) return;
    pageProgress.position.setValue(pagerIndex.current);
    pageProgress.offset.setValue(0);
  }, [embedded, journeyId, pageProgress]);
  const [everyone, setEveryone] = useState(false);
  const [expandedSpending, setExpandedSpending] = useState<string | null>(null);
  const [expandedShares, setExpandedShares] = useState<string | null>(null);
  const [expandedTransfer, setExpandedTransfer] = useState<string | null>(null);
  const transfers = useMemo(
    () =>
      currentSettlementTransfers(
        displayedFinal,
        settlement.preview,
        settlement.displayPreview,
      ),
    [displayedFinal, settlement.displayPreview, settlement.preview],
  );
  const mineTransfers = visibleSettlementTransfers(
    transfers,
    settlement.actorMemberId,
    false,
    settlement.isOrganizer,
  );
  const visibleTransfers = everyone && settlement.isOrganizer ? transfers : mineTransfers;
  const settlementCurrency =
    displayedFinal?.settlementCurrency ??
    settlement.preview?.settlementCurrency ??
    review.state?.statement.currency ??
    "NZD";
  const settlementScale =
    displayedFinal?.settlementScale ??
    settlement.preview?.settlementScale ??
    review.state?.statement.scale ??
    2;

  if (!settlement.journeyId)
    return <Text style={styles.empty}>{t("settlement.chooseJourney")}</Text>;
  const settledJourneyId = settlement.journeyId;

  const changeSection = (section: SettlementSectionName) => {
    if (activeSection === undefined) setLocalActive(section);
    onSectionChange?.(section);
  };

  const content = (section: SettlementSectionName) => (
    <View
      key={projection?.projectionId ?? comparison.comparisonId}
      style={[styles.sections, !embedded && styles.standaloneSections]}
    >
      {section === "Summary" ? (
        <SummarySection
          expenses={sections.expenses}
          journeyTitle={journeyTitle}
          reviewCount={sections.reviewCount}
          review={review}
          settlement={settlement}
          debugMode={debugMode}
        />
      ) : section === "Paid" ? (
        <ExpenseSection
          actorMemberId={settlement.actorMemberId}
          categories={sections.spendingCategories}
          currency={settlementCurrency}
          empty={t("settlement.noPaid")}
          expanded={expandedSpending}
          journeyId={settledJourneyId}
          key="Paid"
          historicalSnapshot={Boolean(displayedFinal)}
          memberId={sections.spendingMemberId}
          members={sections.members}
          onExpand={setExpandedSpending}
          onMember={sections.setSpendingMemberId}
          organizer={settlement.isOrganizer}
          scale={settlementScale}
          totalLabel={t("search.paidByName", {
            name:
              sections.spendingMemberId === settlement.actorMemberId
                ? t("common.me")
                : memberName(sections.members, sections.spendingMemberId),
          })}
        />
      ) : section === "Shares" ? (
        <ExpenseSection
          actorMemberId={settlement.actorMemberId}
          categories={sections.shareCategories}
          currency={settlementCurrency}
          empty={t("settlement.noShares")}
          expanded={expandedShares}
          journeyId={settledJourneyId}
          key="Shares"
          historicalSnapshot={Boolean(displayedFinal)}
          memberId={sections.sharesMemberId}
          members={sections.members}
          onExpand={setExpandedShares}
          onMember={sections.setSharesMemberId}
          organizer={settlement.isOrganizer}
          scale={settlementScale}
          shares
          totalLabel={
            sections.sharesMemberId === settlement.actorMemberId
              ? t("settlement.myShare")
              : t("settlement.memberShare", {
                  name: memberName(sections.members, sections.sharesMemberId),
                })
          }
        />
      ) : (
        <PaymentsSection
          actorMemberId={settlement.actorMemberId}
          currency={settlementCurrency}
          everyone={everyone}
          expandedTransfer={expandedTransfer}
          fxSnapshots={sections.fxSnapshots}
          journeyId={settledJourneyId}
          members={sections.members}
          onEveryone={setEveryone}
          onExpandTransfer={setExpandedTransfer}
          onPaymentsChanged={sections.updatePayments}
          payments={sections.payments}
          scale={settlementScale}
          showScopeToggle={
            settlement.isOrganizer && mineTransfers.length < transfers.length
          }
          transfers={visibleTransfers}
        />
      )}
      {sections.loading ? (
        <ActivityIndicator accessibilityLabel={t("settlement.loading")} />
      ) : null}
      {debugMode && sections.message ? (
        <Text style={styles.message}>{sections.message}</Text>
      ) : null}
    </View>
  );

  if (embedded)
    return (
      <View style={styles.embedded}>
        {showNavigation ? (
          <SettlementSectionTabs
            active={active}
            onChange={changeSection}
            progress={pageProgress}
          />
        ) : null}
        <AnimatedPagerView
          initialPage={settlementSectionNames.indexOf(active)}
          onPageScroll={
            pageProgress
              ? Animated.event(
                  [
                    {
                      nativeEvent: {
                        position: pageProgress.position,
                        offset: pageProgress.offset,
                      },
                    },
                  ],
                  { useNativeDriver: true },
                )
              : undefined
          }
          onPageScrollStateChanged={(event) => {
            if (event.nativeEvent.pageScrollState !== "dragging") return;
            const index = settlementSectionNames.indexOf(activePage.current);
            const before = settlementSectionNames[index - 1];
            const after = settlementSectionNames[index + 1];
            if (before) preparePage(before);
            if (after) preparePage(after);
          }}
          onPageSelected={(event) => {
            const index = event.nativeEvent.position;
            pagerIndex.current = index;
            const section = settlementSectionNames[index];
            if (!section) return;
            preparePage(section);
            activePage.current = section;
            if (section !== active) changeSection(section);
          }}
          overdrag={false}
          ref={pager}
          style={styles.pager}
        >
          {settlementSectionNames.map((section) => (
            <View collapsable={false} key={section} style={styles.pagerPage}>
              <ScrollView
                contentInsetAdjustmentBehavior="never"
                contentContainerStyle={{
                  minHeight: viewportHeight + collapseDistance,
                  paddingBottom: 40,
                  paddingHorizontal: 16,
                  paddingTop: headerHeight,
                }}
                directionalLockEnabled
                onScroll={(event) => {
                  const y = Math.max(0, event.nativeEvent.contentOffset.y);
                  const anchor = pageAnchors.current[section];
                  const delta = y - anchor.y;
                  anchor.y = y;
                  if (activePage.current !== section || Math.abs(delta) < 0.5) return;
                  const next = advanceScrollAnchor(
                    { collapse: sharedCollapse.current, body: anchor.body },
                    delta,
                    collapseDistance,
                  );
                  anchor.body = next.body;
                  sharedCollapse.current = next.collapse;
                  sharedHeaderOffset?.setValue(next.collapse);
                  onCollapseChange?.(next.collapse >= collapseDistance - 1);
                }}
                ref={(node) => {
                  pageScrolls.current[section] = node;
                }}
                scrollEventThrottle={16}
                style={styles.pagerPage}
              >
                {content(section)}
              </ScrollView>
            </View>
          ))}
        </AnimatedPagerView>
      </View>
    );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      stickyHeaderIndices={showNavigation ? [0] : undefined}
    >
      {showNavigation ? (
        <SettlementSectionTabs active={active} onChange={changeSection} />
      ) : null}
      {content(active)}
    </ScrollView>
  );
}

export function SettlementSectionTabs({
  active,
  onChange,
  progress,
}: {
  active: SettlementSectionName;
  onChange: (section: SettlementSectionName) => void;
  progress?: PageProgress;
}) {
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  useUiLocale();
  const [width, setWidth] = useState(0);
  const page = progress ? Animated.add(progress.position, progress.offset) : null;
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={styles.nav}
    >
      {settlementSectionTabs.map(({ icon, labelKey, name }, index) => (
        <Pressable
          accessibilityLabel={t(labelKey)}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === name }}
          key={name}
          onPress={() => onChange(name)}
          style={[
            styles.navItem,
            active === name && styles.navItemSelected,
            !progress && active === name && styles.navItemActive,
          ]}
        >
          <AppIcon
            color={
              active === name
                ? segmentedControlTokens(colors).selectedLabel
                : segmentedControlTokens(colors).label
            }
            name={icon}
            size={19}
          />
          {page ? (
            <View style={styles.navLabel}>
              <Text
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.35}
                minimumFontScale={0.8}
                numberOfLines={1}
                style={styles.navText}
              >
                {t(labelKey)}
              </Text>
              <Animated.Text
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.35}
                minimumFontScale={0.8}
                numberOfLines={1}
                pointerEvents="none"
                style={[
                  styles.navText,
                  styles.navTextOverlay,
                  {
                    opacity: Animated.subtract(page, index).interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: [0, 1, 0],
                      extrapolate: "clamp",
                    }),
                  },
                ]}
              >
                {t(labelKey)}
              </Animated.Text>
            </View>
          ) : (
            <Text
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.35}
              minimumFontScale={0.8}
              numberOfLines={1}
              style={[styles.navText, active === name && styles.navTextActive]}
            >
              {t(labelKey)}
            </Text>
          )}
        </Pressable>
      ))}
      {page && width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.navIndicator,
            {
              width: width / settlementSectionNames.length,
              transform: [
                {
                  translateX: Animated.multiply(
                    page,
                    width / settlementSectionNames.length,
                  ),
                },
              ],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

function SummarySection({
  debugMode,
  expenses,
  journeyTitle,
  reviewCount,
  review,
  settlement,
}: {
  debugMode: boolean;
  expenses: ReturnType<typeof useSettlementSections>["expenses"];
  journeyTitle?: string;
  reviewCount: number;
  review: ReturnType<typeof usePersonalSettlementReview>;
  settlement: ReturnType<typeof useStage7Settlement>;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const projection = settlement.summaryProjection;
  const confirmationRefreshing = settlement.journeyId
    ? isSettlementConfirmationRefreshing(settlement.journeyId, projection)
    : false;
  const [rateDetailsOpen, setRateDetailsOpen] = useState(false);
  const [reviewCoverageOpen, setReviewCoverageOpen] = useState(false);
  const hasConfirmed = Boolean(projection?.confirmedSettlement);
  const balanceMinor = projection?.balanceMinor;
  const currency = projection?.currency ?? "NZD";
  const scale = projection?.scale ?? 2;
  const paidMinor = projection?.paidMinor;
  const shareMinor = projection?.shareMinor;
  const automaticWaiting = settlement.pendingPublicationExpenseIds.size;
  const unavailableRates = settlement.unavailableExpenseIds.size;
  const conflicts = settlement.preview?.blockers.filter(
    (blocker) => blocker.reason === "OPEN_CONFLICT",
  ).length;
  const expenseFor = (id: string) =>
    expenses.find((expense) => expense.id === id || expense.serverId === id);
  const rateIssues = (settlement.displayPreview?.inputs ?? [])
    .filter((input) => input.expense.status === "RATE_REQUIRED")
    .map(({ expense }) => ({
      id: expense.id,
      title: expense.title,
      missingDate: !expense.economicDate,
      reason: !expense.economicDate
        ? t("extra.copy17")
        : settlement.pendingPublicationExpenseIds.has(expense.serverId ?? expense.id)
          ? t("extra.copy18")
          : settlement.unavailableExpenseIds.has(expense.serverId ?? expense.id)
            ? t("extra.copy19")
            : t("extra.copy20"),
    }));
  const changeCounts = countSettlementChanges(projection?.confirmationDiff ?? []);
  const confirmedBalance = projection?.confirmedSettlement;
  const confirm = () => {
    if (
      settlement.updating ||
      settlement.hasPendingFinancialOperations ||
      settlement.preview?.state !== "PREVIEW_READY"
    )
      return;
    Alert.alert(t("settlement.confirmQuestion"), t("settlement.confirmExplanation"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settlement.confirmAmounts"),
        onPress: () => void settlement.finalize(settlement.preview!),
      },
    ]);
  };
  return (
    <View style={styles.section}>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.sectionLeadText}>
          {t("settlement.balanceHeading")}
        </Text>
        <Text style={styles.heroLabel}>
          {balanceMinor === undefined
            ? t("settlement.preparingBalance")
            : settlementPositionLabel(balanceMinor)}
        </Text>
        <View style={styles.heroAmountRow}>
          <MoneyText
            variant="hero"
            style={styles.heroAmount}
            minor={balanceMinor === undefined ? null : Math.abs(balanceMinor)}
            currency={currency}
            scale={scale}
          />
          {projection && rateIssues.length ? (
            <Pressable
              accessibilityHint={t("settlement.convertedHint")}
              accessibilityLabel={t("settlement.amountsMayChange")}
              accessibilityRole="button"
              onPress={() => setRateDetailsOpen((open) => !open)}
              style={styles.estimateIndicatorButton}
            >
              <View style={styles.estimateIndicator} />
            </Pressable>
          ) : null}
        </View>
        {confirmationRefreshing ? (
          <Text style={styles.meta}>{t("settlement.refreshingConfirmed")}</Text>
        ) : projection && (debugMode || projection.freshness !== "CURRENT") ? (
          <Text style={styles.meta}>
            {projection.freshness === "LOCAL_PENDING"
              ? t("settlement.localPending")
              : projection.freshness === "SAVED"
                ? t("ledger.savedCalculation")
                : t("settlement.serverCalculation")}
          </Text>
        ) : null}
        {rateDetailsOpen && rateIssues.length ? (
          <View style={styles.rateDetails}>
            <Text style={styles.rowTitle}>{t("settlement.convertedMayChange")}</Text>
            {rateIssues.map((issue) => (
              <Pressable
                accessibilityRole="button"
                key={issue.id}
                onPress={() => {
                  const expenseId = expenseFor(issue.id)?.id ?? issue.id;
                  if (issue.missingDate)
                    router.push({
                      pathname: "/expenses/confirm-date",
                      params: { expenseId },
                    } as never);
                  else router.push(`/expenses/expense/${expenseId}`);
                }}
                style={styles.rateIssue}
              >
                <View style={styles.grow}>
                  <Text style={styles.rowTitle}>{issue.title}</Text>
                  <Text style={styles.meta}>{systemMessage(issue.reason)}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {paidMinor !== undefined &&
      shareMinor !== undefined &&
      balanceMinor !== undefined ? (
        <View style={styles.summaryBlock}>
          <Text accessibilityRole="header" style={styles.summaryHeading}>
            {t("settlement.breakdown")}
          </Text>
          <View style={styles.card}>
            <MoneyLine
              label={t("settlement.paidForGroup")}
              minor={paidMinor}
              currency={currency}
              scale={scale}
            />
            <MoneyLine
              label={t("settlement.yourShare")}
              minor={shareMinor}
              currency={currency}
              scale={scale}
            />
            <View style={styles.divider} />
            <MoneyLine
              emphasized
              label={t("settlement.balance")}
              minor={balanceMinor}
              currency={currency}
              scale={scale}
              signed
            />
          </View>
        </View>
      ) : null}
      {hasSettlementUpdate(projection) ? (
        <View style={styles.summaryBlock}>
          <Text accessibilityRole="header" style={styles.summaryHeading}>
            {t("settlement.sinceConfirmation")}
          </Text>
          <View style={styles.card}>
            <Text style={styles.body}>
              {(["ADDED", "CHANGED", "REMOVED"] as const)
                .filter((change) => changeCounts[change])
                .map((change) =>
                  t(
                    change === "ADDED"
                      ? "settlement.addedCount"
                      : change === "REMOVED"
                        ? "settlement.removedCount"
                        : "settlement.changedCount",
                    { count: changeCounts[change] },
                  ),
                )
                .join(" · ")}
            </Text>
            {balanceMinor !== undefined && confirmedBalance ? (
              <>
                <View style={styles.divider} />
                <MoneyLine
                  emphasized
                  label={t("settlement.balanceChange")}
                  minor={balanceMinor - confirmedBalance.balanceMinor}
                  currency={currency}
                  scale={scale}
                  signed
                />
              </>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (settlement.journeyId)
                  rememberSettlementExpenseTitles(settlement.journeyId, expenses);
                router.push({
                  pathname: "/expenses/settlement-update",
                  params: { journeyId: settlement.journeyId, journeyTitle },
                } as never);
              }}
              style={styles.summaryLink}
            >
              <Text style={styles.link}>{t("expense.reviewChangesLink")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {hasConfirmed && confirmedBalance ? (
        <View style={styles.summaryBlock}>
          <Text accessibilityRole="header" style={styles.summaryHeading}>
            {t("settlement.lastConfirmed")}
          </Text>
          <View style={styles.card}>
            <MoneyText
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.35}
              minimumFontScale={0.6}
              numberOfLines={1}
              style={styles.confirmedAmount}
              variant="headline"
              minor={Math.abs(confirmedBalance.balanceMinor)}
              currency={currency}
              scale={scale}
            />
            <Text style={styles.meta}>
              {formatUiDate(new Date(confirmedBalance.finalizedAt))}
              {t("settlement.snapshotVersion", {
                version: confirmedBalance.lineageSequence + 1,
              })}
            </Text>
            <View style={styles.summaryLinks}>
              {settlement.isOrganizer ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/expenses/settlement-adjustment",
                      params: { journeyId: settlement.journeyId },
                    } as never)
                  }
                  style={styles.summaryLink}
                >
                  <Text style={styles.link}>{t("settlement.correctLink")}</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/expenses/settlement-statement",
                    params: {
                      journeyId: settlement.journeyId,
                    },
                  } as never)
                }
                style={styles.summaryLink}
              >
                <Text style={styles.link}>{t("settlement.historyLink")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
      {review.state ? (
        <GroupReviewStatus
          actorMemberId={settlement.actorMemberId}
          busy={review.busy || !review.ready}
          coverage={review.state.coverage}
          expanded={reviewCoverageOpen}
          onExpand={() => setReviewCoverageOpen((open) => !open)}
          onSelect={(state) => void review.setReviewState(state)}
          pendingReviewState={review.state.pendingReviewState}
        />
      ) : null}
      {review.busy ? (
        <Text style={styles.meta}>{t("settlement.savingReview")}</Text>
      ) : null}
      {review.message ? (
        <Text style={styles.message}>{systemMessage(review.message)}</Text>
      ) : null}
      {review.state?.lastErrorCode ? (
        <Text style={styles.message}>{t("settlement.reviewNotSaved")}</Text>
      ) : null}
      {review.state?.checkpoint?.reviewState === "LOOKS_GOOD" &&
      review.state.coverage.find((member) => member.memberId === settlement.actorMemberId)
        ?.reviewState === "STILL_CHECKING" &&
      !review.state.pendingReviewState ? (
        <Text style={styles.meta}>{t("settlement.changedSinceReview")}</Text>
      ) : null}
      {reviewCount ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/expenses/review",
              params: { journeyId: settlement.journeyId, journeyTitle },
            } as never)
          }
          style={styles.notice}
        >
          <Text style={styles.noticeTitle}>{t("ledger.needsAttention")}</Text>
          <Text style={styles.body}>
            {t("settlement.attentionCount", { count: reviewCount })}
          </Text>
          <Text style={styles.link}>
            {t("common.review")}
            {t("settlement.reviewItems", { count: reviewCount })}
          </Text>
        </Pressable>
      ) : null}
      {settlement.isOrganizer && !hasConfirmed ? (
        <SettlementRateAcceptance
          journeyId={settlement.journeyId ?? null}
          rates={settlementRateCandidates(
            settlement.displayPreview?.inputs.map((input) => input.expense) ?? [],
            settlement.displayPreview?.estimates ?? new Map(),
          )}
          onAccepted={settlement.refresh}
        />
      ) : null}
      {unavailableRates ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{t("settlement.ratesAttention")}</Text>
          {[...settlement.unavailableExpenseIds].map((id) => (
            <Pressable
              accessibilityRole="button"
              key={id}
              onPress={() => router.push(`/expenses/expense/${expenseFor(id)?.id ?? id}`)}
              style={styles.rateIssue}
            >
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>
                  {expenseFor(id)?.title ?? t("common.expense")}
                </Text>
                <Text style={styles.body}>{t("settlement.rateUnavailable")}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <ExpenseConflictList
        journeyId={settlement.journeyId ?? undefined}
        title={t("settlement.reviewBefore")}
      />
      {conflicts ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{t("settlement.valuesAttention")}</Text>
          <Text style={styles.body}>
            {t("settlement.changesNeedReview", { count: conflicts })}
          </Text>
          {settlement.preview?.blockers
            .filter((b) => b.reason === "OPEN_CONFLICT")
            .map((blocker) => (
              <Pressable
                key={blocker.expenseId}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/expenses/conflict/[id]",
                    params: {
                      id: expenseFor(blocker.expenseId)?.id ?? blocker.expenseId,
                    },
                  } as never)
                }
              >
                <Text style={styles.link}>
                  {expenseFor(blocker.expenseId)?.title ?? t("common.expense")}
                  {t("settlement.snapshotReview")}
                </Text>
              </Pressable>
            ))}
        </View>
      ) : null}
      {settlement.hasPendingFinancialOperations ? (
        <Text style={styles.message}>{t("settlement.waitingConfirmation")}</Text>
      ) : null}
      {debugMode && automaticWaiting ? (
        <Text style={styles.meta}>
          {t("settlement.waitingRates", { count: automaticWaiting })}
        </Text>
      ) : null}
      {debugMode && settlement.message ? (
        <Text style={styles.message}>{settlement.message}</Text>
      ) : null}
      {debugMode && settlement.refreshDiagnostic ? (
        <Text style={styles.meta}>
          {t("settlement.refreshDiagnostic")}
          {settlement.refreshDiagnostic}
        </Text>
      ) : null}
      {debugMode && settlement.updating ? (
        <Text style={styles.meta}>{t("common.updating")}</Text>
      ) : null}
      {settlement.isOrganizer &&
      !hasConfirmed &&
      !settlement.updating &&
      !settlement.hasPendingFinancialOperations &&
      settlement.preview?.state === "PREVIEW_READY" ? (
        <UiButton
          variant="primary"
          label={t("settlement.confirmAmounts")}
          onPress={confirm}
        />
      ) : settlement.isOrganizer && !hasConfirmed ? (
        <UiButton
          variant="text"
          label={t("settlement.checkReadiness")}
          onPress={() => void settlement.prepare()}
        />
      ) : null}
    </View>
  );
}

function ExpenseSection({
  actorMemberId,
  categories,
  currency,
  empty,
  expanded,
  historicalSnapshot,
  journeyId,
  memberId,
  members,
  onExpand,
  onMember,
  organizer,
  scale,
  shares = false,
  totalLabel,
}: {
  actorMemberId: string | null;
  categories: SettlementCategory[];
  currency: string;
  empty: string;
  expanded: string | null;
  historicalSnapshot: boolean;
  journeyId: string;
  memberId: string | null;
  members: { id: string; label: string }[];
  onExpand: (value: string | null) => void;
  onMember: (value: string) => void;
  organizer: boolean;
  scale: number;
  shares?: boolean;
  totalLabel: string;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const orderedMembers = membersWithActorFirst(members, actorMemberId);
  const selectedMember = orderedMembers.find((member) => member.id === memberId);
  const total = categories.reduce((sum, category) => sum + category.totalMinor, 0);
  const openExpenseSearch = (category?: string) =>
    router.push({
      pathname: "/expenses/search",
      params: {
        journeyId,
        memberId: memberId ?? "",
        ...(category ? { category } : {}),
        ...(shares
          ? { selectedMemberId: memberId ?? "", shareOnly: "1" }
          : { paidMemberId: memberId ?? "", authoritative: "1" }),
        ...(historicalSnapshot ? { origin: t("extra.copy16") } : {}),
      },
    } as never);
  const selectedName = shortMemberName(selectedMember?.label ?? t("common.traveller"));
  const actionLabel = shares
    ? memberId === actorMemberId
      ? t("settlement.allMyShares")
      : t("settlement.allMemberShares", { name: selectedName })
    : memberId === actorMemberId
      ? t("settlement.allMyPaid")
      : t("settlement.allMemberPaid", { name: selectedName });
  return (
    <View style={styles.section}>
      <View style={styles.hero}>
        <View style={styles.sectionLeadRow}>
          <Text
            accessibilityRole="header"
            style={[styles.sectionLeadText, styles.sectionLeadGrow]}
          >
            {totalLabel.toUpperCase()}
          </Text>
          {organizer ? (
            <Pressable
              accessibilityLabel={t("settlement.selectedMember", {
                name:
                  memberId === actorMemberId
                    ? t("common.me")
                    : (selectedMember?.label ?? t("common.traveller")),
              })}
              accessibilityRole="button"
              accessibilityState={{ expanded: pickerOpen }}
              onPress={() => setPickerOpen((open) => !open)}
              style={styles.memberPickerButton}
            >
              <Text numberOfLines={1} style={styles.memberPickerButtonText}>
                {memberId === actorMemberId
                  ? t("common.me")
                  : shortMemberName(selectedMember?.label ?? t("common.traveller"))}
              </Text>
              <Text style={styles.memberPickerChevron}>{pickerOpen ? "⌃" : "⌄"}</Text>
            </Pressable>
          ) : null}
        </View>
        {organizer && pickerOpen ? (
          <View style={styles.memberMenu}>
            {orderedMembers.map((member) => {
              const selected = member.id === memberId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={member.id}
                  onPress={() => {
                    onMember(member.id);
                    setPickerOpen(false);
                  }}
                  style={styles.memberMenuItem}
                >
                  <Text style={[styles.memberMenuText, selected && styles.bold]}>
                    {member.id === actorMemberId ? t("common.me") : member.label}
                  </Text>
                  {selected ? <Text style={styles.memberMenuCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <MoneyText
          variant="hero"
          style={styles.heroAmount}
          minor={total}
          currency={currency}
          scale={scale}
        />
      </View>
      {categories.map((category) => {
        const open = expanded === category.key;
        const preview = open
          ? [...category.rows]
              .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
              .slice(0, 3)
          : [];
        return (
          <View key={category.key} style={styles.category}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => onExpand(open ? null : category.key)}
              style={[styles.categoryHeader, styles.compactCategoryHeader]}
            >
              <View style={styles.categoryLine}>
                <Text numberOfLines={2} style={[styles.rowTitle, styles.grow]}>
                  {categoryLabel(category.label)}
                </Text>
                <MoneyText
                  style={styles.rowAmount}
                  variant="standard"
                  minor={category.totalMinor}
                  currency={currency}
                  scale={scale}
                />
              </View>
              <View style={styles.categoryLine}>
                <Text style={styles.meta}>
                  {formatExpenseCount(category.rows.length)}
                </Text>
                <AppIcon
                  color={colors.textSecondary}
                  name={open ? "chevron.up" : "chevron.down"}
                  size={14}
                />
              </View>
            </Pressable>
            {open ? (
              <View style={[styles.expandedBody, styles.compactExpandedBody]}>
                <Text style={styles.recentHeading}>{t("settlement.recentExpenses")}</Text>
                {preview.map((row, index) => (
                  <Pressable
                    accessibilityHint={t("settlement.opensExpense")}
                    accessibilityRole="button"
                    key={row.id}
                    onPress={() => router.push(`/expenses/expense/${row.id}`)}
                    style={[
                      styles.expenseRow,
                      styles.compactExpenseRow,
                      index === preview.length - 1 && styles.lastExpenseRow,
                    ]}
                  >
                    <View style={styles.grow}>
                      <View style={styles.categoryLine}>
                        <Text numberOfLines={2} style={[styles.rowTitle, styles.grow]}>
                          {row.title}
                        </Text>
                        <MoneyText
                          style={styles.compactAmount}
                          variant="compact"
                          minor={row.componentMinor ?? 0}
                          currency={row.settlementCurrency}
                          scale={row.settlementScale}
                        />
                      </View>
                      <View style={styles.categoryLine}>
                        <Text numberOfLines={1} style={[styles.meta, styles.grow]}>
                          {t("analysis.originalTotal", {
                            date: formatLedgerDate(row.occurredAt),
                            amount: formatLedgerMoney(
                              row.originalMinor,
                              row.originalCurrency,
                              row.originalScale,
                            ),
                          })}
                        </Text>
                        <Text style={styles.meta}>
                          {shares
                            ? memberId === actorMemberId
                              ? t("common.you")
                              : selectedName
                            : memberId === actorMemberId
                              ? t("settlement.youPaid")
                              : t("settlement.memberPaid", { name: selectedName })}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openExpenseSearch(category.key)}
                  style={styles.categoryLink}
                >
                  <Text style={styles.categoryLinkText}>
                    {historicalSnapshot
                      ? t("settlement.viewCategory", {
                          category: categoryLabel(category.label),
                        })
                      : t("settlement.viewAll", {
                          count: formatExpenseCount(category.rows.length).toLowerCase(),
                        })}
                  </Text>
                  <AppIcon name="chevron.right" size={14} color={colors.accent} />
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
      {!categories.length ? <Text style={styles.empty}>{empty}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => openExpenseSearch()}
        style={styles.compactAllLink}
      >
        <Text style={styles.categoryLinkText}>{actionLabel}</Text>
        <AppIcon name="chevron.right" size={14} color={colors.accent} />
      </Pressable>
    </View>
  );
}

function PaymentsSection({
  actorMemberId,
  currency,
  everyone,
  expandedTransfer,
  fxSnapshots,
  journeyId,
  members,
  onEveryone,
  onExpandTransfer,
  onPaymentsChanged,
  payments,
  scale,
  showScopeToggle,
  transfers,
}: {
  actorMemberId: string | null;
  currency: string;
  everyone: boolean;
  expandedTransfer: string | null;
  fxSnapshots: ReturnType<typeof useSettlementSections>["fxSnapshots"];
  journeyId: string;
  members: { id: string; label: string }[];
  onEveryone: (value: boolean) => void;
  onExpandTransfer: (value: string | null) => void;
  onPaymentsChanged: (records: LocalPersonalPayment[]) => void;
  payments: LocalPersonalPayment[];
  scale: number;
  showScopeToggle: boolean;
  transfers: ReturnType<typeof currentSettlementTransfers>;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const [estimateDetail, setEstimateDetail] = useState<string | null>(null);
  return (
    <View style={styles.section}>
      <View style={styles.transferHeading}>
        <Text accessibilityRole="header" style={styles.transferHeadingText}>
          {t("settlement.recommended")}
        </Text>
        {showScopeToggle ? <Toggle everyone={everyone} onChange={onEveryone} /> : null}
      </View>
      {transfers.map((transfer, index) => {
        const key =
          transfer.id ?? `${transfer.fromMemberId}-${transfer.toMemberId}-${index}`;
        const open = expandedTransfer === key;
        const from = memberName(members, transfer.fromMemberId);
        const to = memberName(members, transfer.toMemberId);
        const related =
          transfer.fromMemberId === actorMemberId ||
          transfer.toMemberId === actorMemberId;
        const progress = related
          ? personalPaymentProgress(payments, actorMemberId, transfer, fxSnapshots)
          : null;
        return (
          <View key={key} style={styles.transferCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: !related,
                expanded: related ? open : undefined,
              }}
              disabled={!related}
              onPress={() => onExpandTransfer(open ? null : key)}
              style={styles.transferRow}
            >
              <Text numberOfLines={2} style={styles.transferMember}>
                {transfer.fromMemberId === actorMemberId ? t("common.you") : from}
              </Text>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.transferAmountBlock}>
                <MoneyText
                  style={styles.transferAmount}
                  variant="standard"
                  minor={transfer.amount.minor}
                  currency={currency}
                  scale={scale}
                />
                {progress && (progress.minor || progress.provisional.length) ? (
                  <View style={styles.transferProgressRow}>
                    <Text style={styles.transferProgress}>
                      {progress.direction === "PAID"
                        ? t("settlement.paid")
                        : t("settlement.received")}{" "}
                      {formatLedgerMoney(progress.minor, currency, scale)} ·{" "}
                      {progress.percentage}%
                    </Text>
                    {progress.provisional.length ? (
                      <Pressable
                        accessibilityHint={t("settlement.provisionalHint")}
                        accessibilityLabel={t("settlement.paymentMayChange")}
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={(event) => {
                          event.stopPropagation();
                          setEstimateDetail(estimateDetail === key ? null : key);
                        }}
                        style={styles.fxDotButton}
                      >
                        <View style={styles.fxDot} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <Text style={styles.arrow}>→</Text>
              <Text numberOfLines={2} style={[styles.transferMember, styles.alignRight]}>
                {transfer.toMemberId === actorMemberId ? t("common.you") : to}
              </Text>
              {related ? (
                <AppIcon
                  color={colors.textSecondary}
                  name={open ? "chevron.up" : "chevron.down"}
                  size={14}
                />
              ) : null}
            </Pressable>
            {progress && (progress.minor || progress.provisional.length) ? (
              <View style={styles.transferProgressTrack}>
                <View
                  style={[
                    styles.transferProgressFill,
                    { width: `${progress.percentage}%` },
                  ]}
                />
              </View>
            ) : null}
            {estimateDetail === key && progress?.provisional.length ? (
              <View style={styles.fxDetail}>
                <Text style={styles.fxDetailTitle}>
                  {t("settlement.changingAmounts")}
                </Text>
                {progress.provisional.map((item) => (
                  <Text key={item.recordId} style={styles.fxDetailText}>
                    {formatLedgerMoney(
                      item.original.minor,
                      item.original.currency,
                      item.original.scale,
                    )}{" "}
                    →{" "}
                    {formatLedgerMoney(
                      item.equivalent.minor,
                      item.equivalent.currency,
                      item.equivalent.scale,
                    )}
                    {" · "}
                    {paymentEstimateLabel(item.match, item.referenceDate)}
                  </Text>
                ))}
              </View>
            ) : null}
            {open && related ? (
              <PersonalPaymentSection
                actorMemberId={actorMemberId}
                from={{ id: transfer.fromMemberId, name: from }}
                journeyId={journeyId}
                onChanged={onPaymentsChanged}
                settlementCurrency={currency}
                to={{ id: transfer.toMemberId, name: to }}
              />
            ) : null}
          </View>
        );
      })}
      {!transfers.length ? (
        <Text style={styles.empty}>{t("settlement.noTransfers")}</Text>
      ) : null}
    </View>
  );
}

function paymentEstimateLabel(
  match: "EXACT_DATE" | "PREVIOUS_WORKING_DAY" | "STALE_DATE" | "ROUGH_LATEST",
  referenceDate: string,
) {
  if (match === "EXACT_DATE") return `ECB rate for ${referenceDate}`;
  if (match === "PREVIOUS_WORKING_DAY")
    return `previous working-day ECB rate (${referenceDate})`;
  if (match === "STALE_DATE") return `older ECB rate (${referenceDate})`;
  return `latest available ECB rate (${referenceDate})`;
}

function Toggle({
  everyone,
  onChange,
}: {
  everyone: boolean;
  onChange: (value: boolean) => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.toggle}>
      {[false, true].map((value) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: everyone === value }}
          key={String(value)}
          onPress={() => onChange(value)}
          style={[styles.toggleItem, everyone === value && styles.toggleActive]}
        >
          <Text
            style={[styles.toggleText, everyone === value && styles.toggleTextActive]}
          >
            {value ? t("settlement.everyone") : t("ledger.mine")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function GroupReviewStatus({
  actorMemberId,
  busy,
  coverage,
  expanded,
  onExpand,
  onSelect,
  pendingReviewState,
}: {
  actorMemberId: string | null;
  busy: boolean;
  coverage: PersonalReviewCoverage;
  expanded: boolean;
  onExpand: () => void;
  onSelect: (state: PersonalReviewState) => void;
  pendingReviewState: PersonalReviewState | null;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const current =
    pendingReviewState ??
    coverage.find((member) => member.memberId === actorMemberId)?.reviewState ??
    "NOT_REVIEWED";
  const counts = {
    LOOKS_GOOD: coverage.filter((member) => member.reviewState === "LOOKS_GOOD").length,
    STILL_CHECKING: coverage.filter((member) => member.reviewState === "STILL_CHECKING")
      .length,
    NOT_REVIEWED: coverage.filter((member) => member.reviewState === "NOT_REVIEWED")
      .length,
  };
  return (
    <View style={styles.summaryBlock}>
      <Text accessibilityRole="header" style={styles.summaryHeading}>
        {t("settlement.groupReview")}
      </Text>
      <View style={styles.card}>
        <View style={styles.reviewCounts}>
          {(
            [
              ["LOOKS_GOOD", t("settlement.looksGood")],
              ["STILL_CHECKING", t("settlement.stillChecking")],
              ["NOT_REVIEWED", t("settlement.notReviewed")],
            ] as const
          ).map(([state, label]) => (
            <View key={state} style={styles.reviewCount}>
              <Text style={styles.reviewCountValue}>{counts[state]}</Text>
              <Text style={styles.meta}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.reviewControls}>
          {(["LOOKS_GOOD", "STILL_CHECKING"] as const).map((state) => {
            const selected = current === state;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, selected }}
                disabled={busy || selected}
                key={state}
                onPress={() => onSelect(state)}
                style={[
                  styles.reviewControl,
                  selected &&
                    (state === "LOOKS_GOOD"
                      ? styles.reviewControlGood
                      : styles.reviewControlChecking),
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.reviewControlText, selected && styles.bold]}
                >
                  {state === "LOOKS_GOOD"
                    ? t("settlement.looksGood")
                    : t("settlement.stillChecking")}
                </Text>
              </Pressable>
            );
          })}
          {current === "NOT_REVIEWED" ? (
            <View
              accessibilityRole="button"
              accessibilityState={{ disabled: true, selected: true }}
              style={[styles.reviewControl, styles.reviewControlNeutral]}
            >
              <Text numberOfLines={1} style={[styles.reviewControlText, styles.bold]}>
                {t("settlement.notReviewed")}
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={onExpand}
          style={styles.summaryLink}
        >
          <Text style={styles.link}>
            {expanded ? t("settlement.hideStatus") : t("settlement.viewStatus")}
          </Text>
        </Pressable>
        {expanded ? (
          <View style={styles.reviewMembers}>
            {coverage.map((member) => (
              <View key={member.memberId} style={styles.reviewMemberRow}>
                <Text style={styles.body}>
                  {member.displayName}
                  {member.memberId === actorMemberId ? t("settlement.youSuffix") : ""}
                </Text>
                <Text
                  style={[
                    styles.reviewTag,
                    member.reviewState === "LOOKS_GOOD"
                      ? styles.reviewTagGood
                      : member.reviewState === "STILL_CHECKING"
                        ? styles.reviewTagChecking
                        : styles.reviewTagNeutral,
                  ]}
                >
                  {reviewStateLabel(member.reviewState)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function reviewStateLabel(state: PersonalReviewCoverage[number]["reviewState"]) {
  return state === "LOOKS_GOOD"
    ? t("settlement.looksGood")
    : state === "STILL_CHECKING"
      ? t("settlement.stillChecking")
      : t("settlement.notReviewed");
}

function MoneyLine({
  label,
  minor,
  currency,
  scale,
  emphasized = false,
  signed = false,
}: {
  label: string;
  minor: number;
  currency: string;
  scale: number;
  emphasized?: boolean;
  signed?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const largeText = useWindowDimensions().fontScale > 1.5;
  return (
    <View style={[styles.moneyLine, largeText && styles.moneyLineLarge]}>
      <Text style={[styles.moneyLineLabel, emphasized && styles.bold]}>{label}</Text>
      <MoneyText
        maxFontSizeMultiplier={1.35}
        minimumFontScale={0.65}
        style={[styles.moneyLineAmount, emphasized && styles.bold]}
        signed={signed}
        minor={minor}
        currency={currency}
        scale={scale}
      />
    </View>
  );
}

const createStyles = (colors: UiColors) => {
  const segment = segmentedControlTokens(colors);
  return StyleSheet.create({
    action: {
      alignItems: "center",
      borderColor: colors.accent,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 16,
    },
    actionPrimary: { backgroundColor: colors.accent },
    actionText: { color: colors.accent, fontSize: 16, fontWeight: "800" },
    actionTextPrimary: { color: colors.onAccent },
    alignRight: { textAlign: "right" },
    arrow: { color: colors.disabled, fontSize: 16 },
    body: { color: colors.textTertiary, fontSize: 15, lineHeight: 22 },
    bold: { color: colors.textPrimary, fontWeight: "800" },
    card: {
      backgroundColor: colors.surface,
      borderRadius: cv.radius.card,
      gap: 10,
      padding: 14,
    },
    confirmedAmount: {
      color: colors.textPrimary,
      fontSize: 20,
      fontVariant: ["tabular-nums"],
      fontWeight: "800",
    },
    category: {
      backgroundColor: colors.surface,
      borderRadius: cv.radius.card,
      overflow: "hidden",
    },
    categoryHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 52,
      gap: 8,
      paddingHorizontal: 14,
    },
    compactCategoryHeader: {
      alignItems: "stretch",
      flexDirection: "column",
      gap: 6,
      paddingVertical: 14,
    },
    categoryLine: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 10,
    },
    compactAmount: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
      textAlign: "right",
      maxWidth: "48%",
    },
    recentHeading: { color: colors.textTertiary, fontSize: 13, fontWeight: "700" },
    compactExpandedBody: { gap: 10, padding: cv.space.row },
    compactExpenseRow: {
      borderTopWidth: 0,
      borderBottomColor: colors.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 0,
      paddingVertical: 13,
      minHeight: 66,
    },
    lastExpenseRow: { borderBottomWidth: 0 },
    categoryLink: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      minHeight: 44,
    },
    categoryLinkText: {
      color: colors.accent,
      flexShrink: 1,
      fontSize: 14,
      fontWeight: "600",
    },
    compactAllLink: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      minHeight: 44,
      paddingHorizontal: 14,
    },
    expandedBody: {
      backgroundColor: colors.expandedSurface,
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    chevron: { color: colors.textSecondary, fontSize: 24 },
    content: { paddingBottom: 48 },
    divider: { backgroundColor: colors.separator, height: StyleSheet.hairlineWidth },
    embedded: { flex: 1 },
    pager: { flex: 1 },
    pagerPage: { flex: 1 },
    empty: { color: colors.textSecondary, fontSize: 15, paddingVertical: 12 },
    expenseRow: {
      alignItems: "center",
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 10,
      padding: 14,
    },
    grow: { flex: 1, gap: 3 },
    hero: {
      backgroundColor: colors.accentSurface,
      borderRadius: cv.radius.hero,
      gap: 6,
      padding: 18,
    },
    heroAmount: { flexShrink: 1 },
    heroAmountRow: { alignItems: "flex-start", flexDirection: "row", gap: 4 },
    heroLabel: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
    estimateIndicator: {
      backgroundColor: colors.warningIndicator,
      borderRadius: 5,
      height: 9,
      width: 9,
    },
    estimateIndicatorButton: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 32,
      minWidth: 32,
    },
    legacy: {
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 6,
      paddingTop: 14,
    },
    link: { color: colors.accent, fontSize: 14, fontWeight: "800" },
    memberMenu: {
      backgroundColor: colors.surface,
      borderColor: colors.separator,
      borderRadius: 12,
      borderWidth: 1,
      overflow: "hidden",
    },
    memberMenuCheck: { color: colors.accent, fontSize: 16, fontWeight: "900" },
    memberMenuItem: {
      alignItems: "center",
      borderBottomColor: colors.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 48,
      paddingHorizontal: 14,
    },
    memberMenuText: { color: colors.textTertiary, flex: 1, fontSize: 15 },
    memberPickerButton: {
      alignItems: "center",
      borderColor: colors.separator,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      maxWidth: "38%",
      minHeight: 40,
      paddingHorizontal: 12,
    },
    memberPickerButtonText: {
      color: colors.textTertiary,
      flexShrink: 1,
      fontWeight: "700",
    },
    memberPickerChevron: { color: colors.textSecondary, fontSize: 16 },
    message: { color: colors.accent, fontSize: 14, fontWeight: "700" },
    meta: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    moneyLine: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      justifyContent: "space-between",
      minHeight: 28,
    },
    moneyLineLarge: { alignItems: "stretch", flexDirection: "column" },
    moneyLineLabel: { color: colors.textTertiary, flex: 1, fontSize: 15, lineHeight: 22 },
    moneyLineAmount: {
      color: colors.textTertiary,
      flexShrink: 1,
      fontSize: 15,
      fontVariant: ["tabular-nums"],
      lineHeight: 22,
      textAlign: "right",
    },
    nav: {
      backgroundColor: colors.groupedBackground,
      borderBottomColor: colors.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      position: "relative",
      zIndex: 2,
    },
    navItem: {
      alignItems: "center",
      borderBottomColor: colors.transparent,
      borderBottomWidth: 3,
      flex: 1,
      gap: 3,
      justifyContent: "center",
      minHeight: 58,
      paddingHorizontal: 4,
      paddingVertical: 7,
    },
    navItemSelected: { backgroundColor: segment.selectedSurface },
    navItemActive: { borderBottomColor: segment.indicator },
    navIndicator: {
      backgroundColor: segment.indicator,
      bottom: 0,
      height: 3,
      left: 0,
      position: "absolute",
    },
    navLabel: { alignSelf: "stretch" },
    navText: {
      color: segment.label,
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center",
    },
    navTextActive: { color: segment.selectedLabel },
    navTextOverlay: {
      color: segment.selectedLabel,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    notice: {
      backgroundColor: colors.warningSurface,
      borderRadius: cv.radius.card,
      gap: 6,
      padding: 14,
    },
    noticeTitle: { color: colors.warning, fontSize: 16, fontWeight: "700" },
    personalRecord: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      gap: 4,
      padding: 14,
    },
    rateDetails: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      gap: 4,
      marginTop: 4,
      padding: 12,
    },
    rateIssue: {
      alignItems: "center",
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: 8,
      paddingVertical: 10,
    },
    reviewControl: {
      alignItems: "center",
      borderColor: colors.separator,
      borderRadius: 10,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 42,
      paddingHorizontal: 8,
    },
    reviewControlChecking: {
      backgroundColor: colors.warningSurface,
      borderColor: colors.warningIndicator,
    },
    reviewControlGood: {
      backgroundColor: colors.successSurface,
      borderColor: colors.success,
    },
    reviewControlNeutral: { backgroundColor: colors.separator },
    reviewControlText: { color: colors.textTertiary, fontSize: 13, fontWeight: "700" },
    reviewControls: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    reviewCounts: { flexDirection: "row", gap: 8 },
    reviewCount: { flex: 1, gap: 2 },
    reviewCountValue: {
      color: colors.textPrimary,
      fontSize: 18,
      fontVariant: ["tabular-nums"],
      fontWeight: "800",
    },
    reviewMemberRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      minHeight: 40,
    },
    reviewMembers: {
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 4,
      paddingTop: 8,
    },
    reviewTag: {
      borderRadius: 999,
      fontSize: 12,
      fontWeight: "800",
      overflow: "hidden",
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    reviewTagChecking: { backgroundColor: colors.warningSurface, color: colors.warning },
    reviewTagGood: { backgroundColor: colors.successSurface, color: colors.success },
    reviewTagNeutral: { backgroundColor: colors.separator, color: colors.textTertiary },
    rowAmount: { color: colors.textPrimary, ...cv.type.rowAmount, textAlign: "right" },
    rowTitle: { color: colors.textPrimary, ...cv.type.row },
    secondaryNote: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
    section: { gap: cv.space.card, paddingTop: cv.space.section },
    summaryBlock: { gap: cv.space.heading },
    summaryHeading: { color: colors.textPrimary, ...cv.type.section },
    summaryLink: { justifyContent: "center", minHeight: 36 },
    summaryLinks: {
      borderTopColor: colors.separator,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 4,
    },
    sectionLeadRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
    },
    sectionLeadText: {
      color: colors.accent,
      flexShrink: 1,
      ...cv.type.eyebrow,
      letterSpacing: 0.4,
      minWidth: 0,
    },
    sectionLeadGrow: { flex: 1 },
    sections: { paddingBottom: 24 },
    standaloneSections: { paddingHorizontal: 16 },
    subheading: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "800",
      marginTop: 4,
    },
    toggle: {
      alignSelf: "flex-start",
      backgroundColor: colors.separator,
      borderRadius: 10,
      flexDirection: "row",
      padding: 2,
    },
    toggleActive: { backgroundColor: segment.selectedSurface },
    toggleItem: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
    toggleText: { color: segment.label, fontSize: 13, fontWeight: "700" },
    toggleTextActive: { color: segment.selectedLabel },
    transferAmount: { color: colors.textPrimary, ...cv.type.rowAmount },
    transferAmountBlock: { alignItems: "center", flexShrink: 0 },
    transferProgress: { color: colors.textTertiary, fontSize: 10 },
    transferProgressRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
      marginTop: 2,
    },
    transferProgressTrack: {
      backgroundColor: colors.separator,
      borderRadius: 2,
      height: 4,
      marginBottom: 12,
      marginHorizontal: 12,
      overflow: "hidden",
    },
    transferProgressFill: { backgroundColor: colors.accent, borderRadius: 2, height: 4 },
    fxDotButton: {
      alignItems: "center",
      height: 14,
      justifyContent: "center",
      width: 14,
    },
    fxDot: {
      backgroundColor: colors.warningIndicator,
      borderRadius: 4,
      height: 7,
      width: 7,
    },
    fxDetail: { backgroundColor: colors.warningSurface, gap: 5, padding: 10 },
    fxDetailText: { color: colors.warning, fontSize: 11, lineHeight: 16 },
    fxDetailTitle: { color: colors.warning, fontSize: 12, fontWeight: "800" },
    transferCard: {
      backgroundColor: colors.surface,
      borderRadius: cv.radius.card,
      overflow: "hidden",
    },
    transferHeading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 44,
      gap: 12,
    },
    transferHeadingText: { color: colors.textPrimary, ...cv.type.section, flexShrink: 1 },
    transferMember: {
      color: colors.textTertiary,
      flex: 1,
      fontSize: 14,
      fontWeight: "700",
    },
    transferRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
      minHeight: 60,
      padding: 12,
    },
    waiting: {
      backgroundColor: colors.infoSurface,
      borderRadius: 12,
      gap: 6,
      padding: 14,
    },
  });
};
