import { useMemo, useRef, useState } from "react";
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

import type { LocalPersonalPayment } from "@/data/repositories/ledgerPersonalPaymentRepository";
import { usePersonalSettlementReview } from "@/hooks/usePersonalSettlementReview";
import { useSettlementSections } from "@/hooks/useSettlementSections";
import { useStage7Settlement } from "@/hooks/useStage7Settlement";

import { formatLedgerMoney } from "./format";
import { PersonalPaymentSection } from "./PersonalPaymentSection";
import {
  currentSettlementTransfers,
  memberName,
  splitLabel,
  type SettlementCategory,
  visiblePersonalPayments,
  visibleSettlementTransfers,
} from "./settlementSections";

const sectionNames = ["Summary", "Spending", "Shares", "Payments"] as const;
type SectionName = (typeof sectionNames)[number];

export function SettlementReadinessScreen({
  journeyId,
  embedded = false,
  onEmbeddedScroll,
}: {
  journeyId?: string;
  embedded?: boolean;
  onEmbeddedScroll?: (offset: number) => void;
}) {
  const settlement = useStage7Settlement(journeyId);
  const review = usePersonalSettlementReview(settlement.journeyId ?? journeyId);
  const sections = useSettlementSections(
    settlement.journeyId,
    settlement.actorMemberId,
    settlement.isOrganizer,
  );
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<SectionName, number>>({
    Summary: 0,
    Spending: 0,
    Shares: 0,
    Payments: 0,
  });
  const [active, setActive] = useState<SectionName>("Summary");
  const [everyone, setEveryone] = useState(false);
  const [expandedSpending, setExpandedSpending] = useState<string | null>(null);
  const [expandedShares, setExpandedShares] = useState<string | null>(null);
  const [expandedTransfer, setExpandedTransfer] = useState<string | null>(null);
  const recordOffset = (name: SectionName, offset: number) => {
    offsets.current = { ...offsets.current, [name]: offset };
  };
  const currentFinal = settlement.lineage.at(-1) ?? settlement.finalized;
  const transfers = useMemo(
    () =>
      currentSettlementTransfers(
        settlement.finalized,
        settlement.preview,
        settlement.displayPreview,
        settlement.lineage,
      ),
    [
      settlement.displayPreview,
      settlement.finalized,
      settlement.lineage,
      settlement.preview,
    ],
  );
  const visibleTransfers = visibleSettlementTransfers(
    transfers,
    settlement.actorMemberId,
    everyone,
    settlement.isOrganizer,
  );
  const visiblePayments = visiblePersonalPayments(
    sections.payments,
    settlement.actorMemberId,
    everyone,
    settlement.isOrganizer,
  );

  if (!settlement.journeyId)
    return <Text style={styles.empty}>Choose a Journey to view Settlement.</Text>;

  const nav = (
    <ScrollView
      accessibilityRole="tablist"
      contentContainerStyle={styles.navContent}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.nav}
    >
      {sectionNames.map((name) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: active === name }}
          key={name}
          onPress={() => {
            setActive(name);
            const offset = Math.max(0, offsets.current[name] - 52);
            if (embedded) onEmbeddedScroll?.(offset);
            else scroll.current?.scrollTo({ y: offset });
          }}
          style={[styles.navItem, active === name && styles.navItemActive]}
        >
          <Text style={[styles.navText, active === name && styles.navTextActive]}>
            {name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const content = (
    <View style={styles.sections}>
      <SectionAnchor name="Summary" onLayout={recordOffset}>
        <SummarySection
          paymentCount={
            sections.payments.filter(
              (record) => record.ownerMemberId === settlement.actorMemberId,
            ).length
          }
          reviewCount={sections.reviewCount}
          review={review}
          settlement={settlement}
        />
      </SectionAnchor>
      <SectionAnchor name="Spending" onLayout={recordOffset}>
        <ExpenseSection
          actorMemberId={settlement.actorMemberId}
          categories={sections.spendingCategories}
          empty="No shared expenses paid by this traveller yet."
          expanded={expandedSpending}
          journeyId={settlement.journeyId}
          memberId={sections.spendingMemberId}
          members={sections.members}
          onExpand={setExpandedSpending}
          onMember={sections.setSpendingMemberId}
          organizer={settlement.isOrganizer}
          title="Spending"
          totalLabel={`Paid by ${sections.spendingMemberId === settlement.actorMemberId ? "me" : memberName(sections.members, sections.spendingMemberId)}`}
        />
      </SectionAnchor>
      <SectionAnchor name="Shares" onLayout={recordOffset}>
        <ExpenseSection
          actorMemberId={settlement.actorMemberId}
          categories={sections.shareCategories}
          empty="No shared expenses are assigned to this traveller yet."
          expanded={expandedShares}
          journeyId={settlement.journeyId}
          memberId={sections.sharesMemberId}
          members={sections.members}
          onExpand={setExpandedShares}
          onMember={sections.setSharesMemberId}
          organizer={settlement.isOrganizer}
          shares
          title="Shares"
          totalLabel={
            sections.sharesMemberId === settlement.actorMemberId
              ? "My share"
              : `${memberName(sections.members, sections.sharesMemberId)}'s share`
          }
        />
      </SectionAnchor>
      <SectionAnchor name="Payments" onLayout={recordOffset}>
        <PaymentsSection
          actorMemberId={settlement.actorMemberId}
          currency={
            currentFinal?.settlementCurrency ??
            settlement.preview?.settlementCurrency ??
            review.state?.statement.currency ??
            "NZD"
          }
          everyone={everyone}
          expandedTransfer={expandedTransfer}
          isOrganizer={settlement.isOrganizer}
          journeyId={settlement.journeyId}
          members={sections.members}
          onEveryone={setEveryone}
          onExpandTransfer={setExpandedTransfer}
          payments={visiblePayments}
          scale={
            currentFinal?.settlementScale ??
            settlement.preview?.settlementScale ??
            review.state?.statement.scale ??
            2
          }
          transfers={visibleTransfers}
        />
      </SectionAnchor>
      {sections.loading ? (
        <ActivityIndicator accessibilityLabel="Loading Settlement" />
      ) : null}
      {sections.message ? <Text style={styles.message}>{sections.message}</Text> : null}
    </View>
  );

  if (embedded)
    return (
      <View style={styles.embedded}>
        {nav}
        {content}
      </View>
    );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      onScroll={(event) => {
        const y = event.nativeEvent.contentOffset.y + 80;
        const next = [...sectionNames]
          .reverse()
          .find((name) => y >= offsets.current[name]);
        if (next && next !== active) setActive(next);
      }}
      ref={scroll}
      scrollEventThrottle={100}
      stickyHeaderIndices={[0]}
    >
      {nav}
      {content}
    </ScrollView>
  );
}

