import {
  structuredTripMetadataReceiptSchema,
  structuredTripMetadataSnapshotSchema,
  structuredTripCreateRequestSchema,
  structuredTripMetadataUpdateSchema,
} from "../../src/domain/trip/tripStructuredDestinationContract";
import {
  tripCreateWireResultSchema,
  structuredTripCreateResultSchema,
} from "../../src/domain/trip/tripCreateWireContract";
import {
  tripDiscoveryPageSchema,
  tripDiscoverySummarySchema,
} from "../../src/domain/trip/tripDiscoveryContract";
import { coreHash, coreUuid } from "../../src/domain/trip/tripCoreV2";
import { coreReceiptSchema } from "../../src/domain/trip/tripCoreV2Receipt";
import {
  coreReadManifestSchema,
  coreReadPageSchema,
} from "../../src/domain/trip/tripCoreV2Read";
import {
  tripLifecycleReceiptSchema,
  tripLifecycleBaseSchema,
  itemLifecycleBaseSchema,
  tripLifecycleRequestSchema,
} from "../../src/domain/trip/tripLifecycleContract";
import {
  ledgerExpenseSchema,
  ledgerExpenseListResponseSchema,
  ledgerRateQuoteSchema,
} from "../../src/data/api/ledgerReadContracts";
import {
  ledgerExpenseMutationResponseSchema,
  ledgerPaymentRecordMutationResponseSchema,
  expenseConflictChainResponseSchema,
  expenseConflictChainResolutionResponseSchema,
  expenseCommandRequestSchema,
  expenseIntentEnvelopeSchema,
  expenseTypedIntentSchema,
  createLedgerPaymentRecordRequestSchema,
  expenseConflictChainResolutionRequestSchema,
} from "../../src/data/api/ledgerMutationContracts";
import {
  journeyCurrencyPreviewSchema,
  journeyCurrencyCommitSchema,
  journeyCurrencyPreviewRequestSchema,
  journeyCurrencyCommitRequestSchema,
} from "../../src/data/api/ledgerCurrencyContracts";
import {
  ledgerRateLookupResponseSchema,
  ledgerRateLookupRequestSchema,
} from "../../src/data/api/ledgerFxContracts";
import {
  settlementPreviewSchema,
  finalizedSettlementSchema,
  personalSettlementPaymentListResponseSchema,
  personalSettlementPaymentSchema,
  personalSettlementPaymentFxProjectionSchema,
  personalSettlementReviewResponseSchema,
  settlementPreviewRequestSchema,
} from "../../src/data/api/ledgerSettlementContracts";
import { tripItemSnapshotSchema, tripItemPageSchema } from "./tripItemsRead";
import { rosterSnapshotSchema } from "./tripPeopleRead";
import {
  settlementPageSchema,
  settlementHistoryPageSchema,
  settlementPaymentPageSchema,
  ledgerHistoryPageSchema,
  ledgerExportSchema,
} from "./ledgerBetaRead";
import { ledgerOperationStatusSchema } from "./ledgerOperationRead";
import { tripBetaCapabilitySnapshotSchema } from "./tripBetaCapabilities";

import { z } from "zod";
import registry from "../../docs/mcp/beta-contract-v1/CAPABILITY_REGISTRY_V1.json";
import {
  betaItemCommandSchema,
  betaExpenseLinkCommandSchema,
  type BetaItemFamily,
  type BetaItemAction,
} from "../../src/domain/trip/tripBetaCommandContract";

const empty = z.strictObject({}),
  date = z.iso.date(),
  cursor = z.string().min(1).max(2048);
