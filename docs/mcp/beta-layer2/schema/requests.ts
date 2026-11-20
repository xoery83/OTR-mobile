import { z } from "zod";
import { readFileSync } from "node:fs";
import * as core from "../../../../src/domain/trip/tripCoreV2Commands";
import * as f from "../../../../src/domain/trip/tripCoreV2";
import * as trip from "../../../../src/domain/trip/tripStructuredDestinationContract";
import * as ledger from "../../../../src/data/api/ledgerMutationContracts";
import * as currency from "../../../../src/data/api/ledgerCurrencyContracts";
import * as fx from "../../../../src/data/api/ledgerFxContracts";
import { validateExactAllocation } from "../../../../src/domain/ledger/allocation";
import * as settlement from "../../../../src/data/api/ledgerSettlementContracts";
export const registry = JSON.parse(
  readFileSync(
    new URL("../../beta-contract-v1/CAPABILITY_REGISTRY_V1.json", import.meta.url),
    "utf8",
  ),
).capabilities as {
  capabilityId: string;
  toolName: string;
  family: string | null;
  method: string;
  path: string;
  requestSchema: string;
  responseSchema: string;
  effect: string;
  commandUnits: string[];
}[];
export const uuid = f.coreUuid;
export const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const empty = z.strictObject({});
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const family = z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]);
const nonempty = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(shape).refine((v) => Object.keys(v).length > 0);
const authored = nonempty(
  Object.fromEntries(
    [
      "authored_label",
      "authored_text",
      "authored_address",
      "authored_address_line1",
      "authored_address_line2",
      "authored_address_locality",
      "authored_address_region",
      "authored_address_postal_code",
      "authored_address_country",
    ].map((k) => [k, (f.corePlaceSchema.shape as any)[k].optional()]),
  ),
);
const boundary = nonempty({
  local_date: z.iso.date().nullable().optional(),
  local_time: z
    .string()
    .regex(/^\d\d:\d\d(?::\d\d(?:\.\d{1,6})?)?$/)
    .nullable()
    .optional(),
  clock_precision: z.number().int().min(-1).max(6).nullable().optional(),
  zone_id: z.string().nullable().optional(),
}).superRefine((v, c) => {
  if ((v.local_time === null) !== (v.clock_precision === null))
    c.addIssue({ code: "custom", message: "Clock and precision nullability must match" });
  if ("local_time" in v !== "clock_precision" in v)
    c.addIssue({ code: "custom", message: "Clock and precision must be paired" });
  if (v.local_time && v.clock_precision != null) {
    const clock = z.iso.time({ precision: v.clock_precision }).safeParse(v.local_time);
    if (!clock.success)
      c.addIssue({ code: "custom", message: "Clock precision mismatch" });
  }
  if (v.zone_id) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v.zone_id });
    } catch {
      c.addIssue({ code: "custom", message: "Invalid IANA zone" });
    }
  }
});
const schedule = nonempty({
  start: boundary.optional(),
  end: boundary.nullable().optional(),
});
const flightEndpoint = nonempty({
  airportCode: f.coreText(8).nullable().optional(),
  name: f.coreText(255).nullable().optional(),
  terminal: f.coreText(128).nullable().optional(),
  time: boundary.optional(),
});
const flight = nonempty({
  flightNumberLiteral: f
    .coreText(255)
    .refine((v) => !!v.trim())
    .optional(),
  origin: flightEndpoint.optional(),
  destination: flightEndpoint.optional(),
});
const rental = f.trip_rental_detailsSchema
  .omit({ trip_id: true, event_id: true })
  .partial();
const activity = f.trip_activity_detailsSchema
  .omit({ trip_id: true, event_id: true })
  .partial();
