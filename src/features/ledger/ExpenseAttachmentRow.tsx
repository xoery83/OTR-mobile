import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { TemporaryReceiptDraft } from "@/data/files/receiptFileStore";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
import { resolveReceiptAssetUri } from "@/data/operations/openReceiptAsset";
import { AppIcon } from "@/components/AppIcon";
import { expenseDraftAttachmentLabel } from "./expenseEntryPresentation";

export function ExpenseAttachmentRow({
  attachment,
  position,
  onPreview,
  onRemove,
}: {
  attachment:
    | ReceiptAsset
    | {
        mimeType: TemporaryReceiptDraft["mimeType"];
        originalFilename?: string | null;
        localUri: string | null;
      };
  position: number;
  onPreview: () => void;
  onRemove?: () => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if ("uploadStatus" in attachment && attachment.mimeType.startsWith("image/")) {
      void resolveReceiptAssetUri(attachment)
        .then((uri) => {
          if (active) {
            setFailedUri(null);
            setResolvedUri(uri);
          }
        })
        .catch(() => {
          if (active) setResolvedUri(null);
        });
    }
    return () => {
      active = false;
    };
  }, [attachment]);
  const display = expenseDraftAttachmentLabel(
    {
      ...attachment,
      localUri:
        "uploadStatus" in attachment ? (resolvedUri ?? "") : (attachment.localUri ?? ""),
    },
    position,
  );
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={t("expense.previewAttachment", {
          title: display.title,
          type: display.type,
        })}
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
            color={colors.accent}
            name={attachment.mimeType === "application/pdf" ? "doc" : "photo"}
            size={28}
          />
        )}
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.title}>
            {display.title}
          </Text>
          {attachment.mimeType === "application/pdf" ? (
            <Text style={styles.type}>{t("attachment.pdf")}</Text>
          ) : null}
        </View>
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityLabel={t("expense.removeAttachment", { title: display.title })}
          accessibilityRole="button"
          onPress={onRemove}
          style={styles.remove}
        >
          <AppIcon color={colors.destructive} name="trash" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
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
    title: { color: colors.textTertiary, fontSize: 15 },
    type: { color: colors.textSecondary, fontSize: 13 },
    remove: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
  });