function SectionAnchor({
  children,
  name,
  onLayout,
}: {
  children: React.ReactNode;
  name: SectionName;
  onLayout: (name: SectionName, offset: number) => void;
}) {
  return (
    <View onLayout={(event) => onLayout(name, event.nativeEvent.layout.y)}>
      {children}
    </View>
  );
}

function SummarySection({
  paymentCount,
  reviewCount,
  review,
  settlement,
}: {
  paymentCount: number;
  reviewCount: number;
  review: ReturnType<typeof usePersonalSettlementReview>;
  settlement: ReturnType<typeof useStage7Settlement>;
}) {
  const statement = review.state?.statement;
  const current = settlement.lineage.at(-1) ?? settlement.finalized;
  const finalizedBalance = current?.balances.find(
    (balance) => balance.memberId === settlement.actorMemberId,
  );
  const estimate = settlement.displayPreview?.balances.find(
    (balance) => balance.memberId === settlement.actorMemberId,
  );
  const balanceMinor =
    statement?.balanceMinor ?? finalizedBalance?.netMinor ?? estimate?.minor;
  const currency =
    statement?.currency ?? finalizedBalance?.currency ?? estimate?.currency ?? "NZD";
  const scale = statement?.scale ?? finalizedBalance?.scale ?? estimate?.scale ?? 2;
  const paidMinor = statement?.paidMinor ?? finalizedBalance?.paidMinor;
  const shareMinor = statement?.shareMinor ?? finalizedBalance?.owedMinor;
  const final = Boolean(current);
  const automaticWaiting = settlement.pendingPublicationExpenseIds.size;
  const unavailableRates = settlement.unavailableExpenseIds.size;
  const conflicts = settlement.preview?.blockers.filter(
    (blocker) => blocker.reason === "OPEN_CONFLICT",
  ).length;
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
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Summary
      </Text>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{final ? "FINAL BALANCE" : "CURRENT BALANCE"}</Text>
        <Text style={styles.heroLabel}>
          {balanceMinor === undefined
            ? "Preparing your balance"
            : balanceMinor > 0
              ? "You should receive"
              : balanceMinor < 0
                ? "You need to pay"
                : "You're settled up"}
        </Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.heroAmount}>
          {balanceMinor === undefined
            ? "—"
            : `${settlement.displayPreview?.estimatedCount && !final ? "≈ " : ""}${formatLedgerMoney(Math.abs(balanceMinor), currency, scale)}`}
        </Text>
        <Text style={styles.meta}>
          {final
            ? `Confirmed ${new Date(current!.finalizedAt).toLocaleDateString()}`
            : "Based on expenses recorded so far"}
        </Text>
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
            label={final ? "Final balance" : "Current balance"}
            minor={balanceMinor}
            currency={currency}
            scale={scale}
            signed
          />
        </View>
      ) : null}
      {paymentCount ? (
        <Text style={styles.secondaryNote}>
          {paymentCount} personal payment {paymentCount === 1 ? "record" : "records"} ·
          kept separate from this balance
        </Text>
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
      {automaticWaiting ? (
        <View style={styles.waiting}>
          <Text style={styles.rowTitle}>Waiting for exchange rate</Text>
          <Text style={styles.body}>
            Nothing you need to do. We will update this automatically.
          </Text>
        </View>
      ) : null}
      {unavailableRates || conflicts ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void settlement.prepare()}
          style={styles.notice}
        >
          <Text style={styles.noticeTitle}>Settlement values need attention</Text>
          <Text style={styles.body}>
            {unavailableRates
              ? `${unavailableRates} exchange ${unavailableRates === 1 ? "rate needs" : "rates need"} review.`
              : `${conflicts} ${conflicts === 1 ? "conflict needs" : "conflicts need"} review.`}
          </Text>
          <Text style={styles.link}>Check readiness ›</Text>
        </Pressable>
      ) : null}
      {review.state?.coverage.length && settlement.isOrganizer ? (
        <Text style={styles.secondaryNote}>
          Reviewed · {review.state.coverage.filter((item) => item.reviewedAt).length} of{" "}
          {review.state.coverage.length} members · informational only
        </Text>
      ) : null}
      {settlement.message ? (
        <Text style={styles.message}>{settlement.message}</Text>
      ) : null}
      {settlement.updating ? <Text style={styles.meta}>Updating…</Text> : null}
      {review.state ? (
        <Action
          label="Review my settlement"
          onPress={() =>
            router.push({
              pathname: "/expenses/personal-settlement-review",
              params: { journeyId: settlement.journeyId },
            } as never)
          }
        />
      ) : null}
      {settlement.isOrganizer &&
      !final &&
      settlement.preview?.state === "PREVIEW_READY" ? (
        <Action primary label="Confirm final amounts" onPress={confirm} />
      ) : settlement.isOrganizer && !final ? (
        <Action label="Check final readiness" onPress={() => void settlement.prepare()} />
      ) : null}
      {final ? (
        <Action
          label={settlement.isOrganizer ? "Make corrections" : "Settlement history"}
          onPress={() =>
            router.push({
              pathname: "/expenses/settlement-adjustment",
              params: { journeyId: settlement.journeyId },
            } as never)
          }
        />
      ) : null}
    </View>
  );
}

