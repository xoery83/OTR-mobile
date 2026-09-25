import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { AppIcon } from "@/components/AppIcon";
import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import { usePersonalSettlementReview } from "@/hooks/usePersonalSettlementReview";
import { useSettlementSections } from "@/hooks/useSettlementSections";
import { useStage7Settlement } from "@/hooks/useStage7Settlement";

import { formatLedgerMoney } from "./format";
import { shortMemberName } from "./dashboardPresentation";
import { PersonalPaymentSection } from "./PersonalPaymentSection";
import {
  buildSettlementComparison,
  currentSettlementTransfers,
  memberName,
  membersWithActorFirst,
  personalPaymentProgress,
  splitLabel,
  summarizeSettlementChanges,
  type SettlementCategory,
  visibleSettlementTransfers,
} from "./settlementSections";

export const settlementSectionNames = ["Summary", "Paid", "Shares", "Payments"] as const;
export type SettlementSectionName = (typeof settlementSectionNames)[number];
type PersonalReviewHook = ReturnType<typeof usePersonalSettlementReview>;
type PersonalReviewCoverage = NonNullable<PersonalReviewHook["state"]>["coverage"];
type PersonalReviewState = Parameters<PersonalReviewHook["setReviewState"]>[0];

const settlementSectionTabs = [
  { icon: "chart.pie.fill", label: "Summary", name: "Summary" },
  { icon: "banknote.fill", label: "Paid", name: "Paid" },
  { icon: "person.2.fill", label: "Shares", name: "Shares" },
  { icon: "arrow.left.arrow.right", label: "Payments", name: "Payments" },
] as const;

export function SettlementReadinessScreen({
  activeSection,
  debugMode = false,
  journeyId,
  embedded = false,
  onSectionChange,
  showNavigation = true,
}: {
  activeSection?: SettlementSectionName;
  debugMode?: boolean;
  journeyId?: string;
  embedded?: boolean;
  onSectionChange?: (section: SettlementSectionName) => void;
  showNavigation?: boolean;
}) {
  const settlement = useStage7Settlement(journeyId);
  const review = usePersonalSettlementReview(settlement.journeyId ?? journeyId);
  const currentFinal = settlement.lineage.at(-1) ?? settlement.finalized;
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
  );
  const [localActive, setLocalActive] = useState<SettlementSectionName>("Summary");
  const active = activeSection ?? localActive;
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
  const visibleTransfers = visibleSettlementTransfers(
    transfers,
    settlement.actorMemberId,
    everyone,
    settlement.isOrganizer,
  );

  if (!settlement.journeyId)
    return <Text style={styles.empty}>Choose a Journey to view Settlement.</Text>;

  const changeSection = (section: SettlementSectionName) => {
    if (activeSection === undefined) setLocalActive(section);
    onSectionChange?.(section);
  };

  const content = (
    <View
      key={projection?.projectionId ?? comparison.comparisonId}
      style={[styles.sections, !embedded && styles.standaloneSections]}
    >
      {active === "Summary" ? (
        <SummarySection
          expenses={sections.expenses}
          reviewCount={sections.reviewCount}
          review={review}
          settlement={settlement}
          debugMode={debugMode}
        />
      ) : active === "Paid" ? (
        <ExpenseSection
          actorMemberId={settlement.actorMemberId}
          categories={sections.spendingCategories}
          empty="No shared expenses paid by this traveller yet."
          expanded={expandedSpending}
          journeyId={settlement.journeyId}
          key="Paid"
          historicalSnapshot={Boolean(displayedFinal)}
          memberId={sections.spendingMemberId}
          members={sections.members}
          onExpand={setExpandedSpending}
          onMember={sections.setSpendingMemberId}
          organizer={settlement.isOrganizer}
          totalLabel={`Paid by ${sections.spendingMemberId === settlement.actorMemberId ? "me" : memberName(sections.members, sections.spendingMemberId)}`}
        />
      ) : active === "Shares" ? (
        <ExpenseSection
          actorMemberId={settlement.actorMemberId}
          categories={sections.shareCategories}
          empty="No shared expenses are assigned to this traveller yet."
          expanded={expandedShares}
          journeyId={settlement.journeyId}
          key="Shares"
          historicalSnapshot={Boolean(displayedFinal)}
          memberId={sections.sharesMemberId}
          members={sections.members}
          onExpand={setExpandedShares}
          onMember={sections.setSharesMemberId}
          organizer={settlement.isOrganizer}
          shares
          totalLabel={
            sections.sharesMemberId === settlement.actorMemberId
              ? "My share"
              : `${memberName(sections.members, sections.sharesMemberId)}'s share`
          }
        />
      ) : (
        <PaymentsSection
          actorMemberId={settlement.actorMemberId}
          currency={
            displayedFinal?.settlementCurrency ??
            settlement.preview?.settlementCurrency ??
            review.state?.statement.currency ??
            "NZD"
          }
          everyone={everyone}
          expandedTransfer={expandedTransfer}
          fxSnapshots={sections.fxSnapshots}
          isOrganizer={settlement.isOrganizer}
          journeyId={settlement.journeyId}
          members={sections.members}
          onEveryone={setEveryone}
          onExpandTransfer={setExpandedTransfer}
          onPaymentsChanged={sections.updatePayments}
          payments={sections.payments}
          scale={
            displayedFinal?.settlementScale ??
            settlement.preview?.settlementScale ??
            review.state?.statement.scale ??
            2
          }
          transfers={visibleTransfers}
        />
      )}
      {sections.loading ? (
        <ActivityIndicator accessibilityLabel="Loading Settlement" />
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
          <SettlementSectionTabs active={active} onChange={changeSection} />
        ) : null}
        {content}
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
      {content}
    </ScrollView>
  );
}

