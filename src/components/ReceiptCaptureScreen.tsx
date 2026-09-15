import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useReceiptCapture } from "@/hooks/useReceiptCapture";

export function ReceiptCaptureScreen() {
  const { scan, receipts, message, pickPhoto, pickDocument, review, retry } =
    useReceiptCapture();
  const failed = receipts.some(
    (receipt) => receipt.uploadStatus === "FAILED" || receipt.ocrStatus === "FAILED",
  );
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        {scan ? "Scan receipt" : "Attach receipt"}
      </Text>
      <Text style={styles.note}>
        The original is stored safely on this iPhone before any network work begins.
      </Text>
      <Action label="Take photo" onPress={() => void pickPhoto(true)} />
      <Action label="Choose photo" onPress={() => void pickPhoto(false)} />
      <Action label="Choose file" onPress={() => void pickDocument()} />
      {scan && failed ? (
        <Action label="Retry upload and scan" onPress={() => void retry()} />
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {receipts.map((receipt) => (
        <View key={receipt.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            {receipt.uploadStatus === "UPLOADED" ? "Receipt uploaded" : "Saved locally"}
          </Text>
          {scan && receipt.ocrStatus === "FAILED" ? (
            <Text style={styles.error}>
              Scan unavailable. The receipt is safe; retry or continue manually.
            </Text>
          ) : null}
          {scan && receipt.ocrSuggestion ? (
            <>
              <Text style={styles.note}>
                Suggested: {receipt.ocrSuggestion.title ?? "Merchant needed"}
              </Text>
              <Action label="Review Expense" onPress={() => review(receipt)} />
            </>
          ) : scan ? (
            <Action label="Continue manually" onPress={() => review(receipt)} />
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 20 },
  title: { color: "#0F172A", fontSize: 28, fontWeight: "800" },
  note: { color: "#475569", fontSize: 15, lineHeight: 21 },
  message: { color: "#0F766E", fontSize: 15, fontWeight: "700" },
  error: { color: "#B45309", fontSize: 15, lineHeight: 21 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
    padding: 14,
  },
  cardTitle: { color: "#0F172A", fontSize: 17, fontWeight: "700" },
  action: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  actionText: { color: "#0F766E", fontSize: 17, fontWeight: "700" },
});
