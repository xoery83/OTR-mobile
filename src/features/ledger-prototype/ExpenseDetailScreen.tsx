import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { prototypeMembers } from "./fixtures";
import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import {
  formatMoney,
  Icon,
  NavigationRow,
  PrimaryButton,
  PrototypeBanner,
  Section,
  Separator,
  StatusPill,
  ValueBlock,
} from "./ui";

const memberName = (id: string) =>
  prototypeMembers.find((member) => member.id === id)?.shortName ?? id;

export function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { expenses, resolveConflict, updateExpenseTitle } = useLedgerPrototype();
  const expense = expenses.find((item) => item.id === id);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(expense?.title ?? "");

  if (!expense) {
    return (
      <View style={styles.center}>
        <Text style={styles.detail}>This prototype expense is no longer available.</Text>
      </View>
    );
  }

  const saveTitle = () => {
    if (title.trim()) updateExpenseTitle(expense.id, title.trim());
    setEditing(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityLabel={editing ? "Save edit" : "Edit expense"}
              accessibilityRole="button"
              hitSlop={10}
              onPress={editing ? saveTitle : () => setEditing(true)}
              style={styles.headerButton}
            >
              <Text style={styles.headerText}>{editing ? "Done" : "Edit"}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <PrototypeBanner />
        <View style={styles.titleArea}>
          {editing ? (
            <TextInput
              autoFocus
              onChangeText={setTitle}
              style={styles.titleInput}
              value={title}
            />
          ) : (
            <Text style={styles.pageTitle}>{expense.title}</Text>
          )}
          <View style={styles.statusRow}>
            <StatusPill status={expense.status} />
            <Text style={styles.detail}> · {expense.occurredAt}</Text>
          </View>
        </View>

        {expense.status === "CONFLICT" ? (
          <View style={styles.conflict}>
            <View style={styles.conflictTitleRow}>
              <Icon color={colors.danger} name="exclamationmark.triangle.fill" />
              <Text style={styles.conflictTitle}>Financial conflict needs review</Text>
            </View>
            <Text style={styles.detail}>Your version: 4 people equally</Text>
            <Text style={styles.detail}>
              Journey version: Mia included by another editor
            </Text>
            <Text style={styles.conflictNote}>
              Participants and splits never use silent last-writer-wins.
            </Text>
            <PrimaryButton
              label="Review & Keep Journey Amount"
              onPress={() =>
                Alert.alert(
                  "Resolve conflict?",
                  "The participant decision and reason will be added to history.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Resolve", onPress: () => resolveConflict(expense.id) },
                  ],
                )
              }
            />
          </View>
        ) : null}

        <View style={styles.valueGrid}>
          <ValueBlock
            label="MERCHANT"
            value={formatMoney(expense.merchant.minor, expense.merchant.currency)}
            style={styles.value}
          />
          <ValueBlock
            detail="Group settlement"
            label="JOURNEY VALUE"
            value={formatMoney(expense.settlement.minor, expense.settlement.currency)}
            style={styles.value}
          />
        </View>
        {expense.paymentRecord ? (
          <ValueBlock
            detail={`${expense.paymentRecord.instrumentLabel} · posted ${expense.paymentRecord.postedDate}`}
            label="ACTUAL PAYER COST"
            tone="warning"
            value={formatMoney(
              expense.paymentRecord.posted.minor,
              expense.paymentRecord.posted.currency,
            )}
          />
        ) : null}

        <Section title="Who owes what">
          {expense.splits.map((split, index) => (
            <View key={split.memberId}>
              {index > 0 ? <Separator /> : null}
              <View style={styles.splitRow}>
                <Text style={styles.rowLabel}>{memberName(split.memberId)}</Text>
                <View style={styles.right}>
                  <Text style={styles.rowValue}>
                    {formatMoney(split.settlementMinor, expense.settlement.currency)}
                  </Text>
                  <Text style={styles.detail}>
                    {formatMoney(split.merchantMinor, expense.merchant.currency)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </Section>

        <Section title="Evidence & valuation">
          <NavigationRow
            icon="arrow.triangle.2.circlepath"
            label="Group valuation"
            value={expense.rateLabel}
          />
          {expense.paymentRecord ? (
            <>
              <Separator />
              <NavigationRow
                icon="creditcard.fill"
                label="Payment evidence"
                value={expense.paymentRecord.instrumentLabel}
              />
            </>
          ) : null}
          <Separator />
          <NavigationRow
            icon="doc.text"
            label="Receipt"
            value={expense.receiptAttached ? "Attached" : "None"}
          />
        </Section>

        <Section title="History">
          {expense.audit.map((event, index) => (
            <View key={event.id}>
              {index > 0 ? <Separator /> : null}
              <View style={styles.auditRow}>
                <Icon color={colors.blue} name="clock.arrow.circlepath" />
                <View style={styles.grow}>
                  <Text style={styles.rowLabel}>{event.title}</Text>
                  <Text style={styles.detail}>
                    {event.detail} · {event.at}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </Section>
        <NavigationRow
          destructive
          icon="trash"
          label="Delete expense…"
          onPress={() =>
            Alert.alert(
              "Prototype only",
              "A real deletion would create a reversible tombstone and audit event. Nothing was deleted here.",
            )
          }
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 16, paddingBottom: 40 },
  center: { alignItems: "center", flex: 1, justifyContent: "center", padding: 30 },
  grow: { flex: 1 },
  headerButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  headerText: { color: colors.accent, fontSize: 17 },
  titleArea: { gap: 8 },
  pageTitle: { color: colors.label, fontSize: 30, fontWeight: "700" },
  titleInput: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.label,
    fontSize: 24,
    fontWeight: "600",
    minHeight: 52,
    paddingHorizontal: 12,
  },
  statusRow: { alignItems: "center", flexDirection: "row" },
  detail: { color: colors.secondaryLabel, fontSize: 14, lineHeight: 19 },
  conflict: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 9,
    padding: 14,
  },
  conflictTitleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  conflictTitle: { color: colors.danger, fontSize: 17, fontWeight: "700" },
  conflictNote: { color: colors.danger, fontSize: 14, fontWeight: "600" },
  valueGrid: { flexDirection: "row", gap: 10 },
  value: { flex: 1 },
  splitRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  rowLabel: { color: colors.label, flex: 1, fontSize: 16 },
  right: { alignItems: "flex-end" },
  rowValue: { color: colors.label, fontSize: 16, fontWeight: "600" },
  auditRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    padding: 14,
  },
});
