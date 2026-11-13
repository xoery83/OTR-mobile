import { itemEditBaseOutput } from "./contract";
import { corePlaceSchema } from "../src/domain/trip/tripCoreV2";

// Local contract only: public field tools stay fail-closed until their live guard supports this full snapshot.
export const structuredManualPlacePatch = corePlaceSchema
  .pick({
    authored_label: true,
    authored_text: true,
    authored_address: true,
    authored_address_line1: true,
    authored_address_line2: true,
    authored_address_locality: true,
    authored_address_region: true,
    authored_address_postal_code: true,
    authored_address_country: true,
  })
  .partial()
  .strict()
  .refine(
    (p) => Object.values(p).some((v) => v !== undefined),
    "At least one explicit authored field is required",
  );
const authored = new Set(Object.keys(structuredManualPlacePatch.shape));

function scopedBase(rawBase: unknown) {
  const base = itemEditBaseOutput.parse(rawBase);
  const row = base.record.body as Record<string, unknown>;
  if (
    base.record.kind !== "ITEM" ||
    base.record.id !== base.item.itemId ||
    row.id !== base.item.itemId ||
    row.trip_id !== base.item.tripId ||
    base.record.revision !== base.item.itemRevision ||
    row.semantic_revision !== base.item.itemRevision ||
    row.experience_family !== base.item.family
  )
    throw Error("CURRENT_ITEM_SCOPE_OR_REVISION_MISMATCH");
  return { base, row };
}

function mapManualTuple(
  row: Record<string, unknown>,
  states: Record<string, { origin: string; evidence_ref: unknown }>,
  prefix: string,
  rawPatch: unknown,
) {
  const before = corePlaceSchema.parse(
    Object.fromEntries(Object.keys(corePlaceSchema.shape).map((key) => [key, row[key]])),
  );
  for (const [key, value] of Object.entries(before)) {
    if (!authored.has(key) && value !== null)
      throw Error("MATCHED_PLACE_REQUIRES_OWNING_PRESERVATION");
    const state = states[`${prefix}.${key}`];
    if (
      (value !== null && !state) ||
      (state && (state.origin !== "MANUAL" || state.evidence_ref !== null))
    )
      throw Error("SOURCE_PLACE_REQUIRES_OWNING_PRESERVATION");
  }
  const patch = structuredManualPlacePatch.parse(rawPatch);
  return {
    before,
    after: corePlaceSchema.parse({
      ...before,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ),
    }),
  };
}

export function mapStructuredManualPlace(rawBase: unknown, rawPatch: unknown) {
  const { base, row } = scopedBase(rawBase);
  if (!["P1", "P3", "P6"].includes(base.item.family))
    throw Error("USE_FAMILY_PLACE_ADAPTER");
  const { before, after } = mapManualTuple(
    row,
    row.field_state as Record<string, { origin: string; evidence_ref: unknown }>,
    "itinerary_events",
    rawPatch,
  );
  return {
    before,
    payload: { place: after },
    tracking_effect:
      "Core reasserts the entire place group's MANUAL/protected field state at the new revision; this is not a sparse provenance patch.",
  };
}

export function mapRentalManualPlace(
  rawBase: unknown,
  role: "PICKUP" | "RETURN",
  rawPatch: unknown,
) {
  const { base, row } = scopedBase(rawBase);
  if (base.item.family !== "P4") throw Error("FAMILY_MISMATCH");
  const children = (key: string) => {
    const rows = row[key];
    if (
      !Array.isArray(rows) ||
      rows.some(
        (r) => !r || r.trip_id !== base.item.tripId || r.event_id !== base.item.itemId,
      )
    )
      throw Error("RENTAL_CHILD_SCOPE_MISMATCH");
    return rows as Record<string, unknown>[];
  };
  if (children("trip_rental_details").length !== 1)
    throw Error("RENTAL_DETAILS_REQUIRED");
  const places = children("trip_rental_places");
  if (
    places.some((r) => r.role !== "PICKUP" && r.role !== "RETURN") ||
    new Set(places.map((r) => r.role)).size !== places.length
  )
    throw Error("RENTAL_PLACE_ROLE_MISMATCH");
  const selected = places.find((r) => r.role === role);
  if (!selected) throw Error("RENTAL_PLACE_REQUIRED");
  const { before, after } = mapManualTuple(
    selected,
    row.field_state as Record<string, { origin: string; evidence_ref: unknown }>,
    `trip_rental_places.${role}`,
    rawPatch,
  );
  return {
    before,
    payload: {
      details: {},
      places: { [role === "PICKUP" ? "pickup" : "return"]: after },
    },
    tracking_effect:
      "Core reasserts the entire selected rental place group's MANUAL/protected field state at the new revision; omitted opposite role and Rental details are preserved.",
  };
}
