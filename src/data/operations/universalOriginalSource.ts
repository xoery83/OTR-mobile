import { z } from "zod";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { UniversalOriginalSourceTransport } from "../api/universalOriginalSourceTransport";
import {
  createSyncOperationRepository,
  type SyncQueueDatabase,
} from "../sync/syncOperationRepository";
import type { createCaptureSourceAdmissionRepository } from "../repositories/captureSourceAdmissionRepository";
import type { Json } from "@/domain/trip/eventIntentJson";

// One existing Source intent, explicitly selected; never scans or enables the global queue.
export async function dispatchUniversalOriginalSource(
  context: AccountRequestContext,
  bindingId: string,
  dependencies: {
    database: SyncQueueDatabase;
    getAccountId(): Promise<string>;
    repository: ReturnType<typeof createCaptureSourceAdmissionRepository>;
    transport: UniversalOriginalSourceTransport;
    refreshOwningCatalog(context: AccountRequestContext): Promise<void>;
  },
) {
  const current = () => assertAccountRequestContext(context, dependencies.getAccountId);
  await current();
  const r = await dependencies.repository.recovery(context, bindingId);
  await current();
  if (r.binding.intent_kind !== "NEW" || !r.operationId)
    throw new Error("SOURCE_TARGET_UNSUPPORTED");
  const wire = z
    .object({
      binding_id: z.literal(bindingId),
      source_command: z
        .object({
          command: z.literal("ACQUIRE_SOURCE"),
          actor_account_id: z.literal(context.accountId),
          trip_id: z.literal(context.tripId),
          source_id: z.literal(r.binding.source_id as string),
          operation_id: z.literal(r.binding.source_operation_id as string),
          operation_key: z.literal(r.binding.source_operation_key as string),
          operation_sha256: z.literal(r.binding.source_operation_sha256 as string),
        })
        .passthrough(),
    })
    .strict()
    .parse(r.command);
  const command = wire.source_command as Json;
  const queue = createSyncOperationRepository(
    dependencies.database,
    dependencies.getAccountId,
    undefined,
    { accountId: context.accountId, tripId: context.tripId, operationId: r.operationId },
  );
  let receipt = await dependencies.transport.lookup(context, command);
  await current();
  if (receipt === null) {
    if (r.binding.state !== "PREPARED") return { state: "OUTCOME_UNKNOWN" as const };
    await queue.recoverInterrupted();
    await current();
    if (!(await queue.claim(r.operationId))) return { state: "NOT_CLAIMED" as const };
    await current();
    await dependencies.repository.markUnknown(
      context,
      bindingId,
      r.binding.row_revision as number,
    );
    await current();
    // From this point every interruption recovers by result lookup, never blind resend.
    receipt = await dependencies.transport.acquire(context, command);
    await current();
  }
  await dependencies.refreshOwningCatalog(context);
  await current();
  await dependencies.repository.applySourceReceipt(context, bindingId, receipt);
  const recovered = await dependencies.repository.recovery(context, bindingId);
  await current();
  if (recovered.binding.state === "ADMITTED") await queue.markCompleted(r.operationId);
  await current();
  return { state: recovered.binding.state as string };
}
