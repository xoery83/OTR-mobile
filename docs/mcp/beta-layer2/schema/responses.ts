import { z } from "zod";
import { uuid, revision, registry } from "./requests";
import * as f from "../../../../src/domain/trip/tripCoreV2";
import * as trip from "../../../../src/domain/trip/tripStructuredDestinationContract";
import * as creation from "../../../../src/domain/trip/tripCreateWireContract";
import * as discovery from "../../../../src/domain/trip/tripDiscoveryContract";
import * as ledger from "../../../../src/data/api/ledgerMutationContracts";
import * as reads from "../../../../src/data/api/ledgerReadContracts";
import * as currency from "../../../../src/data/api/ledgerCurrencyContracts";
import * as fx from "../../../../src/data/api/ledgerFxContracts";
import * as settlement from "../../../../src/data/api/ledgerSettlementContracts";
import {
  coreReadRecordSchema,
  coreReadManifestSchema,
  coreReadPageSchema,
  coreReadItemChildren,
} from "../../../../src/domain/trip/tripCoreV2Read";
import { coreReceiptSchema } from "../../../../src/domain/trip/tripCoreV2Receipt";
import { itemEditBaseOutput } from "../../../../mcp/contract";
const obj = z.strictObject,
  hash = z.string().regex(/^[a-f0-9]{64}$/),
  family = z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]);