export function SettlementSectionTabs({
  active,
  onChange,
}: {
  active: SettlementSectionName;
  onChange: (section: SettlementSectionName) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.nav}>
      {settlementSectionTabs.map(({ icon, label, name }) => (
        <Pressable
          accessibilityLabel={label}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === name }}
          key={name}
          onPress={() => onChange(name)}
          style={[styles.navItem, active === name && styles.navItemActive]}
        >
          <AppIcon
            color={active === name ? "#0F766E" : "#64748B"}
            name={icon}
            size={19}
          />
          <Text style={[styles.navText, active === name && styles.navTextActive]}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SummarySection({
  debugMode,
  expenses,
  reviewCount,
  review,
  settlement,
}: {
  debugMode: boolean;
  expenses: ReturnType<typeof useSettlementSections>["expenses"];
  reviewCount: number;
  review: ReturnType<typeof usePersonalSettlementReview>;
  settlement: ReturnType<typeof useStage7Settlement>;
}) {
  const statement = review.state?.statement;
  const projection = settlement.summaryProjection;
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
      reason: settlement.pendingPublicationExpenseIds.has(expense.serverId ?? expense.id)
        ? "Today's reference rate has not been published yet."
        : settlement.unavailableExpenseIds.has(expense.serverId ?? expense.id)
          ? "Automatic reference rate is unavailable. Review this Expense."
          : "Using a recent reference rate. This amount may change.",
    }));
  const changedExpenses = (projection?.confirmationDiff ?? []).map((item) => ({
    expenseId: item.expenseId,
    change:
      item.change === "ADDED"
        ? ("NEW" as const)
        : item.change === "REMOVED"
          ? ("DELETED" as const)
          : ("CHANGED" as const),
  }));
  const summarizedChanges = summarizeSettlementChanges(changedExpenses);
  const hasChanges = changedExpenses.length > 0;
  const confirmedBalance = projection?.confirmedSettlement;
  const changeTitle = (expenseId: string) =>
    statement?.contributions.find((item) => item.expenseId === expenseId)
      ?.expenseTitleSnapshot ??
    review.state?.delta?.changedExpenses.find((item) => item.expenseId === expenseId)
      ?.newContribution?.expenseTitleSnapshot ??
    review.state?.delta?.changedExpenses.find((item) => item.expenseId === expenseId)
      ?.oldContribution?.expenseTitleSnapshot ??
    `Expense ${expenseId.slice(0, 8)}`;
  const confirm = () => {
    if (settlement.preview?.state !== "PREVIEW_READY") return;
    Alert.alert(
      "Confirm final amounts?",
      "The confirmed result stays in Settlement history. Later corrections create an updated version.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm final amounts",
          onPress: () => void settlement.finalize(settlement.preview!),
        },
      ],
    );
  };
  return (
    <View style={styles.section}>
      <View style={styles.hero}>
        <Text
          accessibilityRole="header"
          style={[styles.sectionLeadText, styles.paymentsLeadText]}
        >
          CURRENT BALANCE
        </Text>
        <Text style={styles.heroLabel}>
          {balanceMinor === undefined
            ? "Preparing your balance"
            : balanceMinor > 0
              ? "You should receive"
              : balanceMinor < 0
                ? "You need to pay"
                : "You're settled up"}
        </Text>
        <View style={styles.heroAmountRow}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.heroAmount}>
            {balanceMinor === undefined
              ? "—"
              : formatLedgerMoney(Math.abs(balanceMinor), currency, scale)}
          </Text>
          {projection && rateIssues.length ? (
            <Pressable
              accessibilityHint="Shows Expenses whose converted amounts may change"
              accessibilityLabel="Some amounts may change"
              accessibilityRole="button"
              onPress={() => setRateDetailsOpen((open) => !open)}
              style={styles.estimateIndicatorButton}
            >
              <View style={styles.estimateIndicator} />
            </Pressable>
          ) : null}
        </View>
        {projection && (debugMode || projection.freshness !== "CURRENT") ? (
          <Text style={styles.meta}>
            {projection.freshness === "LOCAL_PENDING"
              ? "Includes changes saved on this device · waiting to sync"
              : projection.freshness === "SAVED"
                ? "Showing saved latest calculation"
                : "Current server calculation"}
          </Text>
        ) : null}
        {rateDetailsOpen && rateIssues.length ? (
          <View style={styles.rateDetails}>
            <Text style={styles.rowTitle}>Some converted amounts may change</Text>
            {rateIssues.map((issue) => (
              <Pressable
                accessibilityRole="button"
                key={issue.id}
                onPress={() =>
                  router.push(`/expenses/expense/${expenseFor(issue.id)?.id ?? issue.id}`)
                }
                style={styles.rateIssue}
              >
                <View style={styles.grow}>
                  <Text style={styles.rowTitle}>{issue.title}</Text>
                  <Text style={styles.meta}>{issue.reason}</Text>
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
        <View style={styles.card}>
          <MoneyLine
            label="Paid for group"
            minor={paidMinor}
            currency={currency}
            scale={scale}
          />
          <MoneyLine
            label="Your share"
            minor={shareMinor}
            currency={currency}
            scale={scale}
          />
          <View style={styles.divider} />
          <MoneyLine
            emphasized
            label="Current balance"
            minor={balanceMinor}
            currency={currency}
            scale={scale}
            signed
          />
        </View>
      ) : null}
      {hasConfirmed && hasChanges ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Changes since last confirmation</Text>
          {summarizedChanges.removedCount ? (
            <Text style={styles.body}>
              Removed: {summarizedChanges.removedCount} expense
              {summarizedChanges.removedCount === 1 ? "" : "s"}
            </Text>
          ) : null}
          {summarizedChanges.visible.map((item) => (
            <Text key={item.expenseId} style={styles.body}>
              {item.change === "NEW" ? "Added" : "Changed"}: {changeTitle(item.expenseId)}
            </Text>
          ))}
          {balanceMinor !== undefined && confirmedBalance ? (
            <Text style={styles.body}>
              Your change: {balanceMinor - confirmedBalance.balanceMinor >= 0 ? "+" : ""}
              {formatLedgerMoney(
                balanceMinor - confirmedBalance.balanceMinor,
                currency,
                scale,
              )}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/expenses/settlement-update",
                params: { journeyId: settlement.journeyId },
              } as never)
            }
          >
            <Text style={styles.link}>Review changes ›</Text>
          </Pressable>
        </View>
      ) : null}
      {hasConfirmed && confirmedBalance ? (
        <View style={styles.card}>
          <Text style={styles.rowTitle}>Last confirmed</Text>
          <Text style={styles.body}>
            {formatLedgerMoney(Math.abs(confirmedBalance.balanceMinor), currency, scale)}{" "}
            · {new Date(confirmedBalance.finalizedAt).toLocaleDateString()} · version #
            {confirmedBalance.lineageSequence + 1}
          </Text>
          {settlement.isOrganizer ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/expenses/settlement-adjustment",
                  params: { journeyId: settlement.journeyId },
                } as never)
              }
            >
              <Text style={styles.link}>Correct a confirmed expense ›</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/expenses/settlement-statement",
                params: {
                  journeyId: settlement.journeyId,
                  versionId: confirmedBalance.id,
                },
              } as never)
            }
          >
            <Text style={styles.link}>Settlement history ›</Text>
          </Pressable>
        </View>
      ) : null}
      {review.state ? (
        <GroupReviewStatus
          actorMemberId={settlement.actorMemberId}
          busy={review.busy}
          coverage={review.state.coverage}
          expanded={reviewCoverageOpen}
          onExpand={() => setReviewCoverageOpen((open) => !open)}
          onSelect={(state) => void review.setReviewState(state)}
          pendingReviewState={review.state.pendingReviewState}
        />
      ) : null}
      {review.state?.delta ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/expenses/personal-settlement-review",
              params: { journeyId: settlement.journeyId },
            } as never)
          }
          style={styles.notice}
        >
          <Text style={styles.noticeTitle}>Updated since you reviewed</Text>
          <Text style={styles.body}>
            Your balance changed by{" "}
            {formatLedgerMoney(review.state.delta.netDeltaMinor, currency, scale)} ·{" "}
            {review.state.delta.changedExpenses.length}{" "}
            {review.state.delta.changedExpenses.length === 1 ? "expense" : "expenses"}{" "}
            changed
          </Text>
          <Text style={styles.link}>Review changes ›</Text>
        </Pressable>
      ) : null}
      {reviewCount ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/expenses/review",
              params: { journeyId: settlement.journeyId },
            } as never)
          }
          style={styles.notice}
        >
          <Text style={styles.noticeTitle}>Needs attention</Text>
          <Text style={styles.body}>
            {reviewCount} {reviewCount === 1 ? "thing may" : "things may"} affect the
            final amount
          </Text>
          <Text style={styles.link}>
            Review {reviewCount} {reviewCount === 1 ? "item" : "items"} ›
          </Text>
        </Pressable>
      ) : null}
      {unavailableRates ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Exchange rates need attention</Text>
          {[...settlement.unavailableExpenseIds].map((id) => (
            <Pressable
              accessibilityRole="button"
              key={id}
              onPress={() => router.push(`/expenses/expense/${expenseFor(id)?.id ?? id}`)}
              style={styles.rateIssue}
            >
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>
                  {expenseFor(id)?.title ?? `Expense ${id.slice(0, 8)}`}
                </Text>
                <Text style={styles.body}>
                  Automatic reference rate is unavailable. Review or enter the rate.
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {conflicts ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void settlement.prepare()}
          style={styles.notice}
        >
          <Text style={styles.noticeTitle}>Settlement values need attention</Text>
          <Text style={styles.body}>
            {conflicts} {conflicts === 1 ? "conflict needs" : "conflicts need"} review.
          </Text>
          <Text style={styles.link}>Check readiness ›</Text>
        </Pressable>
      ) : null}
      {debugMode && automaticWaiting ? (
        <Text style={styles.meta}>
          Waiting for {automaticWaiting} reference rate
          {automaticWaiting === 1 ? "" : "s"} to be published.
        </Text>
      ) : null}
      {debugMode && settlement.message ? (
        <Text style={styles.message}>{settlement.message}</Text>
      ) : null}
      {debugMode && settlement.updating ? (
        <Text style={styles.meta}>Updating…</Text>
      ) : null}
      {settlement.isOrganizer &&
      !hasConfirmed &&
      settlement.preview?.state === "PREVIEW_READY" ? (
        <Action primary label="Confirm final amounts" onPress={confirm} />
      ) : settlement.isOrganizer && !hasConfirmed ? (
        <Action label="Check final readiness" onPress={() => void settlement.prepare()} />
      ) : null}
    </View>
  );
}