const p5 = core.corePayloadSchemas.CREATE_ITEM.options.find(
  (x: any) => x.shape?.family?.value === "P5",
)! as any;
const service = p5.shape.service;
const annotation = p5.shape.annotations.unwrap().shape.origin;
const operational = p5.shape.operationalFacts.unwrap().element;
const endpointPatch = nonempty({ time: boundary.optional(), place: authored.optional() });
const transport = nonempty({
  endpoints: nonempty({
    origin: endpointPatch.optional(),
    destination: endpointPatch.optional(),
  }).optional(),
  service: service
    .partial()
    .refine((v: any) => Object.keys(v).length > 0)
    .optional(),
  annotations: nonempty({
    origin: annotation.partial().optional(),
    destination: annotation.partial().optional(),
  }).optional(),
  operationalChanges: z
    .array(
      z.discriminatedUnion("operation", [
        z.strictObject({
          operation: z.literal("PATCH"),
          role: operational.shape.role,
          changes: endpointPatch,
        }),
        z.strictObject({ operation: z.literal("ADD"), fact: operational }),
        z.strictObject({ operation: z.literal("REMOVE"), role: operational.shape.role }),
      ]),
    )
    .max(3)
    .refine(
      (rows) => new Set(rows.map((r: any) => r.role ?? r.fact.role)).size === rows.length,
    )
    .optional(),
});
function payload(command: string, fam: string | null): z.ZodType {
  if (command === "DELETE_ITEM")
    return z.strictObject({
      reason: f.coreText(2000).refine((v) => !!v.trim()),
      graphHash: hash,
    });
  if (command === "SET_ITEM_SCHEDULE")
    return z
      .strictObject({ schedulePatch: schedule })
      .refine(
        (v: any) =>
          fam !== "P3" ||
          !(v.schedulePatch.end === null || v.schedulePatch.end?.local_date === null),
      );
  if (command === "SET_ITEM_PLACE") return z.strictObject({ place: authored });
  if (command === "SET_AUTHORED_FLIGHT_DETAILS")
    return z.union([
      core.corePayloadSchemas.SET_AUTHORED_FLIGHT_DETAILS,
      z.strictObject({ patch: flight }),
    ]);
  if (command === "SET_STAY_DETAILS") return core.coreSparseStayPayloadSchema;
  if (command === "SET_RENTAL_DETAILS")
    return z
      .strictObject({
        details: rental.optional(),
        places: nonempty({
          pickup: authored.nullable().optional(),
          return: authored.nullable().optional(),
        }).optional(),
      })
      .refine(
        (v: any) =>
          Object.keys(v.details ?? {}).length > 0 ||
          Object.keys(v.places ?? {}).length > 0,
      );
  if (command === "SET_ACTIVITY_DETAILS")
    return z
      .strictObject({
        details: activity.optional(),
        entryPlace: authored.nullable().optional(),
      })
      .refine((v: any) => Object.keys(v.details ?? {}).length > 0 || "entryPlace" in v);
  if (command === "SET_TRANSPORT_DETAILS") return z.strictObject({ patch: transport });
  if (command === "LINK_EXPENSE" || command === "UNLINK_EXPENSE")
    return z.strictObject({
      expenseId: uuid,
      targetKind: z.literal("ITEM"),
      targetId: uuid,
      expectedExpenseRevision: revision.min(1),
    });
  if (command === "SET_ITEM_TEXT" && fam === "P2")
    return nonempty({ description: f.coreText(5000).nullable().optional() });
  if (command === "SET_ITEM_CATEGORY")
    return core.corePayloadSchemas.SET_ITEM_CATEGORY.extend({ family: z.literal(fam!) });
  const p = (core.corePayloadSchemas as any)[command];
  if (!p) throw Error("Unmapped payload " + command);
  if (command === "CREATE_ITEM")
    return p.options.find((v: any) => v.shape.family.value === fam);
  return p;
}
const history = {
  cursor: z.string().max(2048).optional(),
  limit: z.number().int().min(1).max(100).optional(),
};
const lifecycle = {
  operationId: uuid,
  tripId: uuid,
  expectedMetadataRevision: revision,
  graphHash: hash,
  reason: f.coreText(2000).refine((v) => !!v.trim()),
};
const schemas: Record<string, z.ZodType> = {
  Empty: empty,
  TripListQuery: z.strictObject({
    cursor: uuid.optional(),
    limit: z.number().int().min(1).max(25).optional(),
    lifecycle: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).optional(),
  }),
  TripMetadataQuery: z.strictObject({ formatVersion: z.literal(3).optional() }),
  StructuredTripCreate: trip.structuredTripCreateRequestSchema,
  StructuredMetadataUpdate: trip.structuredTripMetadataUpdateSchema,
  CoreCollectionQuery: empty,
  ItemGetQuery: empty,
  RosterQuery: empty,
  PersonalPaymentListQuery: empty,
  ItemListQuery: z.strictObject({
    family,
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    cursor: z.string().max(2048).optional(),
    limit: z.number().int().min(1).max(25).optional(),
    includeHidden: z.boolean().optional(),
    includeDeleted: z.boolean().optional(),
  }),
  HistoryQuery: z.strictObject(history),
  ExpenseListQuery: z.strictObject({
    ...history,
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    includeDeleted: z.boolean().optional(),
  }),
  RateQuotesQuery: z.strictObject({
    quoteCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    baseCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  }),
  SettlementListQuery: z.strictObject({
    ...history,
    includeHistory: z.boolean().optional(),
  }),
  LedgerHistoryQuery: z.strictObject({
    ...history,
    targetKind: z.enum(["EXPENSE", "SETTLEMENT", "PERSONAL_PAYMENT"]),
    targetId: uuid,
  }),
  LedgerExportQuery: z
    .strictObject({
      scope: z.enum(["EXPENSES", "SETTLEMENT", "PERSONAL_PAYMENTS"]),
      format: z.literal("JSON"),
      targetId: uuid.optional(),
      cursor: z.string().max(2048).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    })
    .refine((v) => v.scope !== "SETTLEMENT" || !!v.targetId),
  LedgerOperationQuery: z.strictObject({
    kind: z.enum([
      "EXPENSE",
      "VALUATION",
      "EXPENSE_PAYMENT_RECORD",
      "CURRENCY",
      "EXPENSE_RESOLUTION",
    ]),
    targetId: uuid.optional(),
  }),
  ItemLifecycleQuery: z.strictObject({ family }),
  JourneyCurrencyPreviewRequest: currency.journeyCurrencyPreviewRequestSchema,
  JourneyCurrencyCommitRequest: currency.journeyCurrencyCommitRequestSchema,
  RateLookupRequest: fx.ledgerRateLookupRequestSchema,
  SettlementPreviewRequest: settlement.settlementPreviewRequestSchema,
  ExpensePaymentRecord: ledger.createLedgerPaymentRecordRequestSchema,
  ExpenseConflictResolution: ledger.expenseConflictChainResolutionRequestSchema,
};
schemas.ItemSearchQuery = (schemas.ItemListQuery as z.ZodObject).extend({
  query: z.string().trim().min(1).max(200),
});
for (const action of ["Archive", "Unarchive", "Delete"])
  schemas["Trip" + action] = z.strictObject({
    ...lifecycle,
    action: z.literal(action.toUpperCase()),
  });
