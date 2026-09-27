import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { importReceiptAsset } from "@/data/operations/importReceiptAsset";
import { kickLedgerOperationalSync } from "@/data/operations/kickLedgerSync";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
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
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (scan) return setReceipts([]);
    if (!journeyId) return setReceipts([]);
    const rows = await (
      await getDefaultLedgerReceiptRepository()
    ).listReceipts(journeyId);
    const expense = params.expenseId
      ? await (await getDefaultLedgerExpenseRepository()).getExpense(params.expenseId)
      : null;
    setReceipts(
      params.expenseId
        ? rows.filter(
            (row) =>
              row.expenseId === params.expenseId || row.expenseId === expense?.serverId,
          )
        : rows,
    );
  }, [journeyId, params.expenseId, scan]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const importUri = useCallback(
    async (sourceUri: string, mimeType: string, originalFilename?: string | null) => {
      try {
        if (scan) throw new Error("Add a receipt from the New Expense form.");
        if (!journeyId) throw new Error("Choose a Journey before adding a receipt.");
        const receipt = await importReceiptAsset({
          journeyId,
          expenseId: params.expenseId,
          sourceUri,
          mimeType,
          originalFilename,
          requestOcr: false,
        });
        setMessage("Receipt attached on this iPhone—will sync.");
        if (receipt) {
          await refresh();
          kickLedgerOperationalSync();
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
          result.assets[0].mimeType ?? "",
          result.assets[0].fileName,
        );
    },
    [importUri],
  );

  const pickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled)
      await importUri(
        result.assets[0].uri,
        result.assets[0].mimeType ?? "",
        result.assets[0].name,
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
  };
}