function ExpenseSection({
  actorMemberId,
  categories,
  empty,
  expanded,
  historicalSnapshot,
  journeyId,
  memberId,
  members,
  onExpand,
  onMember,
  organizer,
  shares = false,
  totalLabel,
}: {
  actorMemberId: string | null;
  categories: SettlementCategory[];
  empty: string;
  expanded: string | null;
  historicalSnapshot: boolean;
  journeyId: string;
  memberId: string | null;
  members: { id: string; label: string }[];
  onExpand: (value: string | null) => void;
  onMember: (value: string) => void;
  organizer: boolean;
  shares?: boolean;
  totalLabel: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const orderedMembers = membersWithActorFirst(members, actorMemberId);
  const selectedMember = orderedMembers.find((member) => member.id === memberId);
  const first = categories[0]?.rows[0];
  const total = categories.reduce((sum, category) => sum + category.totalMinor, 0);
  const currency = first?.settlementCurrency ?? "NZD";
  const scale = first?.settlementScale ?? 2;
  return (
    <View style={styles.section}>
      <View style={styles.hero}>
        <View style={styles.sectionLeadRow}>
          <Text accessibilityRole="header" style={styles.sectionLeadText}>
            {totalLabel.toUpperCase()}
          </Text>
          {organizer ? (
            <Pressable
              accessibilityLabel={`Selected member: ${memberId === actorMemberId ? "Me" : (selectedMember?.label ?? "Traveller")}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: pickerOpen }}
              onPress={() => setPickerOpen((open) => !open)}
              style={styles.memberPickerButton}
            >
              <Text numberOfLines={1} style={styles.memberPickerButtonText}>
                {memberId === actorMemberId
                  ? "Me"
                  : shortMemberName(selectedMember?.label ?? "Traveller")}
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
                    {member.id === actorMemberId ? "Me" : member.label}
                  </Text>
                  {selected ? <Text style={styles.memberMenuCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.heroAmount}>
          {formatLedgerMoney(total, currency, scale)}
        </Text>
      </View>
      {categories.map((category) => {
        const open = expanded === category.key;
        return (
          <View key={category.key} style={styles.category}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => onExpand(open ? null : category.key)}
              style={styles.categoryHeader}
            >
              <Text style={styles.rowTitle}>{category.label}</Text>
              <Text style={styles.rowAmount}>
                {formatLedgerMoney(category.totalMinor, currency, scale)}{" "}
                {open ? "⌃" : "⌄"}
              </Text>
            </Pressable>
            {open
              ? category.rows.slice(0, 8).map((row) => (
                  <Pressable
                    accessibilityHint="Opens Expense detail"
                    accessibilityRole="button"
                    key={row.id}
                    onPress={() => router.push(`/expenses/expense/${row.id}`)}
                    style={styles.expenseRow}
                  >
                    <View style={styles.grow}>
                      <Text style={styles.rowTitle}>{row.title}</Text>
                      <Text style={styles.meta}>
                        {formatLedgerMoney(
                          row.originalMinor,
                          row.originalCurrency,
                          row.originalScale,
                        )}{" "}
                        total · Paid by {row.payerName}
                      </Text>
                      <Text style={styles.meta}>
                        {row.participantCount}{" "}
                        {row.participantCount === 1 ? "person" : "people"} ·{" "}
                        {splitLabel(row.splitMethod)}
                      </Text>
                      {shares && row.componentMinor !== null ? (
                        <Text style={styles.body}>
                          Selected share ·{" "}
                          {formatLedgerMoney(
                            row.componentMinor,
                            row.settlementCurrency,
                            row.settlementScale,
                          )}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))
              : null}
          </View>
        );
      })}
      {!categories.length ? <Text style={styles.empty}>{empty}</Text> : null}
      <Action
        label={historicalSnapshot ? "View current expenses" : "View all expenses"}
        onPress={() =>
          router.push({
            pathname: "/expenses/search",
            params: {
              journeyId,
              memberId: memberId ?? "",
              ...(shares
                ? { selectedMemberId: memberId ?? "" }
                : { payerMemberId: memberId ?? "" }),
            },
          } as never)
        }
      />
    </View>
  );
}

function PaymentsSection({
  actorMemberId,
  currency,
  everyone,
  expandedTransfer,
  fxSnapshots,
  isOrganizer,
  journeyId,
  members,
  onEveryone,
  onExpandTransfer,
  onPaymentsChanged,
  payments,
  scale,
  transfers,
}: {
  actorMemberId: string | null;
  currency: string;
  everyone: boolean;
  expandedTransfer: string | null;
  fxSnapshots: ReturnType<typeof useSettlementSections>["fxSnapshots"];
  isOrganizer: boolean;
  journeyId: string;
  members: { id: string; label: string }[];
  onEveryone: (value: boolean) => void;
  onExpandTransfer: (value: string | null) => void;
  onPaymentsChanged: (records: LocalPersonalPayment[]) => void;
  payments: LocalPersonalPayment[];
  scale: number;
  transfers: ReturnType<typeof currentSettlementTransfers>;
}) {
  const [estimateDetail, setEstimateDetail] = useState<string | null>(null);
  return (
    <View style={styles.section}>
      <View style={styles.hero}>
        <Text
          accessibilityRole="header"
          style={[styles.sectionLeadText, styles.paymentsLeadText]}
        >
          RECOMMENDED TRANSFERS
        </Text>
        {isOrganizer ? <Toggle everyone={everyone} onChange={onEveryone} /> : null}
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
              <Text numberOfLines={1} style={styles.transferMember}>
                {transfer.fromMemberId === actorMemberId ? "You" : from}
              </Text>
              <Text style={styles.arrow}>→</Text>
              <View style={styles.transferAmountBlock}>
                <Text style={styles.transferAmount}>
                  {formatLedgerMoney(transfer.amount.minor, currency, scale)}
                </Text>
                {progress && (progress.minor || progress.provisional.length) ? (
                  <View style={styles.transferProgressRow}>
                    <Text style={styles.transferProgress}>
                      {progress.direction === "PAID" ? "Paid" : "Received"}{" "}
                      {formatLedgerMoney(progress.minor, currency, scale)} ·{" "}
                      {progress.percentage}%
                    </Text>
                    {progress.provisional.length ? (
                      <Pressable
                        accessibilityHint="Shows which payment conversions are provisional"
                        accessibilityLabel="Some payment conversions may change"
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
              <Text numberOfLines={1} style={[styles.transferMember, styles.alignRight]}>
                {transfer.toMemberId === actorMemberId ? "You" : to}
              </Text>
            </Pressable>
            {estimateDetail === key && progress?.provisional.length ? (
              <View style={styles.fxDetail}>
                <Text style={styles.fxDetailTitle}>Amounts that may change</Text>
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
                settlementScale={scale}
                to={{ id: transfer.toMemberId, name: to }}
              />
            ) : null}
          </View>
        );
      })}
      {!transfers.length ? (
        <Text style={styles.empty}>No recommended transfers.</Text>
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
            {value ? "Everyone" : "Mine"}
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
    <View style={styles.reviewStatusCard}>
      <Text accessibilityRole="header" style={styles.rowTitle}>
        Group review status
      </Text>
      <Text style={styles.meta}>
        {counts.LOOKS_GOOD} looks good · {counts.STILL_CHECKING} still checking ·{" "}
        {counts.NOT_REVIEWED} not reviewed
      </Text>
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
                {state === "LOOKS_GOOD" ? "Looks good" : "Still checking"}
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
              Not reviewed
            </Text>
          </View>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onExpand}
      >
        <Text style={styles.link}>
          {expanded ? "Hide member status ⌃" : "View member status ⌄"}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.reviewMembers}>
          {coverage.map((member) => (
            <View key={member.memberId} style={styles.reviewMemberRow}>
              <Text style={styles.body}>
                {member.displayName}
                {member.memberId === actorMemberId ? " (You)" : ""}
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
  );
}

function reviewStateLabel(state: PersonalReviewCoverage[number]["reviewState"]) {
  return state === "LOOKS_GOOD"
    ? "Looks good"
    : state === "STILL_CHECKING"
      ? "Still checking"
      : "Not reviewed";
}

function Action({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.action, primary && styles.actionPrimary]}
    >
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  );
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
  return (
    <View style={styles.moneyLine}>
      <Text style={[styles.body, emphasized && styles.bold]}>{label}</Text>
      <Text style={[styles.body, emphasized && styles.bold]}>
        {signed && minor > 0 ? "+" : ""}
        {formatLedgerMoney(minor, currency, scale)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    borderColor: "#0F766E",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  actionPrimary: { backgroundColor: "#0F766E" },
  actionText: { color: "#0F766E", fontSize: 16, fontWeight: "800" },
  actionTextPrimary: { color: "#FFFFFF" },
  alignRight: { textAlign: "right" },
  arrow: { color: "#94A3B8", fontSize: 16 },
  body: { color: "#334155", fontSize: 15, lineHeight: 22 },
  bold: { color: "#0F172A", fontWeight: "800" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, gap: 10, padding: 14 },
  category: { backgroundColor: "#FFFFFF", borderRadius: 12, overflow: "hidden" },
  categoryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: 14,
  },
  chevron: { color: "#64748B", fontSize: 24 },
  content: { paddingBottom: 48 },
  divider: { backgroundColor: "#E2E8F0", height: StyleSheet.hairlineWidth },
  embedded: { gap: 12 },
  empty: { color: "#64748B", fontSize: 15, paddingVertical: 12 },
  expenseRow: {
    alignItems: "center",
    borderTopColor: "#E2E8F0",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  grow: { flex: 1, gap: 3 },
  hero: { backgroundColor: "#E7F5F2", borderRadius: 18, gap: 6, padding: 18 },
  heroAmount: { color: "#0F172A", flexShrink: 1, fontSize: 36, fontWeight: "900" },
  heroAmountRow: { alignItems: "flex-start", flexDirection: "row", gap: 4 },
  heroLabel: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  estimateIndicator: {
    backgroundColor: "#D97706",
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
    borderTopColor: "#CBD5E1",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingTop: 14,
  },
  link: { color: "#0F766E", fontSize: 14, fontWeight: "800" },
  memberMenu: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  memberMenuCheck: { color: "#0F766E", fontSize: 16, fontWeight: "900" },
  memberMenuItem: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  memberMenuText: { color: "#334155", flex: 1, fontSize: 15 },
  memberPickerButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: "38%",
    minHeight: 40,
    paddingHorizontal: 12,
  },
  memberPickerButtonText: { color: "#334155", flexShrink: 1, fontWeight: "700" },
  memberPickerChevron: { color: "#64748B", fontSize: 16 },
  message: { color: "#0F766E", fontSize: 14, fontWeight: "700" },
  meta: { color: "#64748B", fontSize: 13, lineHeight: 19 },
  moneyLine: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  nav: {
    backgroundColor: "#F8FAFC",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    zIndex: 2,
  },
  navItem: {
    alignItems: "center",
    borderBottomColor: "transparent",
    borderBottomWidth: 3,
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 4,
    paddingVertical: 7,
  },
  navItemActive: { borderBottomColor: "#0F766E" },
  navText: { color: "#64748B", fontSize: 11, fontWeight: "700" },
  navTextActive: { color: "#0F766E" },
  notice: { backgroundColor: "#FFF7ED", borderRadius: 12, gap: 6, padding: 14 },
  noticeTitle: { color: "#9A3412", fontSize: 16, fontWeight: "800" },
  personalRecord: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 4, padding: 14 },
  rateDetails: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    gap: 4,
    marginTop: 4,
    padding: 12,
  },
  rateIssue: {
    alignItems: "center",
    borderTopColor: "#E2E8F0",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    paddingVertical: 10,
  },
  reviewControl: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 8,
  },
  reviewControlChecking: { backgroundColor: "#FEF3C7", borderColor: "#D97706" },
  reviewControlGood: { backgroundColor: "#D1FAE5", borderColor: "#059669" },
  reviewControlNeutral: { backgroundColor: "#E2E8F0" },
  reviewControlText: { color: "#334155", fontSize: 13, fontWeight: "700" },
  reviewControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  reviewMemberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 40,
  },
  reviewMembers: {
    borderTopColor: "#E2E8F0",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingTop: 8,
  },
  reviewStatusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    gap: 10,
    padding: 14,
  },
  reviewTag: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  reviewTagChecking: { backgroundColor: "#FEF3C7", color: "#92400E" },
  reviewTagGood: { backgroundColor: "#D1FAE5", color: "#065F46" },
  reviewTagNeutral: { backgroundColor: "#E2E8F0", color: "#475569" },
  rowAmount: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  rowTitle: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  secondaryNote: { color: "#64748B", fontSize: 13, lineHeight: 19 },
  section: { gap: 12, paddingTop: 24 },
  sectionLeadRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  sectionLeadText: {
    color: "#0F766E",
    flex: 1,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.4,
    minWidth: 0,
  },
  paymentsLeadText: { flex: 0 },
  sections: { paddingBottom: 24 },
  standaloneSections: { paddingHorizontal: 16 },
  subheading: { color: "#0F172A", fontSize: 18, fontWeight: "800", marginTop: 4 },
  toggle: {
    alignSelf: "flex-start",
    backgroundColor: "#E2E8F0",
    borderRadius: 10,
    flexDirection: "row",
    padding: 2,
  },
  toggleActive: { backgroundColor: "#FFFFFF" },
  toggleItem: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  toggleText: { color: "#64748B", fontSize: 13, fontWeight: "700" },
  toggleTextActive: { color: "#0F172A" },
  transferAmount: { color: "#0F172A", fontSize: 15, fontWeight: "900" },
  transferAmountBlock: { alignItems: "center", flexShrink: 0 },
  transferProgress: { color: "#475569", fontSize: 10 },
  transferProgressRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
  },
  fxDotButton: { alignItems: "center", height: 14, justifyContent: "center", width: 14 },
  fxDot: { backgroundColor: "#D97706", borderRadius: 4, height: 7, width: 7 },
  fxDetail: { backgroundColor: "#FEF3C7", gap: 5, padding: 10 },
  fxDetailText: { color: "#78350F", fontSize: 11, lineHeight: 16 },
  fxDetailTitle: { color: "#92400E", fontSize: 12, fontWeight: "800" },
  transferCard: { backgroundColor: "#FFFFFF", borderRadius: 12, overflow: "hidden" },
  transferMember: { color: "#334155", flex: 1, fontSize: 14, fontWeight: "700" },
  transferRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 60,
    padding: 12,
  },
  waiting: { backgroundColor: "#EFF6FF", borderRadius: 12, gap: 6, padding: 14 },
});
