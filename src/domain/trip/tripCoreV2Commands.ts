import { z } from "zod";
import { ordinaryOrderPayload } from "./tripCoreOrdinaryOrder";
import * as f from "./tripCoreV2";
import { coreBoundarySchema } from "./tripCoreV2Temporal";
import {
  flightEndpointSchema,
  flightServicesSchema,
  flightCommandLeaves,
} from "./flightAdmission";
const ids = z
  .array(f.coreUuid)
  .max(64)
  .refine((a) => new Set(a).size === a.length);
const core = z.strictObject({
  title: f.coreText(200).refine((s) => s.trim().length > 0),
  description: f.coreText(5000).nullable().optional(),
});
const common = {
  id: true,
  trip_id: true,
  revision: true,
  owner_account_id: true,
  visibility: true,
  hidden_at: true,
  created_at: true,
  updated_at: true,
  field_state: true,
} as const;
export const bookingFields = f.itinerary_reservationsSchema
  .omit({
    ...common,
    business_contract_version: true,
    commercial_status: true,
    replaces_booking_id: true,
  })
  .partial();
export const entitlementFields = f.trip_entitlementsSchema
  .omit({ ...common, status: true })
  .partial();
const room = f.trip_stay_roomsSchema.omit({ trip_id: true, event_id: true });
const stay = f.trip_stay_detailsSchema.omit({ trip_id: true, event_id: true }).partial();
const rental = f.trip_rental_detailsSchema
  .omit({ trip_id: true, event_id: true })
  .partial();
const activity = f.trip_activity_detailsSchema
  .omit({ trip_id: true, event_id: true })
  .partial();
const places = z.strictObject({
  pickup: f.corePlaceSchema.nullable().optional(),
  return: f.corePlaceSchema.nullable().optional(),
});
const endpoint = z.strictObject({ time: coreBoundarySchema, place: f.corePlaceSchema });
const endpoints = z.strictObject({ origin: endpoint, destination: endpoint });
const service = f.itinerary_transport_servicesSchema
  .omit({ trip_id: true, event_id: true })
  .extend({
    transport_subtype: z.enum([
      "TRAIN",
      "BUS",
      "FERRY",
      "WATER_TAXI",
      "SHUTTLE",
      "TRANSFER",
    ]),
  });
const annotations = z.strictObject({
  airport_code: f.coreText(8).nullable(),
  terminal: f.coreText(128).nullable(),
  platform: f.coreText(128).nullable(),
  pier: f.coreText(128).nullable(),
});
const operational = z
  .array(
    z.strictObject({
      role: z.enum(["MEETING", "CHECKIN", "BOARDING_CUTOFF"]),
      time: coreBoundarySchema,
      place: f.corePlaceSchema,
    }),
  )
  .max(3)
  .refine((a) => new Set(a.map((x) => x.role)).size === a.length);
const createBase = {
  core,
  participation: f.coreParticipationSchema,
  acl: f.coreAclSchema,
  category: f.itinerary_eventsSchema.shape.activity_category.optional(),
};
const generic = {
  ...createBase,
  schedule: f.coreScheduleSchema,
  place: f.corePlaceSchema.optional(),
};
const createItem = z.discriminatedUnion("family", [
  z.strictObject({ ...generic, family: z.literal("P1") }),
  z
    .strictObject({
      ...generic,
      family: z.literal("P3"),
      details: stay.optional(),
      rooms: z.array(room).max(64).optional(),
    })
    .refine(
      (v) =>
        v.schedule.end?.local_date !== null && v.schedule.end?.local_date !== undefined,
    ),
  z.strictObject({
    ...createBase,
    family: z.literal("P4"),
    schedule: f.coreScheduleSchema,
    details: rental.optional(),
    places: places.optional(),
  }),
  z.strictObject({
    ...createBase,
    family: z.literal("P5"),
    endpoints,
    service,
    annotations: z
      .strictObject({ origin: annotations, destination: annotations })
      .optional(),
    operationalFacts: operational.optional(),
  }),
  z.strictObject({
    ...generic,
    family: z.literal("P6"),
    details: activity.optional(),
    entryPlace: f.corePlaceSchema.nullable().optional(),
  }),
]);
const proofs = z
  .record(
    f.coreText(128),
    z.union([
      z.strictObject({
        kind: z.literal("TRACK_C"),
        ref: f
          .coreText(512)
          .regex(
            /^track-c\/field-evidence\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._:-]{1,128}$/,
          ),
      }),
      z.strictObject({
        kind: z.literal("RETAINED"),
        ref: f.coreText(512).refine((s) => s.trim().length > 0),
      }),
    ]),
  )
  .refine((p) => Object.keys(p).length <= 64);
