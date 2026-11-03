import { itemEditBaseOutput } from "./contract";
import { coreSparseStayPayloadSchema } from "../src/domain/trip/tripCoreV2Commands";

// Source-ready only; no public tool or deployed Backend capability is inferred.
export function mapSparseStay(rawBase: unknown, rawChange: unknown) {
  const base = itemEditBaseOutput.parse(rawBase),
    item = base.item,
    row = base.record.body as Record<string, unknown>;
  if (
    item.family !== "P3" ||
    base.record.kind !== "ITEM" ||
    base.record.id !== item.itemId ||
    row.id !== item.itemId ||
    row.trip_id !== item.tripId ||
    row.experience_family !== "P3" ||
    base.record.revision !== item.itemRevision ||
    row.semantic_revision !== item.itemRevision
  )
    throw Error("SPARSE_STAY_SCOPE_OR_REVISION_MISMATCH");
  const rooms = row.trip_stay_rooms as Record<string, unknown>[],
    details = row.trip_stay_details as Record<string, unknown>[];
  if (
    [...rooms, ...details].some(
      (r) => r.trip_id !== item.tripId || r.event_id !== item.itemId,
    ) ||
    new Set(rooms.map((r) => r.room_id)).size !== rooms.length ||
    details.length > 1
  )
    throw Error("SPARSE_STAY_CHILD_SCOPE_MISMATCH");
  const payload = coreSparseStayPayloadSchema.parse(rawChange);
  let count = rooms.length;
  const before = (payload.roomChanges ?? []).map((change) => {
    const id = change.operation === "ADD" ? change.room.room_id : change.room_id,
      old = rooms.find((r) => r.room_id === id);
    if (change.operation === "ADD") {
      if (old) throw Error("SPARSE_STAY_ROOM_ALREADY_EXISTS");
      count++;
    } else {
      if (!old) throw Error("SPARSE_STAY_ROOM_NOT_IN_CURRENT_ITEM");
      if (change.operation === "REMOVE") count--;
    }
    return {
      operation: change.operation,
      room_id: id,
      values: old
        ? { category: old.category, quantity: old.quantity, capacity: old.capacity }
        : null,
    };
  });
  if (count > 64) throw Error("SPARSE_STAY_ROOM_LIMIT");
  return {
    payload,
    roomIds: rooms.map((r) => String(r.room_id)).sort(),
    before: {
      details: Object.fromEntries(
        Object.keys(payload.details ?? {}).map((k) => [k, details[0]?.[k] ?? null]),
      ),
      roomChanges: before,
    },
  };
}
