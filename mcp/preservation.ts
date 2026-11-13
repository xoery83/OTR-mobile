import { contentDigest, type PreparedMutation } from "./mutation";
import type { createReadTools } from "./read";

// Inspect the already-authorized redacted record; absence of evidence_ref is not proof of manual origin.
export async function guardSourcePreservation(
  prepared: PreparedMutation,
  reads: ReturnType<typeof createReadTools>,
) {
  if (
    prepared.kind !== "ITEM" ||
    !["SET_ITEM_TEXT", "SET_ITEM_SCHEDULE", "SET_AUTHORED_FLIGHT_DETAILS"].includes(
      prepared.command.command,
    )
  )
    return null;
  const q = prepared.command;
  const base = await reads.get_trip_item_edit_base({
    trip_id: q.tripId,
    item_id: q.target.id,
  });
  const row = base.record.body as Record<string, unknown>;
  const states = row.field_state as Record<
    string,
    { origin?: string; evidence_ref?: unknown; protected?: boolean }
  >;
  const sensitive = (s: { origin?: string; evidence_ref?: unknown }) =>
    s.origin !== "MANUAL" || (s.evidence_ref !== null && s.evidence_ref !== undefined);
  if (q.command === "SET_ITEM_TEXT") {
    const fields = q.payload as Record<string, unknown>;
    for (const [field, next] of Object.entries(fields))
      if (
        states[`itinerary_events.${field}`] &&
        sensitive(states[`itinerary_events.${field}`]) &&
        contentDigest(row[field]) === contentDigest(next)
      )
        return "OMIT_UNCHANGED_SOURCE_TEXT_FIELD";
    return null;
  }
  if (q.command === "SET_AUTHORED_FLIGHT_DETAILS")
    return Object.entries(states).some(
      ([key, state]) =>
        sensitive(state) &&
        (key === "itinerary_events.title" ||
          /^itinerary_events\.(start_|end_|planned_start|planned_end)/.test(key) ||
          /^(itinerary_transport_|trip_endpoint_|trip_flight_)/.test(key)),
    )
      ? "SOURCE_FLIGHT_PATCH_REQUIRES_OWNING_PRESERVATION"
      : null;
  return Object.entries(states).some(
    ([key, state]) =>
      sensitive(state) &&
      /^itinerary_events\.(start_|end_|planned_start|planned_end)/.test(key),
  )
    ? "SOURCE_SCHEDULE_PATCH_REQUIRES_OWNING_PRESERVATION"
    : null;
}
