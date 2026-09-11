import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { type Href, router } from "expo-router";

import { prototypeMembers } from "./fixtures";
import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import { formatMoney, Icon, PrototypeBanner, StatusPill } from "./ui";

const filters = ["All", "Food", "Transport", "Receipts", "Needs attention"] as const;

export function ExpenseSearchScreen() {
  const { expenses } = useLedgerPrototype();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const results = useMemo(
    () =>
      expenses.filter((expense) => {
        const payer =
          prototypeMembers.find((member) => member.id === expense.payerMemberId)
            ?.shortName ?? "";
        const matchesQuery =
          `${expense.title} ${expense.category} ${payer} ${expense.location ?? ""}`
            .toLowerCase()
            .includes(query.trim().toLowerCase());
        const matchesFilter =
          filter === "All" ||
          (filter === "Food" && expense.category === "Food & Drink") ||
          (filter === "Transport" && expense.category === "Transport") ||
          (filter === "Receipts" && expense.receiptAttached) ||
          (filter === "Needs attention" && expense.status !== "SYNCED");
        return matchesQuery && matchesFilter;
      }),
    [expenses, filter, query],
  );

  return (
    <View style={styles.flex}>
      <View style={styles.searchWrap}>
        <Icon color={colors.secondaryLabel} name="magnifyingglass" />
        <TextInput
          accessibilityLabel="Search expenses"
          autoCapitalize="none"
          autoFocus
          onChangeText={setQuery}
          placeholder="Merchant, place, payer, member…"
          placeholderTextColor={colors.tertiaryLabel}
          returnKeyType="search"
          style={styles.input}
          value={query}
        />
        {query ? (
          <Pressable
            accessibilityLabel="Clear search"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => setQuery("")}
          >
            <Icon color={colors.secondaryLabel} name="xmark.circle.fill" />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <PrototypeBanner />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map((item) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: filter === item }}
              key={item}
              onPress={() => setFilter(item)}
              style={[styles.filter, filter === item ? styles.filterSelected : null]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item ? styles.filterTextSelected : null,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.summary}>
          <Text style={styles.summaryText}>{results.length} results</Text>
          <Text style={styles.summaryText}>
            Filtered total{" "}
            {formatMoney(
              results.reduce((sum, expense) => sum + expense.settlement.minor, 0),
              "NZD",
            )}
          </Text>
        </View>
        <View style={styles.surface}>
          {results.map((expense, index) => (
            <View key={expense.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/expenses/expense/${expense.id}` as Href)}
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
              >
                <View style={styles.grow}>
                  <Text style={styles.title}>{expense.title}</Text>
                  <Text style={styles.meta}>
                    {expense.category} · {expense.occurredAt}
                  </Text>
                  {expense.status !== "SYNCED" ? (
                    <StatusPill status={expense.status} />
                  ) : null}
                </View>
                <Text style={styles.amount}>
                  {formatMoney(expense.settlement.minor, "NZD")}
                </Text>
                <Icon name="chevron.right" size={13} />
              </Pressable>
            </View>
          ))}
          {results.length === 0 ? (
            <View style={styles.empty}>
              <Icon color={colors.secondaryLabel} name="magnifyingglass" size={28} />
              <Text style={styles.meta}>No matching expenses</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchWrap: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  input: { color: colors.label, flex: 1, fontSize: 17, minHeight: 44 },
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  filters: { gap: 8 },
  filter: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  filterSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  filterText: { color: colors.label, fontSize: 14, fontWeight: "600" },
  filterTextSelected: { color: colors.accent },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  summaryText: { color: colors.secondaryLabel, fontSize: 13 },
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  separator: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    padding: 14,
  },
  pressed: { opacity: 0.6 },
  grow: { flex: 1 },
  title: { color: colors.label, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, marginTop: 3 },
  amount: { color: colors.label, fontSize: 16, fontWeight: "700" },
  empty: { alignItems: "center", gap: 8, padding: 40 },
});
