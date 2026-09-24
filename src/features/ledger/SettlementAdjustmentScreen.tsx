import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { useStage7Settlement } from "@/hooks/useStage7Settlement";

export function SettlementAdjustmentScreen() {
  const { journeyId } = useLocalSearchParams<{ journeyId?: string }>();
  const settlement = useStage7Settlement(journeyId);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const reasonRef = useRef<TextInput>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);
  const current = settlement.lineage.at(-1) ?? settlement.finalized;
  const visibleInputs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return current?.inputs ?? [];
    return (current?.inputs ?? []).filter((input) =>
      [titles[input.expenseId], input.payer.displayNameSnapshot]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(needle)),
    );
  }, [current, query, titles]);

  useEffect(() => {
    let active = true;
    void Promise.all(
      (current?.inputs ?? []).map(async (input) => {
        const expense = await (
          await getDefaultLedgerExpenseRepository()
        ).getExpense(input.expenseId);
        return [input.expenseId, expense?.title ?? "Expense"] as const;
      }),
    ).then((items) => {
      if (active) setTitles(Object.fromEntries(items));
    });
    return () => {
      active = false;
    };
  }, [current]);

  if (!settlement.finalized) {
    return <Text style={styles.empty}>No confirmed settlement is available.</Text>;
  }

  const selected = current?.inputs.find((input) => input.expenseId === selectedExpenseId);
  const openCorrection = () => {
    if (!selected) return;
    if (!reason.trim()) {
      setReasonError(true);
      reasonRef.current?.focus();
      return;
    }
    router.push({
      pathname: "/expenses/new",
      params: {
        expenseId: selected.expenseId,
        journeyId: settlement.journeyId,
        correctionRootId: settlement.finalized!.id,
        correctionReason: reason.trim(),
      },
    } as never);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.warning}>
        <Text accessibilityRole="header" style={styles.title}>
          This settlement has already been confirmed.
        </Text>
        <Text style={styles.body}>
          You can make corrections, but the previous confirmed settlement will remain in
          history. Any changes will create an updated settlement.
        </Text>
      </View>

      {settlement.isOrganizer ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            1. Choose a confirmed expense
          </Text>
          <TextInput
            accessibilityLabel="Search confirmed expenses"
            onChangeText={setQuery}
            placeholder="Search by expense or payer"
            style={styles.search}
            value={query}
          />
          {visibleInputs.map((input) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: selectedExpenseId === input.expenseId }}
              key={input.expenseId}
              onPress={() => setSelectedExpenseId(input.expenseId)}
              style={[
                styles.row,
                selectedExpenseId === input.expenseId && styles.selectedRow,
              ]}
            >
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>
                  {titles[input.expenseId] ?? "Expense"}
                </Text>
                <Text style={styles.meta}>Paid by {input.payer.displayNameSnapshot}</Text>
              </View>
              <Text style={styles.version}>
                {selectedExpenseId === input.expenseId ? "Selected" : "Choose"}
              </Text>
            </Pressable>
          ))}
          {!visibleInputs.length ? (
            <Text style={styles.meta}>No confirmed expenses match this search.</Text>
          ) : null}

          {selected ? (
            <>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                2. Add the correction reason
              </Text>
              <TextInput
                accessibilityLabel="Reason for correction"
                multiline
                onChangeText={(value) => {
                  setReason(value);
                  if (value.trim()) setReasonError(false);
                }}
                placeholder="Why is this correction needed?"
                ref={reasonRef}
                style={styles.input}
                value={reason}
              />
              {reasonError ? (
                <Text accessibilityLiveRegion="polite" style={styles.error}>
                  Add a reason before opening the correction editor.
                </Text>
              ) : null}

              <Text accessibilityRole="header" style={styles.sectionTitle}>
                3. Open and correct
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={openCorrection}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>Open expense to correct</Text>
              </Pressable>
              <Text style={styles.meta}>
                The original confirmed version stays unchanged. If another member has the
                correct details, ask them to send those details to the organizer, who
                records the protected successor here.
              </Text>
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { color: "#7C2D12", fontSize: 15, lineHeight: 22 },
  content: { gap: 12, padding: 16, paddingBottom: 40 },
  empty: { color: "#64748B", padding: 20 },
  error: { color: "#B91C1C", fontSize: 14, fontWeight: "700" },
  grow: { flex: 1, gap: 3 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 80,
    padding: 12,
    textAlignVertical: "top",
  },
  meta: { color: "#64748B", fontSize: 13 },
  primary: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 16,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  rowTitle: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  search: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  selectedRow: { borderColor: "#0F766E", borderWidth: 2 },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800", marginTop: 6 },
  title: { color: "#7C2D12", fontSize: 18, fontWeight: "800" },
  version: { color: "#0F766E", fontWeight: "800" },
  warning: { backgroundColor: "#FFF7ED", borderRadius: 14, gap: 8, padding: 14 },
});
