import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
import { applyCoreCommand, emptyCoreGraph } from "../../src/domain/trip/tripCoreV2Mutation";

it("preserves IMPORT provenance and LOCAL_ONLY document linking on the Parent release baseline", () => {
  const tripId = randomUUID(), accountId = randomUUID(), personId = randomUUID();
  const actor = { accountId, tripId, personId, personIds: [personId], active: true, canManageShared: false };
  const item = randomUUID(), document = randomUUID();
  const request = (command: string, id: string, kind: string, payload: unknown, revision: number | null = null) => ({
    contractVersion: 2, intentVersion: 2, operationId: randomUUID(), tripId, command,
    target: { kind, id }, baseVector: [{ kind, id, revision }],
    admission: { mode: "IMPORT", sourceIntentId: null, policyVersion: null }, payload,
  });
  const create = request("CREATE_ITEM", item, "ITEM", {
    family: "P1", core: { title: "Synthetic imported walk" },
    schedule: { start: coreDateBoundary("2026-12-14") }, ...coreDefaults("member"),
  });
  const now = "2026-11-14T00:00:00Z";
  expect(() => applyCoreCommand(emptyCoreGraph(), create, actor, now)).toThrow("INVALID_PROVENANCE");
  // Mutation projection only: production storage must independently verify admission.
  let graph = applyCoreCommand(emptyCoreGraph(), create, actor, now, true).graph;
  const fields = Object.values(graph.itinerary_events[0].field_state as Record<string, { origin: string }>);
  expect(fields.length).toBeGreaterThan(0);
  expect(fields.every(field => field.origin === "PROVIDER")).toBe(true);
  graph = applyCoreCommand(graph, request("CREATE_DOCUMENT_METADATA", document, "DOCUMENT", {
    title: "Synthetic ticket", media_type: "application/pdf", byte_size: 20, sha256: "a".repeat(64),
  }), actor, now, true).graph;
  expect(graph.trip_operational_documents[0]).toMatchObject({ custody: "LOCAL_ONLY", storage_object_key: null, owner_account_id: accountId });
  const link = request("RECONCILE_ITEM_DOCUMENTS", item, "ITEM", { add: [document], remove: [] }, 1);
  link.baseVector.push({ kind: "DOCUMENT", id: document, revision: 1 });
  link.baseVector.sort((a, b) => (a.kind + a.id).localeCompare(b.kind + b.id));
  graph = applyCoreCommand(graph, link, actor, now, true).graph;
  expect(graph.trip_item_document_links).toMatchObject([{ item_id: item, document_id: document }]);
  expect(() => validateCoreCommand({ ...link, payload: { add: [], remove: [document] } })).toThrow("SCOPE_NOT_AUTHORIZED");
});
