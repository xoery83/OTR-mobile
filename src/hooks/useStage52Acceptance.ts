import { File, Paths } from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { copyReceiptIntoAppStorage } from "@/data/files/receiptFileStore";
import { createLedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";
import { createLedgerReceiptRepository } from "@/data/repositories/ledgerReceiptRepository";
import { runLedgerExpenseSync } from "@/data/sync/ledgerExpenseDemoCoordinator";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { runLedgerReceiptSync } from "@/data/sync/ledgerReceiptCoordinator";
import { createLedgerReceiptTransport } from "@/data/sync/ledgerReceiptTransport";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { allocateEqual } from "@/domain/ledger/allocation";
import { stage3JourneyId } from "./useLedgerStage3";

export type Stage52Check = { name: string; ok: boolean; detail: string };
const expenseReceiptId = "stage52-expense-first";
const receiptFirstId = "stage52-receipt-first";
const expenseTitle = "Stage 5.2 expense-first fixture";

export function useStage52Acceptance() {
  const [checks, setChecks] = useState<Stage52Check[]>([]);
  const { phase } = useLocalSearchParams<{ phase?: string }>();
  useEffect(() => {
    let cancelled = false;
    const record = (name: string, ok: boolean, detail: string) => {
      if (!cancelled) setChecks((current) => [...current, { name, ok, detail }]);
      if (!ok) throw new Error(`${name}: ${detail}`);
    };
    void runAcceptance(phase, record).catch((error) => {
      if (!cancelled)
        setChecks((current) => [
          ...current,
          {
            name: "Stage 5.2 acceptance stopped",
            ok: false,
            detail: error instanceof Error ? error.message : "unknown failure",
          },
        ]);
    });
    return () => {
      cancelled = true;
    };
  }, [phase]);
  return checks;
}

async function runAcceptance(
  phase: string | undefined,
  record: (name: string, ok: boolean, detail: string) => void,
) {
  await signInCreator();
  const bootstrap = await createLedgerReadTransport().bootstrap(stage3JourneyId);
  await (await getDefaultLedgerReadRepository()).applyBootstrap(bootstrap);
  const database = await openDatabase();
  const expenses = createLedgerExpenseRepository(database);
  const receipts = createLedgerReceiptRepository(database);
  const actor = bootstrap.members.find(
    (member) => member.id === bootstrap.actor.memberId,
  )!;
  if (!actor) return record("authenticated actor", false, "missing Journey member");

  if (phase === "offline") {
    let expense = (await expenses.listExpensesForJourney(stage3JourneyId, true)).find(
      (item) => item.title === expenseTitle,
    );
    if (!expense) {
      const original = { minor: 1200, currency: "NZD", scale: 2 };
      expense = await expenses.createExpense({
        journeyId: stage3JourneyId,
        creatorMemberId: actor.id,
        payerMemberId: actor.id,
        title: expenseTitle,
        description: null,
        category: "food",
        occurredAt: new Date().toISOString(),
        original,
        participants: [
          {
            memberId: actor.id,
            displayNameSnapshot: actor.displayName,
            householdIdSnapshot: null,
          },
        ],
        splits: allocateEqual(original.minor, original.minor, [actor.id]),
        valuation: {
          id: "stage52-valuation",
          policy: "SAME_CURRENCY",
          original,
          settlement: original,
          rateSnapshotId: null,
          paymentRecordId: null,
          reason: null,
        },
        status: "ACCEPTED",
      });
      await runLedgerExpenseSync({ entityId: expense.id });
    }
    await importFixture(receipts, expenseReceiptId, expense.id);
    await receipts.attachExpense(expenseReceiptId, expense.id);
    await importFixture(receipts, receiptFirstId, null);
    const failing = {
      ...createLedgerReceiptTransport(),
      create: async () => {
        throw new Error("simulated upload outage");
      },
    };
    await runLedgerReceiptSync({ transport: failing });
    const after = await receipts.getReceipt(expenseReceiptId);
    record(
      "Expense-first failure isolation",
      (await expenses.getExpense(expense.id))?.syncStatus === "SYNCED" &&
        after?.uploadStatus === "FAILED",
      `${(await expenses.getExpense(expense.id))?.syncStatus}/${after?.uploadStatus}`,
    );
    record(
      "receipt-first restart checkpoint",
      (await receipts.getReceipt(receiptFirstId))?.uploadStatus === "FAILED",
      receiptFirstId,
    );
    return;
  }

  const before = await expenses.listExpensesForJourney(stage3JourneyId, true);
  const financialBefore = JSON.stringify(before);
  for (const id of [expenseReceiptId, receiptFirstId]) {
    const receipt = await receipts.getReceipt(id);
    record(
      `${id} durable local file`,
      Boolean(receipt?.localUri && new File(receipt.localUri).exists),
      receipt?.localUri ?? "missing",
    );
  }
  await runLedgerReceiptSync();
  const afterOcr = await expenses.listExpensesForJourney(stage3JourneyId, true);
  record(
    "OCR suggestion has no automatic financial mutation",
    JSON.stringify(afterOcr) === financialBefore,
    `${afterOcr.length} Expenses unchanged`,
  );
  const receiptFirst = await receipts.getReceipt(receiptFirstId);
  record(
    "upload and OCR recovered",
    receiptFirst?.uploadStatus === "UPLOADED" && receiptFirst.ocrStatus === "SUCCEEDED",
    `${receiptFirst?.uploadStatus}/${receiptFirst?.ocrStatus}`,
  );
  if (
    !receiptFirst?.ocrSuggestion?.title ||
    !receiptFirst.ocrSuggestion.amountMinor ||
    !receiptFirst.ocrSuggestion.currency
  )
    return record(
      "OCR fixture suggestion",
      false,
      "start backend with OTR_DEV_RECEIPT_OCR_ACCEPTANCE_FIXTURE=1",
    );
  const original = {
    minor: receiptFirst.ocrSuggestion.amountMinor,
    currency: receiptFirst.ocrSuggestion.currency,
    scale: 2,
  };
  const confirmed =
    (receiptFirst.expenseId ? await expenses.getExpense(receiptFirst.expenseId) : null) ??
    (await expenses.createExpense({
      journeyId: stage3JourneyId,
      creatorMemberId: actor.id,
      payerMemberId: actor.id,
      title: receiptFirst.ocrSuggestion.title,
      description: null,
      category: receiptFirst.ocrSuggestion.category ?? "other",
      occurredAt: receiptFirst.ocrSuggestion.occurredAt ?? new Date().toISOString(),
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
    }));
  await receipts.attachExpense(receiptFirst.id, confirmed.id);
  await runLedgerExpenseSync({ entityId: confirmed.id });
  await runLedgerReceiptSync();
  const linked = await receipts.getReceipt(receiptFirst.id);
  const confirmedAfterSync = await expenses.getExpense(confirmed.id);
  const linkOperations = await database.getAllAsync<{ status: string }>(
    "SELECT status FROM ledger_asset_operations WHERE operation_type = 'LINK_RECEIPT'",
  );
  record(
    "explicit confirmation and linking",
    confirmedAfterSync?.syncStatus === "SYNCED" &&
      linked?.expenseId === confirmed.id &&
      linkOperations.length === 2 &&
      linkOperations.every((operation) => operation.status === "COMPLETED"),
    `${confirmedAfterSync?.syncStatus}/${linkOperations.map((operation) => operation.status).join(",")}`,
  );

  const operation = await database.getFirstAsync<{ idempotencyKey: string }>(
    "SELECT idempotency_key AS idempotencyKey FROM ledger_asset_operations WHERE asset_id = ? AND operation_type = 'UPLOAD_RECEIPT'",
    receiptFirst.id,
  );
  const replay = await createLedgerReceiptTransport().create(
    stage3JourneyId,
    operation!.idempotencyKey,
    {
      localId: receiptFirst.id,
      mimeType: receiptFirst.mimeType,
      sizeBytes: receiptFirst.sizeBytes,
      sha256: receiptFirst.sha256,
    },
  );
  record(
    "duplicate upload identity",
    replay.entity.id === receiptFirst.serverId && replay.idempotentReplay,
    `${replay.entity.id}/${replay.idempotentReplay}`,
  );
}

async function importFixture(
  receipts: ReturnType<typeof createLedgerReceiptRepository>,
  id: string,
  expenseId: string | null,
) {
  if (await receipts.getReceipt(id)) return;
  const source = new File(Paths.cache, `${id}.jpg`);
  source.create({ overwrite: true, intermediates: true });
  source.write(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  const copied = await copyReceiptIntoAppStorage({
    id,
    sourceUri: source.uri,
    mimeType: "image/jpeg",
  });
  source.delete();
  await receipts.importReceipt({
    id,
    journeyId: stage3JourneyId,
    expenseId,
    mimeType: "image/jpeg",
    ...copied,
  });
}

async function signInCreator() {
  const email =
    process.env.EXPO_PUBLIC_OTR_STAGE5_CREATOR_EMAIL ??
    process.env.EXPO_PUBLIC_OTR_STAGE4C_CREATOR_EMAIL ??
    process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_EMAIL ??
    "";
  const password =
    process.env.EXPO_PUBLIC_OTR_STAGE5_CREATOR_PASSWORD ??
    process.env.EXPO_PUBLIC_OTR_STAGE4C_CREATOR_PASSWORD ??
    process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_PASSWORD ??
    "";
  if (!email || !password) throw new Error("Missing Stage 5.2 creator credentials.");
  await signInToSupabaseDev(email, password);
}
