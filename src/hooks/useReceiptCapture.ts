import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { importReceiptAsset } from "@/data/operations/importReceiptAsset";
import { kickLedgerOperationalSync } from "@/data/operations/kickLedgerSync";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
import { MAX_EXPENSE_ATTACHMENTS } from "@/domain/ledger/attachments";
import { getDefaultLedgerReportingRepository } from "@/data/repositories/defaultLedgerReportingRepository";
import { getDefaultLedgerSettlementRepository } from "@/data/repositories/defaultLedgerSettlementRepository";
import { canEditLedgerExpense } from "@/data/repositories/ledgerExpenseEditAccess";
import { stage3JourneyId } from "./useLedgerStage3";

export function useReceiptCapture() {
  const params = useLocalSearchParams<{
    expenseId?: string;
    journeyId?: string;
    mode?: "scan" | "attach";
  }>();
  const journeyId = params.journeyId ?? stage3JourneyId;
  const scan = params.mode === "scan";
  const busy = useRef(false);
  const [selecting, setSelecting] = useState(false);
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
        const actor = await (
          await getDefaultLedgerReportingRepository()
        ).getActorContext(journeyId);
        const locked = params.expenseId
          ? await (
              await getDefaultLedgerSettlementRepository()
            ).isExpenseFinalized(journeyId, params.expenseId)
          : false;
        if (!canEditLedgerExpense(actor?.role, locked))
          throw new Error("Expense attachment write access is required.");
        const receipt = await importReceiptAsset({
          journeyId,
          expenseId: params.expenseId,
          sourceUri,
          mimeType,
          originalFilename,
          requestOcr: false,
        });
        setMessage("Attachment added.");
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

  const pick = useCallback(
    async (kind: "camera" | "photo" | "file") => {
      if (busy.current) return;
      const remaining = params.expenseId
        ? Math.max(0, MAX_EXPENSE_ATTACHMENTS - receipts.length)
        : MAX_EXPENSE_ATTACHMENTS;
      if (!remaining) return;
      busy.current = true;
      setSelecting(true);
      try {
        let sources: { uri: string; mimeType: string; name?: string | null }[] = [];
        if (kind === "file") {
          const result = await DocumentPicker.getDocumentAsync({
            type: [
              "application/pdf",
              "image/jpeg",
              "image/png",
              "image/heic",
              "image/heif",
            ],
            copyToCacheDirectory: true,
            multiple: true,
          });
          if (!result.canceled)
            sources = result.assets.map((item) => ({
              uri: item.uri,
              mimeType: item.mimeType ?? "",
              name: item.name,
            }));
        } else {
          const permission =
            kind === "camera"
              ? await ImagePicker.requestCameraPermissionsAsync()
              : await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted)
            throw new Error("Receipt access permission is required.");
          const result =
            kind === "camera"
              ? await ImagePicker.launchCameraAsync({
                  mediaTypes: ["images"],
                  quality: 1,
                })
              : await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ["images"],
                  quality: 1,
                  allowsMultipleSelection: true,
                  selectionLimit: remaining,
                });
          if (!result.canceled)
            sources = result.assets.map((item) => ({
              uri: item.uri,
              mimeType: item.mimeType ?? "",
              name: item.fileName,
            }));
        }
        if (sources.length > remaining)
          throw new Error(`Select up to ${remaining} attachments.`);
        for (const source of sources)
          await importUri(source.uri, source.mimeType, source.name);
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Attachment could not be added.",
        );
      } finally {
        busy.current = false;
        setSelecting(false);
      }
    },
    [importUri, params.expenseId, receipts.length],
  );
  const pickPhoto = (camera: boolean) => pick(camera ? "camera" : "photo");
  const pickDocument = () => pick("file");

  return {
    expenseId: params.expenseId,
    journeyId,
    scan,
    receipts,
    selecting,
    message,
    pickPhoto,
    pickDocument,
  };
}
