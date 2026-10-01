import { router, Stack } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { useReceiptCapture } from "@/hooks/useReceiptCapture";
import { MAX_EXPENSE_ATTACHMENTS } from "@/domain/ledger/attachments";

export function ReceiptCaptureScreen() {
  const { expenseId, scan, receipts, selecting, message, pickPhoto, pickDocument } =
    useReceiptCapture();
  const full = Boolean(expenseId) && receipts.length >= MAX_EXPENSE_ATTACHMENTS;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerTitle: scan ? "Receipt draft" : "Add attachment",
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={scan ? "Cancel" : "Close"}
          onPress={() => router.back()}
        >
          {scan ? "Cancel" : "Close"}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {scan ? (
        <>
          <Text style={styles.note}>Add a temporary receipt from New Expense.</Text>
          <Action label="Back" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Text style={styles.note}>
            {Math.max(0, MAX_EXPENSE_ATTACHMENTS - receipts.length)} attachment slots
            remaining. Choose photos or a PDF.
          </Text>
          <Action
            label="Camera"
            disabled={full || selecting}
            onPress={() => void pickPhoto(true)}
          />
          <Action
            label="Photo Library"
            disabled={full || selecting}
            onPress={() => void pickPhoto(false)}
          />
          <Action
            label="Files"
            disabled={full || selecting}
            onPress={() => void pickDocument()}
          />
          {message ? (
            <Text accessibilityLiveRegion="polite" style={styles.message}>
              {message}
            </Text>
          ) : null}
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
