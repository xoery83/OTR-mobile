import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import { AppIcon } from "@/components/AppIcon";
import { expenseDraftAttachmentLabel } from "./expenseEntryPresentation";

export function ExpenseAttachmentRow({
  attachment,
  position,
  onPreview,
  onRemove,
}: {
  attachment: {
    mimeType: TemporaryReceiptDraft["mimeType"];
    originalFilename?: string | null;
    localUri: string | null;
  };
  position: number;
  onPreview: () => void;
  onRemove?: () => void;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const display = expenseDraftAttachmentLabel(
    { ...attachment, localUri: attachment.localUri ?? "" },
    position,
  );
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`Preview ${display.title}, ${display.type}`}
        accessibilityRole="button"
        onPress={onPreview}
        style={styles.preview}
      >
        {display.thumbnailUri && failedUri !== display.thumbnailUri ? (
          <Image
            source={{ uri: display.thumbnailUri }}
            onError={() => setFailedUri(display.thumbnailUri)}
            style={styles.thumbnail}
          />
        ) : (
          <AppIcon
            color="#0F766E"
            name={attachment.mimeType === "application/pdf" ? "doc" : "photo"}
            size={28}
          />
        )}
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.title}>
            {display.title}
          </Text>
          {attachment.mimeType === "application/pdf" ? (
            <Text style={styles.type}>PDF</Text>
          ) : null}
        </View>
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityLabel={`Remove ${display.title}`}
          accessibilityRole="button"
          onPress={onRemove}
          style={styles.remove}
        >
          <AppIcon color="#B91C1C" name="trash" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 54 },
  preview: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
  },
  thumbnail: { width: 42, height: 42, borderRadius: 5 },
  identity: { flex: 1, minWidth: 0 },
  title: { color: "#475569", fontSize: 15 },
  type: { color: "#64748B", fontSize: 13 },
  remove: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
});
