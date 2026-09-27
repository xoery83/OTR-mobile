import { router, Stack } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useReceiptCapture } from "@/hooks/useReceiptCapture";
import { MAX_EXPENSE_ATTACHMENTS } from "@/domain/ledger/attachments";

export function ReceiptCaptureScreen() {
  const { expenseId, scan, receipts, message, pickPhoto, pickDocument } =
    useReceiptCapture();
  const full = Boolean(expenseId) && receipts.length >= MAX_EXPENSE_ATTACHMENTS;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerTitle: scan ? "Receipt draft" : "Receipt",
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={styles.close}
            >
              <Text style={styles.closeText}>Cancel</Text>
            </Pressable>
          ),
        }}
      />
      <Text accessibilityRole="header" style={styles.title}>
        {scan ? "Receipt draft" : "Attach receipt"}
      </Text>
      {scan ? (
        <>
          <Text style={styles.note}>Add a temporary receipt from New Expense.</Text>
          <Action label="Back" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Text style={styles.note}>
            A safe local copy is saved on this iPhone before any network work begins.
          </Text>
          <Action
            label="Take photo"
            disabled={full}
            onPress={() => void pickPhoto(true)}
          />
          <Action
            label="Choose photo"
            disabled={full}
            onPress={() => void pickPhoto(false)}
          />
          <Action
            label="Choose file"
            disabled={full}
            onPress={() => void pickDocument()}
          />
          {full ? <Text style={styles.note}>Maximum 3 attachments.</Text> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {receipts.map((receipt) => (
            <View key={receipt.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                {receipt.uploadStatus === "UPLOADED"
                  ? "Receipt uploaded"
                  : "Saved locally"}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Action({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.action}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 20 },
  close: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  closeText: { color: "#0F766E", fontSize: 16, fontWeight: "700" },
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