const unknown = obj({ outcome: z.literal("UNKNOWN"), operationId: uuid });
const coverage = z.enum(["COMPLETE_AUTHORIZED", "REDACTED_OR_PARTIAL", "UNAVAILABLE"]);
const person = obj({
  personId: uuid,
  ledgerMemberId: uuid.nullable(),
  memberMappingStatus: z.enum(["VERIFIED", "UNAVAILABLE"]),
  mappingReasonCode: z.string().nullable(),
  displayName: z.string(),
  role: z.enum(["OWNER", "ORGANIZER", "MEMBER"]).nullable(),
  participationActive: z.boolean().nullable(),
  participationRevision: revision.nullable(),
}).refine((p) =>
  p.memberMappingStatus === "VERIFIED"
    ? p.ledgerMemberId !== null && p.mappingReasonCode === null
    : p.ledgerMemberId === null && !!p.mappingReasonCode,
);
const impact = obj({
  affectedItems: z.array(obj({ itemId: uuid, revision: revision.min(1) })),
  hasFinancialReferences: z.boolean(),
  changesOriginalFiles: z.literal(false),
  warnings: z.array(z.string()),
});
const projection = z.union([
  obj({
    projection: z.literal("FULL"),
    domainReceiptId: z.string(),
    receipt: coreReceiptSchema,
  }),
  obj({
    projection: z.literal("STATUS_ONLY"),
    domainReceiptId: z.string(),
    receiptSha256: hash,
    operationId: z.string(),
    outcome: z.enum(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"]),
    targetRevision: z.null(),
  }),
]);
const itemBody = f.itinerary_eventsSchema.extend(
  Object.fromEntries(
    coreReadItemChildren.map((table) => [
      table,
      z.array(f.coreTableSchemas[table]).max(64),
    ]),
  ),
);
const itemRecord = coreReadRecordSchema.safeExtend({
  kind: z.literal("ITEM"),
  body: itemBody,
});
const relation = (
  table: "trip_item_participants" | "trip_item_visibility_people" | "expense_links",
) =>
  coreReadRecordSchema.safeExtend({
    kind: z.literal("RELATION"),
    body: obj({ tableName: z.literal(table), row: f.coreTableSchemas[table] }),
  });
export const responseSchemas: Record<string, z.ZodType> = {
  TripList: discovery.tripDiscoveryPageSchema.extend({
    trips: z
      .array(
        discovery.tripDiscoverySummarySchema.extend({
          lifecycleState: z.enum(["ACTIVE", "ARCHIVED"]),
          metadataRevision: revision,
        }),
      )
      .max(25),
  }),
  TripMetadataSnapshot: trip.structuredTripMetadataSnapshotSchema,
  TripCreateResult: creation.tripCreateWireResultSchema,
  StructuredMetadataReceipt: trip.structuredTripMetadataReceiptSchema,
  ItemPage: obj({
    version: z.literal("otr.items.read/1"),
    tripId: uuid,
    family,
    items: z.array(
      obj({
        itemId: uuid,
        family,
        title: z.string(),
        revision: revision.min(1),
        localDates: z.array(z.iso.date()),
        hidden: z.boolean(),
      }),
    ),
    snapshot: hash,
    nextCursor: z.string().nullable(),
  }),
  RosterSnapshot: obj({
    tripId: uuid,
    actorAccountId: uuid,
    rosterHash: hash,
    complete: z.boolean(),
    memberMappingsComplete: z.boolean(),
    memberMappingHash: hash,
    people: z.array(person),
  }).refine(
    (v) =>
      v.memberMappingsComplete ===
      v.people.every((p) => p.memberMappingStatus === "VERIFIED"),
  ),
  CapabilitySnapshot: obj({
    tripId: uuid,
    actorAccountId: uuid,
    accessRevision: revision,
    observedAt: z.iso.datetime(),
    capabilities: z.array(
      obj({
        id: z.enum(registry.map((c) => c.capabilityId) as [string, ...string[]]),
        implemented: z.boolean(),
        allowed: z.boolean(),
        reasonCode: z.string().nullable(),
      }),
    ),
  }),
  ItemSnapshot: itemEditBaseOutput.extend({
    record: itemRecord,
    actorAccountId: uuid,
    relations: obj({
      participation: z.array(relation("trip_item_participants")),
      visibility: z.array(relation("trip_item_visibility_people")),
      expenseLinks: z.array(relation("expense_links")),
    }),
    coverage: obj({
      root: coverage,
      children: obj(Object.fromEntries(coreReadItemChildren.map((t) => [t, coverage]))),
      relations: obj({
        participation: coverage,
        visibility: coverage,
        expenseLinks: coverage,
      }),
      fieldAvailability: z.array(
        obj({ path: z.string(), state: z.enum(["READABLE", "REDACTED", "UNAVAILABLE"]) }),
      ),
    }),
  }),
  ItemLifecycleBase: obj({
    version: z.literal("otr.lifecycle.read/1"),
    actorAccountId: uuid,
    tripId: uuid,
    itemId: uuid,
    family,
    itemRevision: revision.min(1),
    graphHash: hash,
    state: z.enum(["ACTIVE", "HIDDEN", "DELETED"]),
    availableActions: z.array(z.enum(["HIDE", "RESTORE", "DELETE"])),
    impact,
    observedAt: z.iso.datetime(),
  }),
  TripLifecycleBase: obj({
    version: z.literal("otr.lifecycle.read/1"),
    actorAccountId: uuid,
    tripId: uuid,
    metadataRevision: revision,
    graphHash: hash,
    state: z.enum(["ACTIVE", "ARCHIVED", "DELETED"]),
    availableActions: z.array(z.enum(["ARCHIVE", "UNARCHIVE", "DELETE"])),
    impact,
    observedAt: z.iso.datetime(),
  }),
  CoreReceiptProjection: projection,
  CoreReceiptOrUnknown: z.union([projection, unknown]),
  TripCreateResultOrUnknown: z.union([creation.tripCreateWireResultSchema, unknown]),
  StructuredMetadataReceiptOrUnknown: z.union([
    trip.structuredTripMetadataReceiptSchema,
    unknown,
  ]),
  CoreCollection: obj({
    manifest: coreReadManifestSchema,
    pages: z.array(coreReadPageSchema).max(100),
  }),
  Expense: reads.ledgerExpenseSchema,
  ExpensePage: reads.ledgerExpenseListResponseSchema,
  ExpenseMutationResponse: ledger.ledgerExpenseMutationResponseSchema,
  ExpensePaymentRecordResult: ledger.ledgerPaymentRecordMutationResponseSchema,
  ExpenseConflictChain: ledger.expenseConflictChainResponseSchema,
  ExpenseConflictResolutionResult: ledger.expenseConflictChainResolutionResponseSchema,
  RateQuotes: z.array(reads.ledgerRateQuoteSchema),
  RateLookupResponse: fx.ledgerRateLookupResponseSchema,
  JourneyCurrencyPreview: currency.journeyCurrencyPreviewSchema,
  JourneyCurrencyCommit: currency.journeyCurrencyCommitSchema,
  SettlementPreview: settlement.settlementPreviewSchema,
  FinalizedSettlement: settlement.finalizedSettlementSchema,
  SettlementPage: obj({
    tripId: uuid,
    items: z.array(settlement.finalizedSettlementSchema),
    snapshot: hash,
    nextCursor: z.string().nullable(),
  }),
  SettlementHistoryPage: obj({
    rootSettlementId: uuid,
    items: z.array(settlement.finalizedSettlementSchema),
    snapshot: hash,
    nextCursor: z.string().nullable(),
  }),
  SettlementPaymentPage: obj({
    settlementId: uuid,
    items: z.array(settlement.settlementPaymentSchema),
    snapshot: hash,
    nextCursor: z.string().nullable(),
  }),
  PersonalPaymentList: settlement.personalSettlementPaymentListResponseSchema,
  PersonalPaymentRead: obj({
    record: settlement.personalSettlementPaymentSchema,
    projections: z.array(settlement.personalSettlementPaymentFxProjectionSchema),
  }),
  PersonalReviewResponse: settlement.personalSettlementReviewResponseSchema,
  LedgerHistoryPage: obj({
    targetId: uuid,
    events: z.array(reads.ledgerAuditEventSchema),
    snapshot: hash,
    nextCursor: z.string().nullable(),
  }),
  LedgerDataExport: z.discriminatedUnion("scope", [
    ...(["EXPENSES", "SETTLEMENT", "PERSONAL_PAYMENTS"] as const).map((scope, i) =>
      obj({
        format: z.literal("JSON"),
        schemaVersion: z.literal("otr.ledger.export/1"),
        tripId: uuid,
        snapshot: hash,
        scope: z.literal(scope),
        rows: z.array(
          [
            reads.ledgerExpenseSchema,
            settlement.finalizedSettlementSchema,
            settlement.personalSettlementPaymentSchema,
          ][i],
        ),
        nextCursor: z.string().nullable(),
      }),
    ),
  ] as any),
};
const lifecycleRequest = obj({
  operationId: uuid,
  tripId: uuid,
  expectedMetadataRevision: revision,
  graphHash: hash,
  reason: z.string(),
  action: z.enum(["ARCHIVE", "UNARCHIVE", "DELETE"]),
});
responseSchemas.TripLifecycleReceipt = obj({
  operationId: uuid,
  tripId: uuid,
  actorAccountId: uuid,
  request: lifecycleRequest,
  outcome: z.enum(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"]),
  resultMetadataRevision: revision,
  state: z.enum(["ACTIVE", "ARCHIVED", "DELETED"]),
  committedAt: z.iso.datetime(),
});
responseSchemas.TripLifecycleReceiptOrUnknown = z.union([
  responseSchemas.TripLifecycleReceipt,
  unknown,
]);
const statusBase = { operationId: z.string(), actorAccountId: uuid, tripId: uuid };
responseSchemas.LedgerOperationStatus = z.union([
  obj({
    ...statusBase,
    requestDigest: hash,
    state: z.enum(["CONFIRMED", "REJECTED"]),
    receipt: z.union([
      ledger.ledgerExpenseMutationResponseSchema,
      ledger.ledgerPaymentRecordMutationResponseSchema,
      currency.journeyCurrencyCommitSchema,
      ledger.expenseConflictChainResolutionResponseSchema,
    ]),
  }),
  obj({
    ...statusBase,
    requestDigest: z.null(),
    state: z.literal("UNKNOWN"),
    receipt: z.null(),
  }),
]);
for (const c of registry)
  if (!responseSchemas[c.responseSchema])
    throw Error("Missing response " + c.responseSchema);
export function validateSnapshot(name: string, value: unknown) {
  const s = responseSchemas[name];
  if (!s) throw Error("Unknown response schema");
  return s.parse(value);
}
