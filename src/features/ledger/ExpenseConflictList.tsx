import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { getDefaultLedgerExpenseConflictRepository } from "@/data/repositories/ledgerExpenseConflictRepository";

export function ExpenseConflictList({
  journeyId,
  title = "Changes needing review",
}: {
  journeyId?: string;
  title?: string;
}) {
  const [items, setItems] = useState<
    Awaited<
      ReturnType<
        Awaited<ReturnType<typeof getDefaultLedgerExpenseConflictRepository>>["listOpen"]
      >
    >
  >([]);
  const generation = getAccountGeneration();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = () =>
        void getDefaultLedgerExpenseConflictRepository()
          .then((r) => r.listOpen(journeyId))
          .then((rows) => {
            if (active && generation === getAccountGeneration()) setItems(rows);
          })
          .catch(() => undefined);
      load();
      const timer = setInterval(load, 4000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [journeyId, generation]),
  );
  if (!items.length) return null;
  return (
    <View style={styles.list}>
      <Text accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Review changes to ${item.title}${item.deletedAt ? ", deletion needs review" : ""}`}
          onPress={() =>
            router.push({
              pathname: "/expenses/conflict/[id]",
              params: { id: item.id },
            } as never)
          }
          style={styles.row}
        >
          <Text style={styles.heading}>{item.title}</Text>
          <Text style={styles.body}>
            {item.deletedAt ? "Deletion needs review · " : ""}
            {item.conflictCount} saved change{item.conflictCount === 1 ? "" : "s"}
          </Text>
          <Text style={styles.link}>Review changes ›</Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  list: { gap: 12 },
  row: { padding: 16, backgroundColor: "#FFFBEB", borderRadius: 12, gap: 6 },
  heading: { fontSize: 17, fontWeight: "600", color: "#17272F" },
  body: { fontSize: 16, lineHeight: 23, color: "#475569" },
  link: { fontSize: 16, fontWeight: "600", color: "#0F766E" },
});