for (const [alias, type] of Object.entries({
  ExpenseCreateCommand: "CREATE",
  ExpenseUpdateCommand: "UPDATE",
  ExpenseDeleteCommand: "DELETE",
  ExpenseRestoreCommand: "RESTORE",
  ExpenseValuationCommand: "APPLY_VALUATION",
}))
  schemas[alias] = ledger.expenseCommandRequestSchema
    .extend({
      envelope: ledger.expenseIntentEnvelopeSchema.safeExtend({
        commandId: uuid,
        idempotencyKey: uuid,
        patchOrIntent: ledger.expenseTypedIntentSchema.options.find(
          (v: any) => v.shape.type.value === type,
        )!,
      }),
    })
    .superRefine((v, ctx) => {
      const e = v.envelope,
        t = e.patchOrIntent as any;
      const issue = (message: string) => ctx.addIssue({ code: "custom", message });
      if (t.type === "CREATE") {
        if (e.observedBase !== null || e.observedServerRevision !== 0)
          issue("CREATE requires null base and zero observed revision");
        const check = ledger.createLedgerExpenseRequestSchema.safeParse({
          localId: e.commandId,
          ...t.expense,
        });
        if (!check.success)
          issue("Invalid new Expense business values: " + check.error.message);
        const expense = t.expense;
        if (expense.valuation?.policy === "LEGACY_IMPORTED")
          issue("New manual Expense cannot mint legacy valuation authority");
        const people = expense.participants.map((p: any) => p.memberId),
          splits = expense.splits.map((p: any) => p.memberId);
        if (
          new Set(people).size !== people.length ||
          new Set(splits).size !== splits.length ||
          people.length !== splits.length ||
          people.some((id: string) => !splits.includes(id))
        )
          issue("Expense participants/splits must match uniquely");
        try {
          validateExactAllocation(
            expense.original.minor,
            expense.splits.map((p: any) => p.originalMinor),
          );
        } catch {
          issue("Expense split total mismatch");
        }
      } else if (!e.observedBase && !e.causalBaseReceipt)
        issue("Existing Expense intent requires real base or causal receipt");
      if (
        t.type === "UPDATE" &&
        !Object.values(t.patch).some((group: any) => group && Object.keys(group).length)
      )
        issue("Empty Expense patch");
    });
