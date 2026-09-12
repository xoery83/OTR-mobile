import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { copyReceiptIntoAppStorage } from "@/data/files/receiptFileStore";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { getDefaultLedgerReceiptRepository } from "@/data/repositories/defaultLedgerReceiptRepository";
import type { ReceiptAsset } from "@/data/repositories/ledgerReceiptRepository";
import { runLedgerReceiptSync } from "@/data/sync/ledgerReceiptCoordinator";
import { allocateEqual } from "@/domain/ledger/allocation";
import { currencyScale } from "@/domain/ledger/currency";
import { createLocalId } from "@/domain/localId";
import { stage3JourneyId } from "./useLedgerStage3";

export function useReceiptCapture() {
  const { expenseId } = useLocalSearchParams<{ expenseId?: string }>();
  const [receipts, setReceipts] = useState<ReceiptAsset[]>([]);
  const [members, setMembers] = useState<{ id: string; displayName: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(
    async () =>
      setReceipts(
        await (await getDefaultLedgerReceiptRepository()).listReceipts(stage3JourneyId),
      ),
    [],
  );
  useEffect(() => {
    void Promise.resolve().then(async () => {
      await refresh();
      setMembers(
        await (await getDefaultLedgerReadRepository()).listMembers(stage3JourneyId),
      );
    });
  }, [refresh]);

  const importUri = useCallback(
    async (sourceUri: string, mimeType: string) => {
      try {
        const id = createLocalId("ledger-receipt");
        const copied = await copyReceiptIntoAppStorage({ id, sourceUri, mimeType });
        await (
          await getDefaultLedgerReceiptRepository()
        ).importReceipt({
          id,
          journeyId: stage3JourneyId,
          expenseId,
          mimeType: mimeType as ReceiptAsset["mimeType"],
          ...copied,
        });
        setMessage("Receipt saved locally. Upload and OCR can resume after restart.");
        await refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Receipt import failed.");
      }
    },
    [expenseId, refresh],
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
        await importUri(result.assets[0].uri, result.assets[0].mimeType ?? "image/jpeg");
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
        result.assets[0].mimeType ?? "application/pdf",
      );
  }, [importUri]);

  const confirmSuggestion = useCallback(
    async (receipt: ReceiptAsset, payerMemberId: string) => {
      const suggestion = receipt.ocrSuggestion;
      if (!suggestion?.title || !suggestion.amountMinor || !suggestion.currency)
        return setMessage("OCR has no complete Expense suggestion to confirm.");
      const actor = members.find((member) => member.id === payerMemberId);
      if (!actor) return setMessage("Choose a Journey member as payer.");
      const scale = currencyScale(suggestion.currency);
      if (scale === null) return setMessage("OCR suggested an unsupported currency.");
      const original = {
        minor: suggestion.amountMinor,
        currency: suggestion.currency,
        scale,
      };
      const expense = await (
        await getDefaultLedgerExpenseRepository()
      ).createExpense({
        journeyId: stage3JourneyId,
        creatorMemberId: actor.id,
        payerMemberId: actor.id,
        title: suggestion.title,
        description: null,
        category: suggestion.category ?? "other",
        occurredAt: suggestion.occurredAt ?? new Date().toISOString(),
        original,
        participants: [
          {
            memberId: actor.id,
            displayNameSnapshot: actor.displayName,
            householdIdSnapshot: null,
          },
        ],
        splits: allocateEqual(original.minor, null, [actor.id]),
        valuation: null,
        status: "DRAFT",
      });
      await (
        await getDefaultLedgerReceiptRepository()
      ).attachExpense(receipt.id, expense.id);
      setMessage("Suggestion confirmed through the normal Expense command path.");
      await refresh();
    },
    [members, refresh],
  );

  return {
    expenseId,
    receipts,
    members,
    message,
    pickPhoto,
    pickDocument,
    confirmSuggestion,
    retry: async () => {
      await runLedgerReceiptSync();
      await refresh();
    },
  };
}
