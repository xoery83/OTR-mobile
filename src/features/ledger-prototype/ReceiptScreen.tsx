import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { useLedgerPrototype } from "./LedgerPrototypeProvider";
import { colors } from "./theme";
import { Icon, PrimaryButton, PrototypeBanner } from "./ui";

export function ReceiptScreen() {
  const { applyReceiptFixture, draft, updateDraft } = useLedgerPrototype();

  const useSample = () => {
    applyReceiptFixture();
    Alert.alert(
      "Receipt scanned",
      "Amount, currency and merchant were filled into the draft. Review them before saving.",
      [{ text: "Review draft", onPress: () => router.back() }],
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PrototypeBanner />
      <View style={styles.captureActions}>
        <Pressable
          accessibilityRole="button"
          onPress={useSample}
          style={({ pressed }) => [styles.captureButton, pressed ? styles.pressed : null]}
        >
          <Icon color={colors.surface} name="camera.fill" size={27} />
          <Text style={styles.captureTitle}>Scan sample receipt</Text>
          <Text style={styles.captureDetail}>Mocks camera + OCR</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            updateDraft({ receiptAttached: true });
            Alert.alert(
              "Photo attached",
              "A local prototype document is now linked to the draft.",
            );
          }}
          style={({ pressed }) => [styles.libraryButton, pressed ? styles.pressed : null]}
        >
          <Icon color={colors.accent} name="photo.on.rectangle" size={25} />
          <Text style={styles.libraryText}>Choose sample photo</Text>
        </Pressable>
      </View>

      <View style={styles.receipt}>
        <Icon color={colors.label} name="doc.text" size={30} />
        <Text style={styles.merchant}>CAFE OBERKAMPF</Text>
        <Text style={styles.receiptMeta}>Paris · 8 September</Text>
        <View style={styles.rule} />
        <View style={styles.line}>
          <Text style={styles.lineText}>Lunch and drinks</Text>
          <Text style={styles.lineText}>EUR 78.40</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineText}>Service</Text>
          <Text style={styles.lineText}>EUR 8.00</Text>
        </View>
        <View style={styles.rule} />
        <View style={styles.line}>
          <Text style={styles.total}>TOTAL</Text>
          <Text style={styles.total}>EUR 86.40</Text>
        </View>
        <Text style={styles.ocr}>OCR confidence · amount 98% · merchant 91%</Text>
      </View>

      <View style={styles.infoRow}>
        <Icon color={colors.blue} name="arrow.up.doc" />
        <Text style={styles.infoText}>
          Receipt upload is independent from expense financial sync. The expense can sync
          even while its photo waits.
        </Text>
      </View>
      {draft.receiptAttached ? (
        <PrimaryButton
          icon="checkmark.circle.fill"
          label="Receipt Attached"
          onPress={() => router.back()}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 16, paddingBottom: 36 },
  captureActions: { gap: 10 },
  captureButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 8,
    minHeight: 104,
    padding: 14,
  },
  captureTitle: { color: colors.surface, fontSize: 18, fontWeight: "700", marginTop: 8 },
  captureDetail: { color: "#D9F5EC", fontSize: 13, marginTop: 2 },
  libraryButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 50,
  },
  libraryText: { color: colors.accent, fontSize: 17, fontWeight: "600" },
  pressed: { opacity: 0.7 },
  receipt: {
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    maxWidth: 350,
    padding: 24,
    width: "92%",
  },
  merchant: { color: colors.label, fontSize: 18, fontWeight: "800", textAlign: "center" },
  receiptMeta: { color: colors.secondaryLabel, fontSize: 13, textAlign: "center" },
  rule: { borderTopColor: colors.border, borderTopWidth: 1, marginVertical: 6 },
  line: { flexDirection: "row", justifyContent: "space-between" },
  lineText: { color: colors.label, fontSize: 14 },
  total: { color: colors.label, fontSize: 16, fontWeight: "800" },
  ocr: { color: colors.secondaryLabel, fontSize: 12, marginTop: 12, textAlign: "center" },
  infoRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 4,
  },
  infoText: { color: colors.secondaryLabel, flex: 1, fontSize: 14, lineHeight: 20 },
});
