import { useState } from "react";
import {
  ActionSheetIOS,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Switch,
  View,
} from "react-native";
import { type Href, router } from "expo-router";

import { prototypeMembers } from "./fixtures";
import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import { NavigationRow, PrimaryButton, PrototypeBanner, Section } from "./ui";

export function QuickExpenseScreen() {
  const { draft, saveDraft, updateDraft } = useLedgerPrototype();
  const [attempted, setAttempted] = useState(false);
  const payer = prototypeMembers.find((member) => member.id === draft.payerMemberId);
  const isValid = Boolean(draft.title.trim() && Number(draft.amount) > 0);

  const choosePayer = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        cancelButtonIndex: prototypeMembers.length,
        options: [...prototypeMembers.map((m) => m.shortName), "Cancel"],
        title: "Who paid?",
      },
      (index) => {
        const member = prototypeMembers[index];
        if (member) updateDraft({ payerMemberId: member.id });
      },
    );
  };

  const save = () => {
    setAttempted(true);
    const expense = saveDraft();
    if (!expense) return;
    router.dismiss();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <PrototypeBanner />
        <View style={styles.amountRow}>
          <TextInput
            accessibilityLabel="Expense amount"
            autoFocus
            keyboardType="decimal-pad"
            onChangeText={(amount) => updateDraft({ amount })}
            placeholder="0.00"
            placeholderTextColor={colors.tertiaryLabel}
            style={styles.amountInput}
            value={draft.amount}
          />
          <Text style={styles.currency}>{draft.currency}</Text>
        </View>
        <TextInput
          accessibilityLabel="Merchant or description"
          onChangeText={(title) => updateDraft({ title })}
          placeholder="What was it?"
          placeholderTextColor={colors.tertiaryLabel}
          returnKeyType="done"
          style={styles.titleInput}
          value={draft.title}
        />
        {attempted && !isValid ? (
          <Text style={styles.error}>Enter a description and amount.</Text>
        ) : null}

        <Section title="Details">
          <NavigationRow
            icon="person.crop.circle"
            label="Paid by"
            onPress={choosePayer}
            value={payer?.shortName}
          />
          <NavigationRow
            icon="person.3.fill"
            label="Split"
            onPress={() => router.push("/expenses/split" as Href)}
            value={`${draft.participantIds.length} travellers`}
          />
          <NavigationRow
            icon="arrow.triangle.2.circlepath"
            label="Currency & group value"
            onPress={() => router.push("/expenses/rate" as Href)}
            value={
              draft.valuationPolicy === "REFERENCE_RATE" ? "Journey rate" : "Posted cost"
            }
          />
          <NavigationRow
            icon="doc.text.viewfinder"
            label="Receipt"
            onPress={() => router.push("/expenses/receipt" as Href)}
            value={draft.receiptAttached ? "Attached" : "Add"}
          />
          <View style={styles.settlementRow}>
            <View style={styles.settlementCopy}>
              <Text style={styles.settlementLabel}>Include in group settlement</Text>
              {draft.settlementParticipation === "EXCLUDED" ? (
                <Text style={styles.hint}>
                  This expense is included in Spending and analysis but does not affect
                  who owes whom.
                </Text>
              ) : null}
            </View>
            <Switch
              accessibilityLabel="Include in group settlement"
              onValueChange={(included) =>
                updateDraft({
                  settlementParticipation: included ? "INCLUDED" : "EXCLUDED",
                })
              }
              value={draft.settlementParticipation === "INCLUDED"}
            />
          </View>
        </Section>

        <Text style={styles.hint}>
          Save now, enrich later. This prototype never sends data to a server.
        </Text>
      </ScrollView>
      <View style={styles.bottomBar}>
        <PrimaryButton
          disabled={!isValid}
          icon="checkmark"
          label="Save Expense"
          onPress={save}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 18, padding: 16, paddingBottom: 110 },
  amountRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  amountInput: {
    color: colors.label,
    flex: 1,
    fontSize: 46,
    fontWeight: "700",
    minHeight: 70,
  },
  currency: { color: colors.secondaryLabel, fontSize: 23, fontWeight: "600" },
  titleInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.label,
    fontSize: 20,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  error: { color: colors.danger, fontSize: 14 },
  settlementRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settlementCopy: { flex: 1, gap: 3 },
  settlementLabel: { color: colors.label, fontSize: 16, fontWeight: "600" },
  hint: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  bottomBar: {
    backgroundColor: colors.groupedBackground,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
    paddingBottom: 18,
  },
});
