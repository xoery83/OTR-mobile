import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { importReceiptAsset } from "@/data/operations/importReceiptAsset";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
import { runLedgerReceiptSync } from "@/data/sync/ledgerReceiptCoordinator";
import { stage3JourneyId } from "./useLedgerStage3";

export function useReceiptCapture() {
  const params = useLocalSearchParams<{
    expenseId?: string;
    journeyId?: string;
    mode?: "scan" | "attach";
  }>();
  const journeyId = params.journeyId ?? stage3JourneyId;
  const scan = params.mode === "scan";
  const [receipts, setReceipts] = useState<ReceiptAsset[]>([]);
  const [sessionReceiptId, setSessionReceiptId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!journeyId) return setReceipts([]);
    const rows = await (
      await getDefaultLedgerReceiptRepository()
    ).listReceipts(journeyId);
    setReceipts(scan ? rows.filter((receipt) => receipt.id === sessionReceiptId) : rows);
  }, [journeyId, scan, sessionReceiptId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const importUri = useCallback(
    async (sourceUri: string, mimeType: ReceiptAsset["mimeType"]) => {
      try {
        if (!journeyId) throw new Error("Choose a Journey before adding a receipt.");
        const receipt = await importReceiptAsset({
          journeyId,
          expenseId: params.expenseId,
          sourceUri,
          mimeType,
          requestOcr: scan,
        });
        setMessage(
          scan
            ? "Receipt saved on this iPhone. Upload and scan can resume after restart."
            : "Receipt attached on this iPhone—will sync.",
        );
        if (scan) {
          setSessionReceiptId(receipt?.id ?? null);
          setReceipts(receipt ? [receipt] : []);
          if (receipt)
            void runLedgerReceiptSync()
              .then(async () => {
                const refreshed = await (
                  await getDefaultLedgerReceiptRepository()
                ).getReceipt(receipt.id);
                if (refreshed) setReceipts([refreshed]);
              })
              .catch(() =>
                setMessage("Receipt is safe. Upload and scan will retry later."),
              );
        } else {
          await refresh();
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Receipt import failed.");
      }
    },
    [journeyId, params.expenseId, refresh, scan],
  );

  const pickPhoto = useCallback(
    async (camera: boolean) => {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        return setMessage("Receipt access permission is required.");
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 1,
          });
      if (!result.canceled)
        await importUri(
          result.assets[0].uri,
          (result.assets[0].mimeType ?? "image/jpeg") as ReceiptAsset["mimeType"],
        );
    },
    [importUri],
  );

  const pickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled)
      await importUri(
        result.assets[0].uri,
        (result.assets[0].mimeType ?? "application/pdf") as ReceiptAsset["mimeType"],
      );
  }, [importUri]);

  return {
    expenseId: params.expenseId,
    journeyId,
    scan,
    receipts,
    message,
    pickPhoto,
    pickDocument,
    review: (receipt: ReceiptAsset) =>
      router.replace({
        pathname: "/expenses/new",
        params: { journeyId, mode: "manual", receiptId: receipt.id },
      }),
    retry: async () => {
      try {
        await runLedgerReceiptSync();
        await refresh();
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Receipt scan remains queued.",
        );
      }
    },
  };
}