export function requestSchema(c: (typeof registry)[number]): z.ZodType {
  if (c.path.endsWith("/core/commands")) {
    const commands = c.commandUnits;
    const base = core.coreCommandSchema.omit({ command: true, payload: true });
    return z
      .union(
        commands.map((command) =>
          base.extend({
            command: z.literal(command),
            payload: payload(command, c.family),
          }),
        ) as any,
      )
      .superRefine((q: any, ctx) => {
        const oldPayload = (core.corePayloadSchemas as Record<string, z.ZodType>)[
          q.command
        ];
        if (oldPayload?.safeParse(q.payload).success) {
          try {
            core.validateCoreCommand(q);
          } catch (e) {
            ctx.addIssue({ code: "custom", message: String(e) });
          }
        }
        const protectedFacts = (value: any) => {
          if (!value || typeof value !== "object") return;
          for (const [key, v] of Object.entries(value)) {
            if (
              v !== null &&
              v !== undefined &&
              (key.startsWith("accepted_") ||
                [
                  "instant",
                  "source_instant",
                  "source_instant_precision",
                  "supplied_offset_seconds",
                  "resolution_offset_seconds",
                  "interpretation_key",
                  "interpretation_input_sha256",
                  "provenance_refs",
                  "spatial_provenance_refs",
                  "location_input_revision",
                ].includes(key))
            )
              ctx.addIssue({
                code: "custom",
                message:
                  "Manual payload cannot mint protected/provider/source facts: " + key,
              });
            protectedFacts(v);
          }
        };
        protectedFacts(q.payload);
        if (
          q.admission.mode !== "MANUAL" ||
          q.admission.sourceIntentId !== null ||
          q.admission.policyVersion !== null
        )
          ctx.addIssue({ code: "custom", message: "Manual authored intent only" });
        const targetKind = c.capabilityId.startsWith("otr.expense.")
          ? "EXPENSE_LINK"
          : "ITEM";
        if (q.target.kind !== targetKind)
          ctx.addIssue({ code: "custom", message: "Wrong target kind" });
        const keys = q.baseVector.map((v: any) => v.kind + ":" + v.id);
        if (new Set(keys).size !== keys.length || keys.join() !== [...keys].sort().join())
          ctx.addIssue({
            code: "custom",
            message: "Invalid base vector order/uniqueness",
          });
        const own = q.baseVector.find(
          (v: any) => v.kind === q.target.kind && v.id === q.target.id,
        );
        if (
          !own ||
          (c.capabilityId.endsWith(".create") || c.capabilityId === "otr.expense.link"
            ? own.revision !== null
            : !(own.revision >= 1))
        )
          ctx.addIssue({ code: "custom", message: "Invalid target revision" });
        if (
          targetKind === "EXPENSE_LINK" &&
          (q.baseVector.length !== 2 ||
            !q.baseVector.some(
              (v: any) =>
                v.kind === "ITEM" && v.id === q.payload.targetId && v.revision >= 1,
            ))
        )
          ctx.addIssue({
            code: "custom",
            message: "Expense link requires exact current Item base",
          });
        if (q.baseVector.some((v: any) => v.kind === "SOURCE"))
          ctx.addIssue({ code: "custom", message: "Source authority unavailable" });
        if (Buffer.byteLength(JSON.stringify(q)) > 32768)
          ctx.addIssue({ code: "custom", message: "Core body budget exceeded" });
      });
  }
  const s = schemas[c.requestSchema];
  if (!s) throw Error("No schema " + c.requestSchema);
  return s;
}
export const callSchemas = registry.map((c) =>
  z.strictObject({
    capabilityId: z.literal(c.capabilityId),
    toolName: z.literal(c.toolName),
    pathParams: z.strictObject(
      Object.fromEntries(
        [...c.path.matchAll(/\{(\w+)\}/g)].map((m) => [
          m[1],
          m[1] === "operationId" ? z.string().min(1).max(5000) : uuid,
        ]),
      ),
    ),
    query: c.method === "GET" ? requestSchema(c) : empty,
    request: c.method === "GET" ? empty : requestSchema(c),
  }),
);