const history = {
  cursor: cursor.optional(),
  limit: z.number().int().min(1).max(100).default(50),
};
const itemList = {
  family: z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]),
  dateFrom: date.optional(),
  dateTo: date.optional(),
  cursor: cursor.optional(),
  limit: z.number().int().min(1).max(25).default(20),
  includeHidden: z.boolean().default(false),
};
function expenseCommand(
  type: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "APPLY_VALUATION",
) {
  const intent = expenseTypedIntentSchema.options.find(
    (s) => s.shape.type.value === type,
  )!;
  return expenseCommandRequestSchema.extend({
    envelope: expenseIntentEnvelopeSchema.safeExtend({
      commandId: coreUuid,
      idempotencyKey: coreUuid,
      patchOrIntent: intent,
    }),
  });
}
export function betaRequestSchema(id: string): z.ZodType {
  const capability = registry.capabilities.find((c) => c.capabilityId === id);
  if (!capability) throw new Error("UNKNOWN_CAPABILITY");
  if (capability.family) {
    const family = capability.family as BetaItemFamily,
      action = id.split(".").at(-1)!;
    if (action === "get") return empty;
    if (action === "list" || action === "search")
      return z
        .strictObject({
          ...itemList,
          family: z.literal(family),
          ...(action === "search" ? { query: z.string().trim().min(1).max(200) } : {}),
        })
        .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo);
    return betaItemCommandSchema(family, action as BetaItemAction);
  }
  switch (id) {
    case "otr.trip.list":
      return z.strictObject({
        cursor: coreUuid.optional(),
        limit: z.number().int().min(1).max(25).default(20),
        lifecycle: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
      });
    case "otr.trip.get":
      return z.strictObject({ formatVersion: z.literal(3).default(3) });
    case "otr.trip.create":
      return structuredTripCreateRequestSchema;
    case "otr.trip.update":
      return structuredTripMetadataUpdateSchema;
    case "otr.trip.archive":
    case "otr.trip.unarchive":
    case "otr.trip.delete":
      return tripLifecycleRequestSchema.extend({
        action: z.literal(
          id === "otr.trip.archive"
            ? "ARCHIVE"
            : id === "otr.trip.unarchive"
              ? "UNARCHIVE"
              : "DELETE",
        ),
      });
    case "otr.trip.currency.preview":
      return journeyCurrencyPreviewRequestSchema;
    case "otr.trip.currency.update":
      return journeyCurrencyCommitRequestSchema;
    case "otr.expense.list":
      return z
        .strictObject({
          ...history,
          from: date.optional(),
          to: date.optional(),
          includeDeleted: z.boolean().default(false),
        })
        .refine((q) => !q.from || !q.to || q.from < q.to);
    case "otr.expense.create":
      return expenseCommand("CREATE");
    case "otr.expense.update":
      return expenseCommand("UPDATE");
    case "otr.expense.delete":
      return expenseCommand("DELETE");
    case "otr.expense.restore":
      return expenseCommand("RESTORE");
    case "otr.expense.valuation":
      return expenseCommand("APPLY_VALUATION");
    case "otr.expense.payment_record":
      return createLedgerPaymentRecordRequestSchema;
    case "otr.expense.resolve":
      return expenseConflictChainResolutionRequestSchema;
    case "otr.expense.link":
      return betaExpenseLinkCommandSchema(false);
    case "otr.expense.unlink":
      return betaExpenseLinkCommandSchema(true);
    case "otr.fx.lookup":
      return ledgerRateLookupRequestSchema;
    case "otr.fx.snapshots":
      return z.strictObject({
        quoteCurrency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        baseCurrency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
      });
    case "otr.settlement.preview":
      return settlementPreviewRequestSchema;
    case "otr.settlement.list":
      return z.strictObject({ ...history, includeHistory: z.boolean().default(false) });
    case "otr.settlement.history":
    case "otr.settlement.payments.read":
      return z.strictObject(history);
    case "otr.ledger.history":
      return z.strictObject({
        ...history,
        targetKind: z.enum(["EXPENSE", "SETTLEMENT", "PERSONAL_PAYMENT"]),
        targetId: coreUuid,
      });
    case "otr.ledger.export":
      return z
        .strictObject({
          ...history,
          limit: z.number().int().min(1).max(100).default(100),
          scope: z.enum(["EXPENSES", "SETTLEMENT", "PERSONAL_PAYMENTS"]),
          format: z.literal("JSON"),
          targetId: coreUuid.optional(),
        })
        .refine((q) => q.scope !== "SETTLEMENT" || q.targetId !== undefined);
    case "otr.ledger.operation.get":
      return z.strictObject({
        kind: z.enum([
          "EXPENSE",
          "VALUATION",
          "EXPENSE_PAYMENT_RECORD",
          "CURRENCY",
          "EXPENSE_RESOLUTION",
        ]),
        targetId: coreUuid.optional(),
      });
    case "otr.item.lifecycle.base":
      return z.strictObject({ family: z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]) });
    case "otr.people.list":
    case "otr.expense.get":
    case "otr.expense.conflicts":
    case "otr.settlement.get":
    case "otr.personal_payment.list":
    case "otr.personal_payment.get":
    case "otr.personal_review.read":
    case "otr.core.operation.get":
    case "otr.trip.operation.get":
    case "otr.metadata.operation.get":
    case "otr.trip.lifecycle.operation.get":
    case "otr.permissions.read":
    case "otr.core.collection.read":
    case "otr.trip.lifecycle.base":
      return empty;
    default:
      throw new Error("CAPABILITY_SCHEMA_MAPPING_MISSING");
  }
}
export const betaRequestSchemas = Object.fromEntries(
  registry.capabilities.map((c) => [c.capabilityId, betaRequestSchema(c.capabilityId)]),
);

