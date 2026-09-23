import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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
  const current = settlement.lineage.at(-1) ?? settlement.finalized;

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

      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Settlement history
      </Text>
      {settlement.lineage.map((version, index) => (
        <Pressable
          accessibilityRole="button"
          key={version.id}
          onPress={() =>
            router.push({
              pathname: "/expenses/settlement-statement",
              params: { journeyId: settlement.journeyId, versionId: version.id },
            } as never)
          }
          style={styles.row}
        >
          <View style={styles.grow}>
            <Text style={styles.rowTitle}>
              {index === 0 ? "Previous confirmed settlement" : "Updated settlement"}
            </Text>
            <Text style={styles.meta}>
              {new Date(version.finalizedAt).toLocaleDateString()}
            </Text>
          </View>
          <Text style={styles.version}>#{(version.lineageSequence ?? 0) + 1}</Text>
        </Pressable>
      ))}

      {settlement.isOrganizer ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Correct an expense
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
              Add a reason before choosing the confirmed Expense to correct.
            </Text>
          ) : null}
          {(current?.inputs ?? []).map((input) => (
            <Pressable
              accessibilityRole="button"
              key={input.expenseId}
              onPress={() => {
                if (!reason.trim()) {
                  setReasonError(true);
                  reasonRef.current?.focus();
                  return;
                }
                Alert.alert(
                  "Correct this expense?",
                  "The original confirmed version will stay unchanged.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Continue",
                      onPress: () =>
                        router.push({
                          pathname: "/expenses/new",
                          params: {
                            expenseId: input.expenseId,
                            journeyId: settlement.journeyId,
                            correctionRootId: settlement.finalized!.id,
                            correctionReason: reason.trim(),
                          },
                        } as never),
                    },
                  ],
                );
              }}
              style={styles.row}
            >
              <View style={styles.grow}>
                <Text style={styles.rowTitle}>
                  {titles[input.expenseId] ?? "Expense"}
                </Text>
                <Text style={styles.meta}>Original confirmed version</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { color: "#7C2D12", fontSize: 15, lineHeight: 22 },
  chevron: { color: "#0F766E", fontSize: 24 },
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
  row: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  rowTitle: { color: "#0F172A", fontSize: 15, fontWeight: "700" },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800", marginTop: 6 },
  title: { color: "#7C2D12", fontSize: 18, fontWeight: "800" },
  version: { color: "#0F766E", fontWeight: "800" },
  warning: { backgroundColor: "#FFF7ED", borderRadius: 14, gap: 8, padding: 14 },
});
