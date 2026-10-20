import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import type { PrototypeDraft } from "./types";
import {
  formatMoney,
  Icon,
  PrimaryButton,
  PrototypeBanner,
  Section,
  Separator,
  ValueBlock,
} from "./ui";

const rates: Record<string, number> = { EUR: 1.978, GBP: 2.286, CHF: 2.109, NZD: 1 };
const policies: {
  id: PrototypeDraft["valuationPolicy"];
  label: string;
  detail: string;
}[] = [
  {
    id: "REFERENCE_RATE",
    label: "Journey reference rate",
    detail: "Fair shared valuation captured with the expense",
  },
  {
    id: "ACTUAL_PAYER_COST",
    label: "Actual payer posted cost",
    detail: "Use card/bank evidence for group settlement",
  },
  {
    id: "SAME_CURRENCY",
    label: "Same currency",
    detail: "No conversion when merchant and settlement currencies match",
  },
];

export function RateReviewScreen() {
  const { draft, updateDraft } = useLedgerPrototype();
  const merchantMinor = Math.round((Number(draft.amount) || 0) * 100);
  const referenceRate = rates[draft.currency] ?? 1.8;
  const postedRate = draft.currency === "NZD" ? 1 : referenceRate * 1.0082;
  const activeRate =
    draft.valuationPolicy === "ACTUAL_PAYER_COST" ? postedRate : referenceRate;
  const groupMinor = Math.round(merchantMinor * activeRate);

  const chooseCurrency = (currency: string) =>
    updateDraft({
      currency,
      valuationPolicy: currency === "NZD" ? "SAME_CURRENCY" : "REFERENCE_RATE",
    });

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <PrototypeBanner />
        <View style={styles.valueGrid}>
          <ValueBlock
            label="MERCHANT AMOUNT"
            value={formatMoney(merchantMinor, draft.currency)}
            style={styles.value}
          />
          <ValueBlock
            detail="Settlement currency"
            label="GROUP VALUE"
            tone="positive"
            value={formatMoney(groupMinor, "NZD")}
            style={styles.value}
          />
        </View>

        <Text style={styles.sectionLabel}>ORIGINAL CURRENCY · ISO 4217</Text>
        <View style={styles.currencyRow}>
          {["EUR", "NZD", "GBP", "CHF"].map((currency) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: currency === draft.currency }}
              key={currency}
              onPress={() => chooseCurrency(currency)}
              style={[
                styles.currencyButton,
                currency === draft.currency ? styles.currencySelected : null,
              ]}
            >
              <Text
                style={[
                  styles.currencyText,
                  currency === draft.currency ? styles.currencyTextSelected : null,
                ]}
              >
                {currency}
              </Text>
            </Pressable>
          ))}
        </View>

        <Section title="Settlement valuation">
          {policies.map((policy, index) => {
            const disabled = policy.id === "SAME_CURRENCY" && draft.currency !== "NZD";
            const selected = draft.valuationPolicy === policy.id;
            return (
              <View key={policy.id}>
                {index > 0 ? <Separator /> : null}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  onPress={() => updateDraft({ valuationPolicy: policy.id })}
                  style={({ pressed }) => [
                    styles.policyRow,
                    disabled ? styles.disabled : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <View style={styles.grow}>
                    <Text style={styles.title}>{policy.label}</Text>
                    <Text style={styles.detail}>{policy.detail}</Text>
                  </View>
                  <Icon
                    color={selected ? colors.accent : colors.tertiaryLabel}
                    name={selected ? "checkmark.circle.fill" : "circle"}
                    size={22}
                  />
                </Pressable>
              </View>
            );
          })}
        </Section>

        {draft.currency !== "NZD" ? (
          <Section title="Evidence preview">
            <View style={styles.evidenceRow}>
              <Icon color={colors.blue} name="creditcard.fill" size={24} />
              <View style={styles.grow}>
                <Text style={styles.title}>Visa NZ · posted estimate</Text>
                <Text style={styles.detail}>
                  {formatMoney(Math.round(merchantMinor * postedRate), "NZD")} · separate
                  from fair group value
                </Text>
              </View>
            </View>
          </Section>
        ) : null}
        <Text style={styles.footnote}>
          The original merchant amount is permanent. Card cost and group valuation remain
          separate financial facts.
        </Text>
      </ScrollView>
      <View style={styles.bottomBar}>
        <PrimaryButton label="Done" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 18, padding: 16, paddingBottom: 100 },
  grow: { flex: 1 },
  valueGrid: { flexDirection: "row", gap: 10 },
  value: { flex: 1 },
  sectionLabel: { color: colors.secondaryLabel, fontSize: 13, marginHorizontal: 4 },
  currencyRow: { flexDirection: "row", gap: 8 },
  currencyButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  currencySelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  currencyText: { color: colors.label, fontSize: 16, fontWeight: "600" },
  currencyTextSelected: { color: colors.accent },
  policyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    padding: 14,
  },
  pressed: { backgroundColor: "#E9E9ED" },
  disabled: { opacity: 0.35 },
  title: { color: colors.label, fontSize: 17, fontWeight: "600" },
  detail: { color: colors.secondaryLabel, fontSize: 14, lineHeight: 19, marginTop: 3 },
  evidenceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    padding: 14,
  },
  footnote: {
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