function ExpenseSection({
  actorMemberId,
  categories,
  empty,
  expanded,
  journeyId,
  memberId,
  members,
  onExpand,
  onMember,
  organizer,
  shares = false,
  title,
  totalLabel,
}: {
  actorMemberId: string | null;
  categories: SettlementCategory[];
  empty: string;
  expanded: string | null;
  journeyId: string;
  memberId: string | null;
  members: { id: string; label: string }[];
  onExpand: (value: string | null) => void;
  onMember: (value: string) => void;
  organizer: boolean;
  shares?: boolean;
  title: string;
  totalLabel: string;
}) {
  const first = categories[0]?.rows[0];
  const total = categories.reduce((sum, category) => sum + category.totalMinor, 0);
  const count = categories.reduce((sum, category) => sum + category.rows.length, 0);
  const currency = first?.settlementCurrency ?? "NZD";
  const scale = first?.settlementScale ?? 2;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {organizer ? (
        <MemberSelector
          actorMemberId={actorMemberId}
          members={members}
          selected={memberId}
          onSelect={onMember}
        />
      ) : null}
      <View style={styles.summaryCard}>
        <Text style={styles.eyebrow}>{totalLabel.toUpperCase()}</Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.summaryAmount}>
          {formatLedgerMoney(total, currency, scale)}
        </Text>
        <Text style={styles.meta}>
          {shares ? "Across" : "From"} {count} valued shared{" "}
          {count === 1 ? "expense" : "expenses"}
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
        label="View all expenses"
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
  isOrganizer,
  journeyId,
  members,
  onEveryone,
  onExpandTransfer,
  payments,
  scale,
  transfers,
}: {
  actorMemberId: string | null;
  currency: string;
  everyone: boolean;
  expandedTransfer: string | null;
  isOrganizer: boolean;
  journeyId: string;
  members: { id: string; label: string }[];
  onEveryone: (value: boolean) => void;
  onExpandTransfer: (value: string | null) => void;
  payments: LocalPersonalPayment[];
  scale: number;
  transfers: ReturnType<typeof currentSettlementTransfers>;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Payments
        </Text>
        {isOrganizer ? <Toggle everyone={everyone} onChange={onEveryone} /> : null}
      </View>
      <Text style={styles.subheading}>Recommended transfers</Text>
      <Text style={styles.secondaryNote}>
        Calculated from expenses and shares. Personal records below do not change these
        amounts.
      </Text>
      {transfers.map((transfer, index) => {
        const key =
          transfer.id ?? `${transfer.fromMemberId}-${transfer.toMemberId}-${index}`;
        const open = expandedTransfer === key;
        const from = memberName(members, transfer.fromMemberId);
        const to = memberName(members, transfer.toMemberId);
        return (
          <View key={key} style={styles.transferCard}>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                transfer.id
                  ? router.push({
                      pathname: "/expenses/transfer/[id]",
                      params: { id: transfer.id, journeyId },
                    } as never)
                  : onExpandTransfer(open ? null : key)
              }
              style={styles.transferRow}
            >
              <Text numberOfLines={1} style={styles.transferMember}>
                {transfer.fromMemberId === actorMemberId ? "You" : from}
              </Text>
              <Text style={styles.arrow}>→</Text>
              <Text style={styles.transferAmount}>
                {formatLedgerMoney(transfer.amount.minor, currency, scale)}
              </Text>
              <Text style={styles.arrow}>→</Text>
              <Text numberOfLines={1} style={[styles.transferMember, styles.alignRight]}>
                {transfer.toMemberId === actorMemberId ? "You" : to}
              </Text>
            </Pressable>
            {open ? (
              <PersonalPaymentSection
                actorMemberId={actorMemberId}
                from={{ id: transfer.fromMemberId, name: from }}
                journeyId={journeyId}
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
      <Text style={styles.subheading}>Personal payment records</Text>
      {payments.map((record) => (
        <View key={record.id} style={styles.personalRecord}>
          <Text style={styles.rowTitle}>
            {record.ownerMemberId === actorMemberId
              ? "Your record"
              : `${memberName(members, record.ownerMemberId)}'s record`}
          </Text>
          <Text style={styles.body}>
            {record.direction === "PAID" ? "Paid" : "Received"}{" "}
            {formatLedgerMoney(record.amountMinor, record.currency, record.scale)}
          </Text>
          <Text style={styles.meta}>
            With {memberName(members, record.counterpartyMemberId)} ·{" "}
            {record.occurredAt.slice(0, 10)}
          </Text>
        </View>
      ))}
      {!payments.length ? (
        <Text style={styles.empty}>No personal payment records. Nothing is missing.</Text>
      ) : null}
      {transfers.some((transfer) => transfer.legacyPaymentCount) ? (
        <View style={styles.legacy}>
          <Text style={styles.subheading}>Previous confirmed payment history</Text>
          <Text style={styles.meta}>
            Legacy confirmed-transfer records remain separate and are available from
            Transfer detail.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function MemberSelector({
  actorMemberId,
  members,
  selected,
  onSelect,
}: {
  actorMemberId: string | null;
  members: { id: string; label: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.memberSelector}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {members.map((member) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: member.id === selected }}
          key={member.id}
          onPress={() => onSelect(member.id)}
          style={[styles.memberChip, member.id === selected && styles.memberChipActive]}
        >
          <Text
            numberOfLines={1}
            style={[styles.memberText, member.id === selected && styles.memberTextActive]}
          >
            {member.id === actorMemberId ? "Me" : member.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
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
  eyebrow: { color: "#0F766E", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  grow: { flex: 1, gap: 3 },
  hero: { backgroundColor: "#E7F5F2", borderRadius: 18, gap: 6, padding: 18 },
  heroAmount: { color: "#0F172A", fontSize: 36, fontWeight: "900" },
  heroLabel: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  legacy: {
    borderTopColor: "#CBD5E1",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingTop: 14,
  },
  link: { color: "#0F766E", fontSize: 14, fontWeight: "800" },
  memberChip: {
    borderColor: "#CBD5E1",
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 150,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  memberChipActive: { backgroundColor: "#0F766E", borderColor: "#0F766E" },
  memberSelector: { gap: 8, paddingVertical: 2 },
  memberText: { color: "#334155", fontWeight: "700" },
  memberTextActive: { color: "#FFFFFF" },
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
    zIndex: 2,
  },
  navContent: { paddingHorizontal: 12 },
  navItem: {
    borderBottomColor: "transparent",
    borderBottomWidth: 3,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  navItemActive: { borderBottomColor: "#0F766E" },
  navText: { color: "#64748B", fontSize: 15, fontWeight: "700" },
  navTextActive: { color: "#0F766E" },
  notice: { backgroundColor: "#FFF7ED", borderRadius: 12, gap: 6, padding: 14 },
  noticeTitle: { color: "#9A3412", fontSize: 16, fontWeight: "800" },
  personalRecord: { backgroundColor: "#FFFFFF", borderRadius: 12, gap: 4, padding: 14 },
  rowAmount: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  rowTitle: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  secondaryNote: { color: "#64748B", fontSize: 13, lineHeight: 19 },
  section: { gap: 12, paddingHorizontal: 16, paddingTop: 24 },
  sectionTitle: { color: "#0F172A", fontSize: 23, fontWeight: "900" },
  sections: { paddingBottom: 24 },
  subheading: { color: "#0F172A", fontSize: 18, fontWeight: "800", marginTop: 4 },
  summaryAmount: { color: "#0F172A", fontSize: 28, fontWeight: "900" },
  summaryCard: { backgroundColor: "#F1F5F9", borderRadius: 14, gap: 5, padding: 16 },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  toggle: {
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
