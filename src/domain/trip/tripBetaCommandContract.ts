import { z } from "zod";
import { coreUuid } from "./tripCoreV2";
import {
  coreCommandSchema,
  corePayloadSchemas,
  coreSparseStayPayloadSchema,
  sparseTransportPatchSchema,
  validateCoreCommand,
  type CoreCommandName,
} from "./tripCoreV2Commands";
import {
  authoredPlacePatchSchema,
  sparseSchedulePatchSchema,
} from "./tripCoreSparseFields";

export type BetaItemFamily = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
export type BetaItemAction =
  "create" | "update" | "hide" | "restore" | "delete" | "visibility" | "participation";
const familyUpdates: Record<BetaItemFamily, CoreCommandName[]> = {
  P1: [
    "SET_ITEM_TEXT",
    "SET_ITEM_SCHEDULE",
    "SET_ITEM_PLACE",
    "SET_ITEM_CATEGORY",
    "SET_ITEM_GROUPING",
    "SET_ITEM_STATUS",
  ],
  P2: ["SET_ITEM_TEXT", "SET_AUTHORED_FLIGHT_DETAILS"],
  P3: ["SET_ITEM_TEXT", "SET_ITEM_SCHEDULE", "SET_ITEM_PLACE", "SET_STAY_DETAILS"],
  P4: ["SET_ITEM_TEXT", "SET_ITEM_SCHEDULE", "SET_RENTAL_DETAILS"],
  P5: ["SET_ITEM_TEXT", "SET_TRANSPORT_DETAILS"],
  P6: [
    "SET_ITEM_TEXT",
    "SET_ITEM_SCHEDULE",
    "SET_ITEM_PLACE",
    "SET_ITEM_CATEGORY",
    "SET_ITEM_STATUS",
    "SET_ACTIVITY_DETAILS",
  ],
};
const envelope = coreCommandSchema.omit({
  command: true,
  payload: true,
  target: true,
  admission: true,
});
const admission = z.strictObject({
  mode: z.literal("MANUAL"),
  sourceIntentId: z.null(),
  policyVersion: z.null(),
});
const providerOnly = new Set([
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
]);
function providerValue(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) =>
      ((key.startsWith("accepted_") || providerOnly.has(key)) &&
        child !== null &&
        child !== undefined) ||
      providerValue(child),
  );
}
function subtype(
  command: CoreCommandName,
  payload: z.ZodType,
  target: "ITEM" | "EXPENSE_LINK" = "ITEM",
) {
  return envelope.extend({
    command: z.literal(command),
    payload,
    admission,
    target: z.strictObject({ kind: z.literal(target), id: coreUuid }),
  });
}
// Pure frozen MCP input validation; Native complete setters and old queued intents
// remain on their existing schemas. This grants no Source/Provider authority.
export function betaItemCommandSchema(family: BetaItemFamily, action: BetaItemAction) {
  const names: CoreCommandName[] =
    action === "create"
      ? [family === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM"]
      : action === "update"
        ? familyUpdates[family]
        : [
            (
              {
                hide: "HIDE_OBJECT",
                restore: "RESTORE_OBJECT",
                delete: "DELETE_ITEM",
                visibility: "SET_OBJECT_VISIBILITY",
                participation: "SET_ITEM_PARTICIPATION",
              } as const
            )[action],
          ];
  const variants = names.map((name) => {
    let payload: z.ZodType = corePayloadSchemas[name];
    if (name === "CREATE_ITEM")
      payload = corePayloadSchemas.CREATE_ITEM.options.find(
        (s) => s.shape.family.value === family,
      )!;
    if (name === "SET_ITEM_TEXT" && family === "P2")
      payload = z.strictObject({
        description: corePayloadSchemas.SET_ITEM_TEXT.shape.description.unwrap(),
      });
    if (name === "SET_ITEM_SCHEDULE")
      payload = z.strictObject({ schedulePatch: sparseSchedulePatchSchema });
    if (name === "SET_ITEM_PLACE")
      payload = z.strictObject({ place: authoredPlacePatchSchema });
    if (name === "SET_STAY_DETAILS") payload = coreSparseStayPayloadSchema;
    if (name === "SET_RENTAL_DETAILS")
      payload = corePayloadSchemas.SET_RENTAL_DETAILS.options[1];
    if (name === "SET_ACTIVITY_DETAILS")
      payload = corePayloadSchemas.SET_ACTIVITY_DETAILS.options[1];
    if (name === "SET_TRANSPORT_DETAILS")
      payload = z.strictObject({ patch: sparseTransportPatchSchema });
    if (name === "SET_ITEM_CATEGORY")
      payload = corePayloadSchemas.SET_ITEM_CATEGORY.extend({
        family: z.literal(family),
      });
    return subtype(name, payload);
  });
  const schema = variants.length === 1 ? variants[0] : z.union(variants);
  return schema.superRefine((value, ctx) => {
    try {
      const command = validateCoreCommand(value);
      if (providerValue(command.payload)) throw new Error("PROVIDER_FIELDS_READONLY");
      const payload = command.payload as {
        flightNumberLiteral?: string;
        core?: { title?: string };
        rooms?: { room_id: string }[];
      };
      if (
        command.command === "CREATE_SPARSE_FLIGHT" &&
        payload.core?.title !== undefined &&
        payload.core.title !== payload.flightNumberLiteral
      )
        throw new Error("FLIGHT_TITLE_LITERAL_MISMATCH");
      if (
        payload.rooms &&
        new Set(payload.rooms.map((r) => r.room_id)).size !== payload.rooms.length
      )
        throw new Error("DUPLICATE_ROOM");
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "INVALID_BETA_COMMAND",
      });
    }
  });
}
export function betaExpenseLinkCommandSchema(unlink: boolean) {
  const name = unlink ? "UNLINK_EXPENSE" : "LINK_EXPENSE";
  return subtype(
    name,
    z.strictObject({
      expenseId: coreUuid,
      targetKind: z.literal("ITEM"),
      targetId: coreUuid,
      expectedExpenseRevision: z.number().int().positive().safe(),
    }),
    "EXPENSE_LINK",
  ).superRefine((value, ctx) => {
    try {
      validateCoreCommand(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "INVALID_BETA_COMMAND" });
    }
  });
}
