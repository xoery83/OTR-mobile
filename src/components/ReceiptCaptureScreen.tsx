import { Button, ScrollView, StyleSheet, Text, View } from "react-native";
import { useReceiptCapture } from "@/hooks/useReceiptCapture";

export function ReceiptCaptureScreen() {
  const {
    expenseId,
    receipts,
    members,
    message,
    pickPhoto,
    pickDocument,
    confirmSuggestion,
    retry,
  } = useReceiptCapture();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {expenseId ? "Attach receipt" : "Receipt-first Expense"}
      </Text>
      <Text style={styles.note}>
        The original is copied into durable app storage before it is queued.
      </Text>
      <Button title="Take photo" onPress={() => void pickPhoto(true)} />
      <Button title="Choose photo" onPress={() => void pickPhoto(false)} />
      <Button title="Choose PDF" onPress={() => void pickDocument()} />
      <Button title="Retry upload and OCR" onPress={() => void retry()} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {receipts.map((receipt) => (
        <View key={receipt.id} style={styles.card}>
          <Text style={styles.cardTitle}>Receipt · {receipt.uploadStatus}</Text>
          <Text>OCR · {receipt.ocrStatus}</Text>
          {receipt.ocrSuggestion ? (
            <Text>
              Suggestion · {receipt.ocrSuggestion.title ?? "Unknown merchant"} ·{" "}
              {receipt.ocrSuggestion.currency ?? "—"}{" "}
              {receipt.ocrSuggestion.amountMinor == null
                ? "—"
                : (receipt.ocrSuggestion.amountMinor / 100).toFixed(2)}{" "}
              · {receipt.ocrSuggestion.category ?? "Uncategorized"}
            </Text>
          ) : null}
          {!receipt.expenseId && receipt.ocrSuggestion
            ? members.map((member) => (
                <Button
                  key={member.id}
                  title={`Confirm draft · ${member.displayName} paid`}
                  onPress={() => void confirmSuggestion(receipt, member.id)}
                />
              ))
            : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 20 },
  title: { fontSize: 26, fontWeight: "800" },
  note: { color: "#475569" },
  message: { color: "#0F766E", fontWeight: "700" },
  card: { borderColor: "#CBD5E1", borderRadius: 8, borderWidth: 1, gap: 6, padding: 12 },
  cardTitle: { fontWeight: "700" },
});
