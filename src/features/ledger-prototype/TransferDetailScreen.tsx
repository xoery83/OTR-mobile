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
import { useLocalSearchParams } from "expo-router";

import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import {
  formatMoney,
  Icon,
  PrimaryButton,
  PrototypeBanner,
  Section,
  Separator,
  ValueBlock,
} from "./ui";

type RolePreview = "PAYER" | "RECIPIENT";

export function TransferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { confirmTransferPayment, recordTransferPayment, transfers } =
    useLedgerPrototype();
  const transfer = transfers.find((item) => item.id === id);
  const [role, setRole] = useState<RolePreview>(
    transfer?.to === "Leon" ? "RECIPIENT" : "PAYER",
  );
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"NZD" | "EUR">("NZD");

  if (!transfer)
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Transfer not found.</Text>
      </View>
    );
  const confirmedMinor = transfer.payments
    .filter((payment) => payment.status === "CONFIRMED")
    .reduce((sum, payment) => sum + payment.dischargedAmount.minor, 0);
  const waitingMinor = transfer.payments
    .filter((payment) => payment.status === "AWAITING_CONFIRMATION")
    .reduce((sum, payment) => sum + payment.dischargedAmount.minor, 0);
  const remainingMinor = Math.max(0, transfer.amount.minor - confirmedMinor);
  const reportableMinor = Math.max(0, remainingMinor - waitingMinor);
  const inputMinor = Math.round((Number(amount) || 0) * 100);
  const dischargedMinor =
    currency === "NZD" ? inputMinor : Math.round(inputMinor * 1.978);
  const canRecord = inputMinor > 0 && dischargedMinor <= reportableMinor;

  const record = () => {
    if (!canRecord) return;
    recordTransferPayment(transfer.id, inputMinor, currency, dischargedMinor);
    setAmount("");
    Alert.alert(
      "Payment reported",
      `${transfer.to} must confirm receipt before this amount settles the debt.`,
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PrototypeBanner />
      <View style={styles.direction}>
        <View style={styles.person}>
          <Text style={styles.initial}>{transfer.from[0]}</Text>
          <Text style={styles.personName}>{transfer.from}</Text>
        </View>
        <View style={styles.arrow}>
          <Icon color={colors.accent} name="arrow.right" size={28} />
          <Text style={styles.meta}>pays</Text>
        </View>
        <View style={styles.person}>
          <Text style={styles.initial}>{transfer.to[0]}</Text>
          <Text style={styles.personName}>{transfer.to}</Text>
        </View>
      </View>
      <ValueBlock
        detail={`${formatMoney(waitingMinor, "NZD")} awaiting confirmation`}
        label="REMAINING OBLIGATION"
        tone={remainingMinor === 0 ? "positive" : "warning"}
        value={formatMoney(remainingMinor, "NZD")}
      />
      <View>
        <Text style={styles.sectionLabel}>PROTOTYPE ROLE PREVIEW</Text>
        <View accessibilityRole="tablist" style={styles.segmented}>
          {(["PAYER", "RECIPIENT"] as const).map((item) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: role === item }}
              key={item}
              onPress={() => setRole(item)}
              style={[styles.segment, role === item ? styles.selected : null]}
            >
              <Text
                style={[styles.segmentText, role === item ? styles.selectedText : null]}
              >
                {item === "PAYER" ? `As ${transfer.from}` : `As ${transfer.to}`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Section title="Payment history">
        {transfer.payments.length ? (
          transfer.payments.map((payment, index) => (
            <View key={payment.id}>
              {index > 0 ? <Separator /> : null}
              <View style={styles.paymentRow}>
                <Icon
                  color={payment.status === "CONFIRMED" ? colors.accent : colors.warning}
                  name={
                    payment.status === "CONFIRMED"
                      ? "checkmark.circle.fill"
                      : "clock.fill"
                  }
                />
                <View style={styles.grow}>
                  <Text style={styles.title}>
                    {formatMoney(
                      payment.paymentAmount.minor,
                      payment.paymentAmount.currency,
                    )}{" "}
                    paid
                  </Text>
                  <Text style={styles.meta}>
                    {formatMoney(payment.dischargedAmount.minor, "NZD")} debt discharged ·{" "}
                    {payment.paidAt}
                  </Text>
                  <Text
                    style={[
                      styles.state,
                      payment.status === "CONFIRMED" ? styles.confirmed : styles.waiting,
                    ]}
                  >
                    {payment.status === "CONFIRMED"
                      ? `Received · confirmed by ${payment.confirmedBy}`
                      : "Payer reported · awaiting recipient"}
                  </Text>
                </View>
                {role === "RECIPIENT" && payment.status === "AWAITING_CONFIRMATION" ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      Alert.alert(
                        "Confirm received?",
                        `Confirm that ${formatMoney(payment.paymentAmount.minor, payment.paymentAmount.currency)} arrived.`,
                        [
                          { text: "Not yet", style: "cancel" },
                          {
                            text: "Confirm",
                            onPress: () =>
                              confirmTransferPayment(transfer.id, payment.id),
                          },
                        ],
                      )
                    }
                    style={styles.confirmButton}
                  >
                    <Text style={styles.confirmText}>Confirm</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.meta}>No payment has been reported.</Text>
          </View>
        )}
      </Section>
      {role === "PAYER" && reportableMinor > 0 ? (
        <Section title="Report a payment">
          <View style={styles.currencyRow}>
            {(["NZD", "EUR"] as const).map((item) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: currency === item }}
                key={item}
                onPress={() => setCurrency(item)}
                style={[
                  styles.currencyButton,
                  currency === item ? styles.currencySelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.currencyText,
                    currency === item ? styles.currencyTextSelected : null,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Partial payment amount"
              keyboardType="decimal-pad"
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.tertiaryLabel}
              style={styles.input}
              value={amount}
            />
            <Text style={styles.inputCurrency}>{currency}</Text>
          </View>
          {currency === "EUR" && inputMinor > 0 ? (
            <Text style={styles.conversion}>
              Agreed discharge: {formatMoney(dischargedMinor, "NZD")} at 1 EUR = 1.978 NZD
            </Text>
          ) : null}
          <View style={styles.buttonPad}>
            <PrimaryButton
              disabled={!canRecord}
              icon="paperplane.fill"
              label="Mark as Paid"
              onPress={record}
            />
          </View>
        </Section>
      ) : null}
      {role === "PAYER" && reportableMinor === 0 && waitingMinor > 0 ? (
        <View style={styles.info}>
          <Icon color={colors.warning} name="clock.fill" />
          <Text style={styles.infoText}>
            The remaining amount is already reported. Wait for {transfer.to} to confirm
            receipt before recording another payment.
          </Text>
        </View>
      ) : null}
      {role === "RECIPIENT" &&
      !transfer.payments.some((payment) => payment.status === "AWAITING_CONFIRMATION") ? (
        <View style={styles.info}>
          <Icon color={colors.blue} name="info.circle.fill" />
          <Text style={styles.infoText}>
            {remainingMinor === 0
              ? "Both sides have confirmed every payment. This transfer is settled."
              : `Waiting for ${transfer.from} to report the next payment.`}
          </Text>
        </View>
      ) : null}
      <Text style={styles.note}>
        A reported payment does not reduce the confirmed balance until the other party
        acknowledges it. Offline actions remain pending and auditable.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 16, paddingBottom: 40 },
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  grow: { flex: 1 },
  direction: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  person: { alignItems: "center", gap: 6, width: 90 },
  initial: {
    backgroundColor: colors.accentSoft,
    borderRadius: 25,
    color: colors.accent,
    fontSize: 21,
    fontWeight: "800",
    height: 50,
    lineHeight: 50,
    overflow: "hidden",
    textAlign: "center",
    width: 50,
  },
  personName: { color: colors.label, fontSize: 17, fontWeight: "700" },
  arrow: { alignItems: "center" },
  sectionLabel: {
    color: colors.secondaryLabel,
    fontSize: 13,
    marginBottom: 7,
    marginHorizontal: 16,
  },
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
  selected: { backgroundColor: colors.surface },
  segmentText: { color: colors.secondaryLabel, fontSize: 14, fontWeight: "600" },
  selectedText: { color: colors.label },
  paymentRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 11,
    minHeight: 76,
    padding: 14,
  },
  title: { color: colors.label, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18, marginTop: 2 },
  state: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  confirmed: { color: colors.accent },
  waiting: { color: colors.warning },
  confirmButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 7,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  confirmText: { color: colors.surface, fontSize: 14, fontWeight: "700" },
  empty: { alignItems: "center", padding: 24 },
  currencyRow: { flexDirection: "row", gap: 8, padding: 12 },
  currencyButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  currencySelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  currencyText: { color: colors.label, fontSize: 15, fontWeight: "600" },
  currencyTextSelected: { color: colors.accent },
  inputRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    marginHorizontal: 14,
  },
  input: { color: colors.label, flex: 1, fontSize: 30, fontWeight: "700", minHeight: 64 },
  inputCurrency: { color: colors.secondaryLabel, fontSize: 17, fontWeight: "600" },
  conversion: { color: colors.secondaryLabel, fontSize: 13, paddingHorizontal: 14 },
  buttonPad: { padding: 12 },
  info: { alignItems: "flex-start", flexDirection: "row", gap: 10, paddingHorizontal: 4 },
  infoText: { color: colors.secondaryLabel, flex: 1, fontSize: 14, lineHeight: 20 },
  note: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
});