const unknownOperation = z.strictObject({
  outcome: z.literal("UNKNOWN"),
  operationId: coreUuid,
});
export const betaCoreReceiptProjectionSchema = z.discriminatedUnion("projection", [
  z.strictObject({
    projection: z.literal("FULL"),
    domainReceiptId: coreUuid,
    receipt: coreReceiptSchema,
  }),
  z.strictObject({
    projection: z.literal("STATUS_ONLY"),
    domainReceiptId: coreUuid,
    receiptSha256: coreHash,
    operationId: coreUuid,
    outcome: z.enum(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"]),
    targetRevision: z.null(),
  }),
]);
export function betaResponseSchema(id: string): z.ZodType {
  const capability = registry.capabilities.find((c) => c.capabilityId === id);
  if (!capability) throw new Error("UNKNOWN_CAPABILITY");
  if (capability.family) {
    const action = id.split(".").at(-1);
    if (action === "list" || action === "search")
      return tripItemPageSchema.safeExtend({
        family: z.literal(capability.family as BetaItemFamily),
      });
    if (action === "get")
      return tripItemSnapshotSchema.refine((v) => v.item.family === capability.family);
    return betaCoreReceiptProjectionSchema;
  }
  switch (id) {
    case "otr.trip.list":
      return tripDiscoveryPageSchema.extend({
        trips: z
          .array(
            tripDiscoverySummarySchema.extend({
              lifecycleState: z.enum(["ACTIVE", "ARCHIVED"]),
              metadataRevision: z.number().int().nonnegative().safe(),
            }),
          )
          .max(25),
      });
    case "otr.trip.get":
      return structuredTripMetadataSnapshotSchema;
    case "otr.trip.create":
      return structuredTripCreateResultSchema;
    case "otr.trip.update":
      return structuredTripMetadataReceiptSchema;
    case "otr.trip.archive":
    case "otr.trip.unarchive":
    case "otr.trip.delete":
      return tripLifecycleReceiptSchema;
    case "otr.trip.currency.preview":
      return journeyCurrencyPreviewSchema;
    case "otr.trip.currency.update":
      return journeyCurrencyCommitSchema;
    case "otr.people.list":
      return rosterSnapshotSchema;
    case "otr.expense.list":
      return ledgerExpenseListResponseSchema;
    case "otr.expense.get":
      return ledgerExpenseSchema;
    case "otr.expense.create":
    case "otr.expense.update":
    case "otr.expense.delete":
    case "otr.expense.restore":
    case "otr.expense.valuation":
      return ledgerExpenseMutationResponseSchema;
    case "otr.expense.payment_record":
      return ledgerPaymentRecordMutationResponseSchema;
    case "otr.expense.conflicts":
      return expenseConflictChainResponseSchema;
    case "otr.expense.resolve":
      return expenseConflictChainResolutionResponseSchema;
    case "otr.expense.link":
    case "otr.expense.unlink":
      return betaCoreReceiptProjectionSchema;
    case "otr.fx.lookup":
      return ledgerRateLookupResponseSchema;
    case "otr.fx.snapshots":
      return z.array(ledgerRateQuoteSchema);
    case "otr.settlement.preview":
      return settlementPreviewSchema;
    case "otr.settlement.list":
      return settlementPageSchema;
    case "otr.settlement.get":
      return finalizedSettlementSchema;
    case "otr.settlement.history":
      return settlementHistoryPageSchema;
    case "otr.settlement.payments.read":
      return settlementPaymentPageSchema;
    case "otr.personal_payment.list":
      return personalSettlementPaymentListResponseSchema;
    case "otr.personal_payment.get":
      return z.strictObject({
        record: personalSettlementPaymentSchema,
        projections: z.array(personalSettlementPaymentFxProjectionSchema),
      });
    case "otr.personal_review.read":
      return personalSettlementReviewResponseSchema;
    case "otr.ledger.history":
      return ledgerHistoryPageSchema;
    case "otr.ledger.export":
      return ledgerExportSchema;
    case "otr.core.operation.get":
      return z.union([betaCoreReceiptProjectionSchema, unknownOperation]);
    case "otr.trip.operation.get":
      return z.union([tripCreateWireResultSchema, unknownOperation]);
    case "otr.metadata.operation.get":
      return z.union([structuredTripMetadataReceiptSchema, unknownOperation]);
    case "otr.ledger.operation.get":
      return ledgerOperationStatusSchema;
    case "otr.trip.lifecycle.operation.get":
      return z.union([tripLifecycleReceiptSchema, unknownOperation]);
    case "otr.permissions.read":
      return tripBetaCapabilitySnapshotSchema;
    case "otr.core.collection.read":
      return z.strictObject({
        manifest: coreReadManifestSchema,
        pages: z.array(coreReadPageSchema),
      });
    case "otr.item.lifecycle.base":
      return itemLifecycleBaseSchema;
    case "otr.trip.lifecycle.base":
      return tripLifecycleBaseSchema;
    default:
      throw new Error("CAPABILITY_SCHEMA_MAPPING_MISSING");
  }
}
export const betaResponseSchemas = Object.fromEntries(
  registry.capabilities.map((c) => [c.capabilityId, betaResponseSchema(c.capabilityId)]),
);