const fullFlight = {
  origin: flightEndpointSchema,
  destination: flightEndpointSchema,
  services: flightServicesSchema,
  proofs,
};
const observation = f.trip_booking_observationsSchema
  .omit({ trip_id: true, booking_id: true })
  .extend({ evidence_ref: f.coreText(512).nullable() });
const changeIds = z
  .strictObject({ add: ids, remove: ids })
  .refine((v) => !v.add.some((id) => v.remove.includes(id)));
const ticketLink = f.trip_entitlement_item_linksSchema
  .omit({
    trip_id: true,
    entitlement_id: true,
    active: true,
    linked_by: true,
    linked_at: true,
  })
  .partial()
  .extend({ itemId: f.coreUuid })
  .omit({ item_id: true });
const typedId = z.strictObject({
  kind: z.enum([
    "ORDER",
    "ITEM",
    "BOOKING",
    "ENTITLEMENT",
    "DOCUMENT",
    "INSTRUCTION",
    "EXPENSE_LINK",
  ]),
  id: f.coreUuid,
});
const lifecycle = { graphHash: f.coreHash };
export const corePayloadSchemas = {
  SET_ORDINARY_ORDER: ordinaryOrderPayload,
  CREATE_ITEM: createItem,
  CREATE_SPARSE_FLIGHT: z.strictObject({
    flightNumberLiteral: f.coreText(255).refine((s) => s.trim().length > 0),
    departureDate: f.coreScheduleSchema.shape.start.shape.local_date.unwrap(),
    core: core.optional(),
    participation: f.coreParticipationSchema,
    acl: f.coreAclSchema,
  }),
  QUALIFY_FLIGHT: z.strictObject(fullFlight),
  UPDATE_FLIGHT_FACTS: z.strictObject({
    changes: z
      .strictObject({
        title: core.shape.title.optional(),
        origin: flightEndpointSchema.optional(),
        destination: flightEndpointSchema.optional(),
      })
      .refine((v) => Object.keys(v).length > 0),
    proofs,
  }),
  REPLACE_FLIGHT_SERVICE: z.strictObject({
    ...fullFlight,
    replacementReason: f.coreText(2000).refine((s) => s.trim().length > 0),
  }),
  SET_ITEM_TEXT: core.partial().refine((v) => Object.keys(v).length > 0),
  SET_ITEM_SCHEDULE: z.strictObject({ schedule: f.coreScheduleSchema }),
  SET_ITEM_PLACE: z.strictObject({ place: f.corePlaceSchema }),
  SET_ITEM_GROUPING: z.strictObject({
    tripDayId: f.coreUuid.nullable(),
    orderIndex: z.number().int().min(-2147483648).max(2147483647).nullable(),
  }),
  SET_ITEM_PARTICIPATION: z.strictObject({ participation: f.coreParticipationSchema }),
  SET_OBJECT_VISIBILITY: z.strictObject({ acl: f.coreAclSchema }),
  SET_ITEM_CATEGORY: z.strictObject({
    family: z.enum(["P1", "P6"]),
    category: f.itinerary_eventsSchema.shape.activity_category,
  }),
  SET_ITEM_STATUS: z.strictObject({
    status: z.enum(["planned", "skipped", "completed"]),
  }),
  SET_STAY_DETAILS: z.strictObject({ details: stay, rooms: z.array(room).max(64) }),
  SET_RENTAL_DETAILS: z.strictObject({ details: rental, places }),
  SET_ACTIVITY_DETAILS: z.strictObject({
    details: activity,
    entryPlace: f.corePlaceSchema.nullable(),
  }),
  SET_TRANSPORT_DETAILS: z
    .strictObject({
      endpoints: endpoints.optional(),
      service: service.optional(),
      annotations: z
        .strictObject({
          origin: annotations.optional(),
          destination: annotations.optional(),
        })
        .optional(),
      operationalFacts: operational.optional(),
    })
    .refine((v) => Object.keys(v).length > 0),
  CREATE_BOOKING: z.strictObject({
    fields: bookingFields,
    observations: z.array(observation).max(64),
    itemIds: ids,
    entitlementIds: ids,
    documentIds: ids,
    acl: f.coreAclSchema,
  }),
  UPDATE_BOOKING: z.strictObject({
    fields: bookingFields,
    appendObservations: z.array(observation).max(64),
  }),
  RECONCILE_BOOKING_LINKS: z.strictObject({
    items: changeIds,
    entitlements: changeIds,
    documents: changeIds,
  }),
  REPLACE_BOOKING: z.strictObject({
    newBookingId: f.coreUuid,
    fields: bookingFields,
    observations: z.array(observation).max(64),
    transferItemIds: ids,
    transferEntitlementIds: ids,
    acl: f.coreAclSchema,
    ...lifecycle,
  }),
  CREATE_ENTITLEMENT: z.strictObject({
    fields: entitlementFields,
    holders: ids,
    itemLinks: z.array(ticketLink).max(64),
    documentIds: ids,
    acl: f.coreAclSchema,
  }),
  UPDATE_ENTITLEMENT: z.strictObject({ fields: entitlementFields, holders: ids }),
  RECONCILE_ENTITLEMENT_LINKS: z.strictObject({
    items: z.strictObject({ add: z.array(ticketLink).max(64), remove: ids }),
    documents: changeIds,
  }),
  CREATE_DOCUMENT: z.strictObject({
    fields: f.trip_operational_documentsSchema.omit({
      ...common,
      storage_object_key: true,
      custody_receipt_id: true,
    }),
    acl: f.coreAclSchema,
    custodyProofId: f.coreUuid,
  }),
  RECONCILE_ITEM_DOCUMENTS: changeIds,
  APPEND_INSTRUCTION: z.strictObject({
    itemId: f.coreUuid,
    section: f.trip_instruction_entriesSchema.shape.section,
    body: f.coreText(5000).refine((s) => s.trim().length > 0),
    sensitivity: z.enum(["NORMAL", "SENSITIVE"]),
    sourceRepresentationId: f.coreUuid.nullable(),
    acl: f.coreAclSchema,
  }),
  CORRECT_INSTRUCTION: z.strictObject({
    newEntryId: f.coreUuid,
    body: f.coreText(5000).refine((s) => s.trim().length > 0),
    sensitivity: z.enum(["NORMAL", "SENSITIVE"]),
    acl: f.coreAclSchema,
  }),
  LINK_EXPENSE: z.strictObject({
    expenseId: f.coreUuid,
    targetKind: z.enum(["ITEM", "BOOKING", "DOCUMENT"]),
    targetId: f.coreUuid,
  }),
  UNLINK_EXPENSE: z.strictObject({
    expenseId: f.coreUuid,
    targetKind: z.enum(["ITEM", "BOOKING", "DOCUMENT"]),
    targetId: f.coreUuid,
  }),
  CANCEL_ARRANGEMENT: z.strictObject({
    scope: z.enum(["ITEM_ONLY", "EXCLUSIVE_ARRANGEMENT", "WHOLE_BOOKING"]),
    affectedItems: ids,
    affectedBookings: ids,
    ...lifecycle,
  }),
  CANCEL_ENTITLEMENT: z.strictObject({ reason: f.coreText(2000) }),
  HIDE_OBJECT: z.strictObject({
    scope: z.enum(["OBJECT_ONLY", "EXCLUSIVE_ARRANGEMENT"]),
    affectedIds: z.array(typedId).max(32),
    ...lifecycle,
  }),
  RESTORE_OBJECT: z.strictObject({
    scope: z.enum(["OBJECT_ONLY", "EXCLUSIVE_ARRANGEMENT"]),
    affectedIds: z.array(typedId).max(32),
    ...lifecycle,
  }),
  AUTHORIZE_DOCUMENT_COPY: z.strictObject({
    sourceRepresentationId: f.coreUuid,
    documentId: f.coreUuid,
    sha256: f.coreHash,
    acl: f.coreAclSchema,
  }),
} as const;
export type CoreCommandName = keyof typeof corePayloadSchemas;
const commands = Object.keys(corePayloadSchemas) as [
  CoreCommandName,
  ...CoreCommandName[],
];
export const coreVectorEntrySchema = z.strictObject({
  kind: z.enum([
    "ORDER",
    "ITEM",
    "BOOKING",
    "ENTITLEMENT",
    "DOCUMENT",
    "INSTRUCTION",
    "EXPENSE_LINK",
    "SOURCE",
  ]),
  id: f.coreUuid,
  revision: f.coreRevision.nullable(),
});
export const coreCommandSchema = z.strictObject({
  contractVersion: z.literal(2),
  intentVersion: z.literal(2),
  operationId: f.coreUuid,
  tripId: f.coreUuid,
  command: z.enum(commands),
  target: typedId,
  baseVector: z.array(coreVectorEntrySchema).min(1).max(32),
  admission: z.strictObject({
    mode: z.enum(["MANUAL", "REVIEWED_SOURCE", "AUTO_SOURCE"]),
    sourceIntentId: f.coreUuid.nullable(),
    policyVersion: z.literal("otr.trip.auto-admit/1").nullable(),
  }),
  payload: z.unknown(),
});
export type CoreCommand = z.infer<typeof coreCommandSchema>;
export function validateCoreCommand(input: unknown): CoreCommand {
  const q = coreCommandSchema.parse(input);
  const payload = corePayloadSchemas[q.command].parse(q.payload);
  const expectedKind =
    q.command === "SET_ORDINARY_ORDER"
      ? "ORDER"
      : q.command.includes("BOOKING")
        ? "BOOKING"
        : q.command.includes("ENTITLEMENT")
          ? "ENTITLEMENT"
          : q.command === "CREATE_DOCUMENT"
            ? "DOCUMENT"
            : q.command === "APPEND_INSTRUCTION" || q.command === "CORRECT_INSTRUCTION"
              ? "INSTRUCTION"
              : q.command === "LINK_EXPENSE" || q.command === "UNLINK_EXPENSE"
                ? "EXPENSE_LINK"
                : q.command === "AUTHORIZE_DOCUMENT_COPY"
                  ? "DOCUMENT"
                  : ["HIDE_OBJECT", "RESTORE_OBJECT", "SET_OBJECT_VISIBILITY"].includes(
                        q.command,
                      )
                    ? q.target.kind
                    : "ITEM";
  if (
    q.target.kind === "ORDER" &&
    (q.command !== "SET_ORDINARY_ORDER" || q.admission.mode !== "MANUAL")
  )
    throw new Error("SCOPE_NOT_AUTHORIZED");
  if (q.target.kind !== expectedKind) throw new Error("INVALID_TARGET_KIND");
  const keys = q.baseVector.map((x) => `${x.kind}:${x.id}`);
  if (
    new Set(keys).size !== keys.length ||
    keys.join("\0") !== [...keys].sort().join("\0") ||
    !q.baseVector.some((x) => x.id === q.target.id && x.kind === q.target.kind)
  )
    throw new Error("INVALID_BASE_VECTOR");
  if (
    q.baseVector.some((x) => x.kind === "SOURCE") &&
    q.command !== "AUTHORIZE_DOCUMENT_COPY"
  )
    throw new Error("INVALID_BASE_VECTOR");
  const a = q.admission;
  if (
    a.mode === "MANUAL"
      ? a.sourceIntentId !== null || a.policyVersion !== null
      : a.sourceIntentId === null ||
        (a.mode === "AUTO_SOURCE" ? a.policyVersion === null : a.policyVersion !== null)
  )
    throw new Error("INVALID_ADMISSION_BINDING");
  if (
    ["QUALIFY_FLIGHT", "REPLACE_FLIGHT_SERVICE", "UPDATE_FLIGHT_FACTS"].includes(
      q.command,
    )
  ) {
    if (a.mode === "MANUAL") throw new Error("INVALID_PROVENANCE");
    const v = payload as z.infer<typeof corePayloadSchemas.QUALIFY_FLIGHT>;
    const values =
      "changes" in v
        ? (v as unknown as { changes: Parameters<typeof flightCommandLeaves>[0] }).changes
        : v;
    const leaves = flightCommandLeaves(values),
      available = flightCommandLeaves(values, q.command === "UPDATE_FLIGHT_FACTS");
    if (
      values.origin &&
      (values.origin.time.local_date === null ||
        values.origin.time.quality !== "EXACT" ||
        values.origin.time.source_instant === null)
    )
      throw new Error("UNRESOLVED_TEMPORAL");
    if (
      Object.keys(leaves).some((k) => !Object.hasOwn(v.proofs, k)) ||
      Object.keys(v.proofs).some((k) => !Object.hasOwn(available, k))
    )
      throw new Error("INVALID_PROVENANCE");
  }
  return { ...q, payload };
}
export const coreCapabilitiesSchema = z
  .strictObject({
    contractVersion: z.literal(2),
    commandVersion: z.literal(2),
    readVersion: z.literal(2),
    captureVersion: z.literal(2),
    activationState: z.enum(["CLOSED", "ENABLED"]),
    enabledCommands: z.array(z.enum(commands)).max(commands.length),
    enabledFamilies: z.array(z.enum(["P1", "P2", "P3", "P4", "P5", "P6"])).max(6),
    enabledAdmissionModes: z
      .array(z.enum(["MANUAL", "REVIEWED_SOURCE", "AUTO_SOURCE"]))
      .max(3),
    maximumRequestBytes: z.literal(32768),
    maximumAffectedRoots: z.literal(32),
    maximumRelations: z.literal(64),
    resolverAvailable: z.boolean(),
    sourceEvidenceAvailable: z.boolean(),
    operationalCustodyAvailable: z.boolean(),
  })
  .refine(
    (c) =>
      (c.activationState !== "CLOSED" ||
        (!c.enabledCommands.length &&
          !c.enabledFamilies.length &&
          !c.enabledAdmissionModes.length)) &&
      new Set(c.enabledCommands).size === c.enabledCommands.length &&
      new Set(c.enabledFamilies).size === c.enabledFamilies.length &&
      new Set(c.enabledAdmissionModes).size === c.enabledAdmissionModes.length,
  );
export type CoreCapabilities = z.infer<typeof coreCapabilitiesSchema>;
export const coreClosedCapabilities = {
  contractVersion: 2,
  commandVersion: 2,
  readVersion: 2,
  captureVersion: 2,
  activationState: "CLOSED",
  enabledCommands: [],
  enabledFamilies: [],
  enabledAdmissionModes: [],
  maximumRequestBytes: 32768,
  maximumAffectedRoots: 32,
  maximumRelations: 64,
  resolverAvailable: false,
  sourceEvidenceAvailable: false,
  operationalCustodyAvailable: false,
} as const;

// Shared queue classification only; owning Source and Core still verify admission.
export function isReviewedSourceCreate(command: CoreCommand): boolean {
  return (
    command.target.kind === "ITEM" &&
    command.admission.mode === "REVIEWED_SOURCE" &&
    command.admission.sourceIntentId !== null &&
    command.admission.policyVersion === null &&
    (command.command === "CREATE_SPARSE_FLIGHT" ||
      (command.command === "CREATE_ITEM" &&
        ["P1", "P3", "P4", "P5", "P6"].includes(
          String((command.payload as { family: string }).family),
        )))
  );
}
