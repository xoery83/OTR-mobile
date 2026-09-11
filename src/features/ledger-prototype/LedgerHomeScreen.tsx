import { useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { type Href, router, Stack } from "expo-router";

import { prototypeMembers } from "./fixtures";
import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import type { PrototypeExpense, PrototypeSettlementTransfer } from "./types";
import {
  formatMoney,
  Icon,
  PrimaryButton,
  PrototypeBanner,
  StatusPill,
  ValueBlock,
} from "./ui";

type LedgerModule = "spending" | "settlement";
type SpendingScope = "mine" | "group";

const categories = [
  { label: "Food & Drink", percent: 32, amount: 58960, color: colors.accent },
  { label: "Accommodation", percent: 28, amount: 51590, color: colors.blue },
  { label: "Transport", percent: 19, amount: 35010, color: colors.warning },
  { label: "Tickets", percent: 13, amount: 23950, color: "#7748A8" },
];

const memberName = (id: string) =>
  prototypeMembers.find((member) => member.id === id)?.shortName ?? "Traveller";
const transferHref = (id: string) => `/expenses/transfer/${id}` as Href;

function SegmentedControl<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: { id: T; label: string }[];
  selected: T;
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.segmented}>
      {options.map((option) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: selected === option.id }}
          key={option.id}
          onPress={() => onChange(option.id)}
          style={[styles.segment, selected === option.id ? styles.segmentSelected : null]}
        >
          <Text
            style={[
              styles.segmentText,
              selected === option.id ? styles.segmentTextSelected : null,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ExpenseRow({
  expense,
  onLongPress,
}: {
  expense: PrototypeExpense;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint="Opens expense details"
      accessibilityLabel={`${expense.title}, ${formatMoney(expense.merchant.minor, expense.merchant.currency)}, ${expense.status.toLowerCase()}`}
      accessibilityRole="button"
      onLongPress={onLongPress}
      onPress={() => router.push(`/expenses/expense/${expense.id}` as Href)}
      style={({ pressed }) => [styles.expenseRow, pressed ? styles.pressed : null]}
    >
      <View style={styles.categoryIcon}>
        <Icon
          color={colors.accent}
          name={
            expense.category === "Transport"
              ? "car.fill"
              : expense.category === "Tickets"
                ? "ticket.fill"
                : "fork.knife"
          }
          size={19}
        />
      </View>
      <View style={styles.grow}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {expense.title}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {memberName(expense.payerMemberId)} paid · {expense.splitLabel}
        </Text>
        {expense.status !== "SYNCED" ? <StatusPill status={expense.status} /> : null}
      </View>
      <View style={styles.amountColumn}>
        <Text style={styles.rowAmount}>
          {formatMoney(expense.merchant.minor, expense.merchant.currency)}
        </Text>
        {expense.merchant.currency !== "NZD" ? (
          <Text style={styles.rowMeta}>
            {formatMoney(expense.settlement.minor, "NZD")}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron.right" size={13} />
    </Pressable>
  );
}

function TransferRow({ transfer }: { transfer: PrototypeSettlementTransfer }) {
  const confirmed = transfer.payments
    .filter((payment) => payment.status === "CONFIRMED")
    .reduce((sum, payment) => sum + payment.dischargedAmount.minor, 0);
  const waiting = transfer.payments.some(
    (payment) => payment.status === "AWAITING_CONFIRMATION",
  );
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(transferHref(transfer.id))}
      style={({ pressed }) => [styles.transferRow, pressed ? styles.pressed : null]}
    >
      <Icon
        color={
          transfer.status === "SETTLED"
            ? colors.accent
            : waiting
              ? colors.warning
              : colors.blue
        }
        name={
          transfer.status === "SETTLED"
            ? "checkmark.circle.fill"
            : waiting
              ? "clock.badge.exclamationmark.fill"
              : "arrow.right.circle.fill"
        }
        size={24}
      />
      <View style={styles.grow}>
        <Text style={styles.rowTitle}>
          {transfer.from} pays {transfer.to}
        </Text>
        <Text style={styles.rowMeta}>
          {transfer.status === "SETTLED"
            ? "Both sides confirmed"
            : waiting
              ? "Waiting for recipient confirmation"
              : confirmed > 0
                ? `${formatMoney(confirmed, "NZD")} confirmed`
                : "Not paid"}
        </Text>
      </View>
      <Text style={styles.rowAmount}>
        {formatMoney(transfer.amount.minor, transfer.amount.currency)}
      </Text>
      <Icon name="chevron.right" size={13} />
    </Pressable>
  );
}

export function LedgerHomeScreen() {
  const {
    duplicateExpense,
    expenses,
    journeys,
    selectedJourney,
    selectJourney,
    transfers,
  } = useLedgerPrototype();
  const [module, setModule] = useState<LedgerModule>("spending");
  const [scope, setScope] = useState<SpendingScope>("mine");
  const hasDetailedFixture = selectedJourney.id === "europe-2026";

  const chooseLedger = () => {
    const labels = journeys.map(
      (journey) =>
        `${journey.status === "ACTIVE" ? "● " : ""}${journey.title} · ${journey.dates}`,
    );
    const stage2Index = labels.length + 1;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        cancelButtonIndex: labels.length + 2,
        options: [
          ...labels,
          "My Ledger · All journeys",
          "Stage 2 Expense Validation",
          "Cancel",
        ],
        title: "Choose ledger · 2 active journeys",
      },
      (index) => {
        const journey = journeys[index];
        if (journey) selectJourney(journey.id);
        if (index === journeys.length) router.push("/expenses/all-journeys" as Href);
        if (index === stage2Index) router.push("/expenses/stage2" as Href);
      },
    );
  };

  const openContextMenu = (expense: PrototypeExpense) =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ["Cancel", "View details", "Duplicate locally", "Suggest correction"],
        cancelButtonIndex: 0,
        title: expense.title,
      },
      (index) => {
        if (index === 1) router.push(`/expenses/expense/${expense.id}` as Href);
        if (index === 2) duplicateExpense(expense.id);
        if (index === 3)
          Alert.alert(
            "Correction request saved",
            "The current financial record was not changed.",
          );
      },
    );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityLabel="Add expense"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => router.push("/expenses/new" as Href)}
              style={styles.headerButton}
            >
              <Icon color={colors.accent} name="plus" size={24} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <PrototypeBanner />
        <Pressable
          accessibilityHint="Choose a Journey ledger or open My Ledger"
          accessibilityRole="button"
          onPress={chooseLedger}
          style={({ pressed }) => [styles.contextButton, pressed ? styles.pressed : null]}
        >
          <View style={styles.grow}>
            <Text style={styles.contextTitle}>{selectedJourney.title}</Text>
            <Text style={styles.contextMeta}>
              {selectedJourney.dates} · {selectedJourney.memberCount} travellers ·{" "}
              {selectedJourney.settlementCurrency}
            </Text>
            <Text style={styles.activeHint}>2 journeys are active today</Text>
          </View>
          <Icon color={colors.accent} name="chevron.up.chevron.down" />
        </Pressable>
        <SegmentedControl
          options={[
            { id: "spending", label: "Spending" },
            { id: "settlement", label: "Settlement" },
          ]}
          selected={module}
          onChange={setModule}
        />

        {module === "spending" ? (
          <>
            <SegmentedControl
              options={[
                { id: "mine", label: "Mine" },
                { id: "group", label: "Group" },
              ]}
              selected={scope}
              onChange={setScope}
            />
            <ValueBlock
              detail={
                scope === "mine"
                  ? "Your exact allocated shares"
                  : "All Journey merchant spending"
              }
              label={scope === "mine" ? "MY TRIP COST" : "GROUP SPENDING"}
              value={formatMoney(
                scope === "mine"
                  ? selectedJourney.mySpendMinor
                  : selectedJourney.groupSpendMinor,
                selectedJourney.settlementCurrency,
              )}
            />
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>BY CATEGORY</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/expenses/analysis" as Href)}
                style={styles.textButton}
              >
                <Text style={styles.linkText}>See analysis</Text>
              </Pressable>
            </View>
            <View style={styles.surface}>
              {categories.map((category, index) => (
                <View key={category.label}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <View style={styles.categoryRow}>
                    <View style={styles.grow}>
                      <View style={styles.categoryHeading}>
                        <Text style={styles.rowTitle}>{category.label}</Text>
                        <Text style={styles.rowMeta}>
                          {formatMoney(
                            scope === "mine"
                              ? category.amount
                              : Math.round(category.amount * 3.48),
                            "NZD",
                          )}
                        </Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              backgroundColor: category.color,
                              width: `${category.percent}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <Text style={styles.percent}>{category.percent}%</Text>
                  </View>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/expenses/search" as Href)}
              style={({ pressed }) => [
                styles.searchButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Icon color={colors.secondaryLabel} name="magnifyingglass" />
              <Text style={styles.searchText}>Search and filter expenses</Text>
              <Icon name="slider.horizontal.3" />
            </Pressable>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>RECENT EXPENSES</Text>
              <Text style={styles.rowMeta}>
                {hasDetailedFixture ? `${expenses.length} entries` : "Summary fixture"}
              </Text>
            </View>
            {hasDetailedFixture ? (
              <View style={styles.surface}>
                {expenses.map((expense, index) => (
                  <View key={expense.id}>
                    {index > 0 ? <View style={styles.separatorIndented} /> : null}
                    <ExpenseRow
                      expense={expense}
                      onLongPress={() => openContextMenu(expense)}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Icon color={colors.secondaryLabel} name="tray" size={28} />
                <Text style={styles.emptyTitle}>
                  {selectedJourney.status === "UPCOMING"
                    ? "No expenses yet"
                    : "Detailed fixture not loaded"}
                </Text>
                <Text style={styles.rowMeta}>
                  The context switch is real; this prototype keeps full expense details in
                  Europe 2026.
                </Text>
              </View>
            )}
            <PrimaryButton
              icon="plus.circle.fill"
              label="Add Expense"
              onPress={() => router.push("/expenses/new" as Href)}
            />
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/expenses/balance" as Href)}
            >
              <ValueBlock
                accessory={<Icon color={colors.accent} name="chevron.right" />}
                detail="Tap for the expenses and transfers behind this number"
                label="YOUR POSITION"
                tone={selectedJourney.outstandingMinor >= 0 ? "positive" : "warning"}
                value={
                  selectedJourney.outstandingMinor >= 0
                    ? `You are owed ${formatMoney(selectedJourney.outstandingMinor, "NZD")}`
                    : `You owe ${formatMoney(Math.abs(selectedJourney.outstandingMinor), "NZD")}`
                }
              />
            </Pressable>
            {hasDetailedFixture ? (
              <>
                <View style={styles.attention}>
                  <Icon color={colors.danger} name="exclamationmark.triangle.fill" />
                  <View style={styles.grow}>
                    <Text style={styles.attentionTitle}>1 conflict needs review</Text>
                    <Text style={styles.rowMeta}>Settlement cannot finalize yet</Text>
                  </View>
                </View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>TRANSFERS</Text>
                  <Text style={styles.rowMeta}>Paid + received confirmation</Text>
                </View>
                <View style={styles.surface}>
                  {transfers.map((transfer, index) => (
                    <View key={transfer.id}>
                      {index > 0 ? <View style={styles.separatorIndented} /> : null}
                      <TransferRow transfer={transfer} />
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {selectedJourney.outstandingMinor === 0
                    ? "This Journey is settled"
                    : "Settlement summary"}
                </Text>
                <Text style={styles.rowMeta}>
                  Open the detailed Europe 2026 fixture to review partial payments.
                </Text>
              </View>
            )}
            <PrimaryButton
              icon="arrow.left.arrow.right.circle.fill"
              label="Open Full Settlement"
              onPress={() => router.push("/expenses/settlement" as Href)}
            />
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 16, paddingBottom: 36 },
  grow: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.6 },
  headerButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  contextButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 76,
    padding: 14,
  },
  contextTitle: { color: colors.label, fontSize: 20, fontWeight: "700" },
  contextMeta: { color: colors.secondaryLabel, fontSize: 14, marginTop: 3 },
  activeHint: { color: colors.accent, fontSize: 12, fontWeight: "600", marginTop: 5 },
  segmented: {
    backgroundColor: "#E3E3E8",
    borderRadius: 8,
    flexDirection: "row",
    padding: 2,
  },
  segment: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    justifyContent: "center",
    minHeight: 38,
  },
  segmentSelected: { backgroundColor: colors.surface },
  segmentText: { color: colors.secondaryLabel, fontSize: 15, fontWeight: "600" },
  segmentTextSelected: { color: colors.label },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 30,
    paddingHorizontal: 4,
  },
  sectionTitle: { color: colors.secondaryLabel, fontSize: 13 },
  textButton: { justifyContent: "center", minHeight: 44 },
  linkText: { color: colors.blue, fontSize: 16, fontWeight: "600" },
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  separator: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
  separatorIndented: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
  },
  categoryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 62,
    padding: 12,
  },
  categoryHeading: { flexDirection: "row", justifyContent: "space-between" },
  barTrack: {
    backgroundColor: "#E9E9ED",
    borderRadius: 3,
    height: 6,
    marginTop: 8,
    overflow: "hidden",
  },
  barFill: { borderRadius: 3, height: 6 },
  percent: { color: colors.secondaryLabel, fontSize: 14, width: 35 },
  searchButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  searchText: { color: colors.secondaryLabel, flex: 1, fontSize: 16 },
  expenseRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryIcon: {
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    borderRadius: 7,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  rowTitle: { color: colors.label, fontSize: 16, fontWeight: "600" },
  rowMeta: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 },
  amountColumn: { alignItems: "flex-end", gap: 3 },
  rowAmount: { color: colors.label, fontSize: 16, fontWeight: "700" },
  emptyState: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 28,
  },
  emptyTitle: { color: colors.label, fontSize: 17, fontWeight: "600" },
  attention: {
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 62,
    padding: 14,
  },
  attentionTitle: { color: colors.danger, fontSize: 16, fontWeight: "700" },
  transferRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 68,
    padding: 12,
  },
});
