import { z } from "zod";
import { uuid, itemEditBaseOutput } from "./contract";
import {
  coreSparseStayPayloadSchema,
  validateCoreCommand,
} from "../src/domain/trip/tripCoreV2Commands";
import { canonicalCoreJson, type Json } from "../src/domain/trip/tripCoreV2Json";
import { contentDigest, type PreparedMutation } from "./mutation";
import { mapSparseStay } from "./sparseStay";

// Unmounted until the owning Host qualifies sparse Stay software; the legacy STAY guard stays intact.
export function prepareSparseStayUpdate(raw: unknown): PreparedMutation {
  const q = z
    .strictObject({
      request_id: uuid,
      base: itemEditBaseOutput,
      change: coreSparseStayPayloadSchema,
    })
    .parse(raw);
  const mapped = mapSparseStay(q.base, q.change),
    item = q.base.item;
  return {
    kind: "ITEM",
    readBase: item,
    sparseStay: {
      baseDigest: contentDigest(q.base.record),
      change: mapped.payload,
      roomIds: mapped.roomIds,
    },
    command: validateCoreCommand({
      contractVersion: 2,
      intentVersion: 2,
      operationId: q.request_id,
      tripId: item.tripId,
      command: "SET_STAY_DETAILS",
      target: { kind: "ITEM", id: item.itemId },
      baseVector: [{ kind: "ITEM", id: item.itemId, revision: item.itemRevision }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: mapped.payload,
    }),
    summary: `Sparse Stay on ${item.itemId} at revision${item.itemRevision}; before: ${canonicalCoreJson(mapped.before as Json)}; change: ${canonicalCoreJson(mapped.payload as Json)}; omitted facts and provenance retained; null explicitly clears; ADD/REMOVE are explicit room operations.`,
  };
}
