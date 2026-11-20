import { p5IdentityPatch, upgradeLegacyP5Identity } from "./p5Identity";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { validateCoreCommand } from "./tripCoreV2Commands";
import { applyCoreCommand, emptyCoreGraph, type CoreActor } from "./tripCoreV2Mutation";
import { coreDefaults, corePlaceSchema } from "./tripCoreV2";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import { projectCoreItem } from "./tripCoreV2Views";
const fields = [
  "operator_namespace",
  "operator_issuer",
  "operator_value",
  "operator_literal",
  "service_number",
  "service_literal",
];
const identity = {
  version: 1,
  fields: Object.fromEntries(fields.map((k) => [k, "UNKNOWN"])),
};
const sparse = () => ({
  service_key: "main",
  transport_subtype: "BUS",
  attribution: "UNSPECIFIED",
  codeshare_operating_key: null,
  ...Object.fromEntries(fields.map((k) => [k, null])),
  identity_state: structuredClone(identity),
});
const known = () => ({
  service_key: "main",
  transport_subtype: "BUS",
  attribution: "UNSPECIFIED",
  codeshare_operating_key: null,
  operator_namespace: "NAME",
  operator_issuer: "Authored",
  operator_value: "SyntheticBus",
  operator_literal: "Synthetic Bus",
  service_number: "12",
  service_literal: "Route 12",
});
function fixture(service: unknown = sparse()) {
  const actor: CoreActor = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    personId: null,
    personIds: [],
    active: true,
    canManageShared: false,
  };
  const place = corePlaceSchema.parse(
    Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
  );
  const endpoint = { time: coreDateBoundary("2026-12-02"), place };
  const command = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: actor.tripId,
    target: { kind: "ITEM", id: randomUUID() },
    baseVector: [] as unknown[],
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    command: "CREATE_ITEM",
    payload: {
      family: "P5",
      core: { title: "Planned Bus" },
      endpoints: { origin: endpoint, destination: endpoint },
      service,
      ...coreDefaults("member"),
    },
  };
  command.baseVector = [{ ...command.target, revision: null }];
  return { actor, command };
}
it("accepts explicit unknown and projects no invented service identity", () => {
  const { actor, command } = fixture();
  const created = applyCoreCommand(
    emptyCoreGraph(),
    command,
    actor,
    "2026-11-17T00:00:00Z",
  );
  const s = created.graph.itinerary_transport_services[0];
  expect(s.operator_literal).toBeNull();
  expect(s.identity_state).toEqual(identity);
  const item = projectCoreItem(created.graph, actor, command.target.id)!;
  expect(item.details.service).toMatchObject({
    serviceKey: "main",
    identityState: identity,
  });
  expect(item.details.service).not.toHaveProperty("operatorLiteral");
});
it("rejects original five blank facts before any persistence", () => {
  const s = known();
  for (const k of fields.filter((k) => k !== "operator_namespace"))
    (s as Record<string, unknown>)[k] = "";
  expect(() => validateCoreCommand(fixture(s).command)).toThrow();
});
it("accepts old complete bytes without injecting a descriptor", () => {
  const { command } = fixture(known());
  expect(validateCoreCommand(command).payload).toEqual(command.payload);
});
it("enriches the same Item and service key with revision CAS and rejects an outsider", () => {
  const { actor, command } = fixture();
  const g = applyCoreCommand(
    emptyCoreGraph(),
    command,
    actor,
    "2026-11-17T00:00:00Z",
  ).graph;
  const update = {
    ...command,
    operationId: randomUUID(),
    command: "SET_TRANSPORT_DETAILS",
    baseVector: [{ ...command.target, revision: 1 }],
    payload: { service: known() },
  };
  const enriched = applyCoreCommand(g, update, actor, "2026-11-17T00:00:01Z").graph;
  expect(enriched.itinerary_events).toHaveLength(1);
  expect(enriched.itinerary_events[0]).toMatchObject({
    id: command.target.id,
    semantic_revision: 2,
  });
  expect(enriched.itinerary_transport_services[0]).toMatchObject({
    event_id: command.target.id,
    service_key: "main",
    operator_literal: "Synthetic Bus",
  });
  expect(() =>
    applyCoreCommand(enriched, update, actor, "2026-11-17T00:00:02Z"),
  ).toThrow();
  expect(() =>
    applyCoreCommand(
      g,
      update,
      { ...actor, accountId: randomUUID() },
      "2026-11-17T00:00:01Z",
    ),
  ).toThrow();
});
it("keeps partial genuine facts and distinguishes unnumbered from unknown", () => {
  const s = sparse();
  Object.assign(s, {
    operator_namespace: "NAME",
    operator_literal: "Genuine supplied name",
  });
  s.identity_state.fields.operator_namespace = "KNOWN";
  s.identity_state.fields.operator_literal = "KNOWN";
  s.identity_state.fields.service_number = "NOT_APPLICABLE";
  expect(() => validateCoreCommand(fixture(s).command)).not.toThrow();
  s.identity_state.fields.operator_literal = "NOT_APPLICABLE";
  (s as Record<string, unknown>).operator_literal = null;
  expect(() => validateCoreCommand(fixture(s).command)).toThrow();
});
it("rejects a state/value mismatch or Flight use of P5 unknown states", () => {
  const s = sparse();
  s.identity_state.fields.service_number = "KNOWN";
  expect(() => validateCoreCommand(fixture(s).command)).toThrow();
  const s2 = sparse();
  s2.transport_subtype = "FLIGHT";
  expect(() => validateCoreCommand(fixture(s2).command)).toThrow();
});

it("does not manufacture a missing title or transport type", () => {
  const f = fixture();
  f.command.payload.core.title = "";
  expect(() => validateCoreCommand(f.command)).toThrow();
  const other = fixture();
  (other.command.payload.service as Record<string, unknown>).transport_subtype =
    "UNKNOWN";
  expect(() => validateCoreCommand(other.command)).toThrow();
});

it("sparse omission and repeated null retain unknown facts; known enrichment requires coherent states", () => {
  const old = sparse();
  expect(p5IdentityPatch(old, { operator_literal: null })).toEqual({});
  expect(() =>
    p5IdentityPatch(old, { operator_literal: "Real supplied operator" }),
  ).toThrow("INVALID_TRANSPORT_IDENTITY");
  const descriptor = structuredClone(old.identity_state);
  descriptor.fields.operator_literal = "KNOWN";
  expect(
    p5IdentityPatch(old, {
      operator_literal: "Real supplied operator",
      identity_state: descriptor,
    }),
  ).toMatchObject({ operator_literal: "Real supplied operator" });
  expect(old.identity_state.fields.operator_literal).toBe("UNKNOWN");
  expect(p5IdentityPatch(known(), { service_number: "13" })).toEqual({
    service_number: "13",
  });
});

it("reads the approved legacy P5 NAME/empty stored shape without changing canonical bytes or admitting a new blank create", async () => {
  const { validateCoreGraph } = await import("./tripCoreV2Graph");
  const { canonicalCoreJson } = await import("./tripCoreV2Json");
  const f = fixture(known()),
    graph = applyCoreCommand(
      emptyCoreGraph(),
      f.command,
      f.actor,
      "2026-11-17T00:00:00Z",
    ).graph;
  const row = graph.itinerary_transport_services[0];
  for (const key of fields.filter((k) => k !== "operator_namespace")) row[key] = "";
  const bytes = canonicalCoreJson(graph as never);
  expect(() => validateCoreGraph(graph, f.actor.tripId)).not.toThrow();
  const item = projectCoreItem(graph, f.actor, f.command.target.id)!;
  expect(item.details.service).toMatchObject({
    identityState: {
      version: 1,
      fields: { operator_literal: "UNKNOWN", service_number: "UNKNOWN" },
    },
  });
  expect(item.details.service).not.toHaveProperty("operatorLiteral");
  expect(canonicalCoreJson(graph as never)).toBe(bytes);
  expect(() =>
    validateCoreCommand(fixture({ ...known(), operator_issuer: "" }).command),
  ).toThrow();
});

it("versions an existing legacy empty service only under a new explicit same-Item edit", () => {
  const f = fixture(known()),
    g = applyCoreCommand(
      emptyCoreGraph(),
      f.command,
      f.actor,
      "2026-11-17T00:00:00Z",
    ).graph;
  const service = g.itinerary_transport_services[0];
  for (const key of fields.filter((k) => k !== "operator_namespace")) service[key] = "";
  const upgraded = upgradeLegacyP5Identity(service);
  const changed = applyCoreCommand(
    g,
    {
      ...f.command,
      operationId: randomUUID(),
      command: "SET_TRANSPORT_DETAILS",
      baseVector: [{ ...f.command.target, revision: 1 }],
      payload: {
        service: Object.fromEntries(
          Object.entries({ ...upgraded, transport_subtype: "TRAIN" }).filter(
            ([key]) => !["trip_id", "event_id"].includes(key),
          ),
        ),
      },
    },
    f.actor,
    "2026-11-17T00:00:01Z",
  ).graph;
  expect(changed.itinerary_events[0]).toMatchObject({
    id: f.command.target.id,
    semantic_revision: 2,
  });
  expect(changed.itinerary_transport_services[0]).toMatchObject({
    service_key: "main",
    transport_subtype: "TRAIN",
    operator_literal: null,
    identity_state: { version: 1, fields: { operator_literal: "UNKNOWN" } },
  });
  expect(
    (changed.itinerary_events[0].field_state as Record<string, unknown>)[
      "itinerary_transport_services.main.operator_literal"
    ],
  ).toMatchObject({ state: "UNKNOWN" });
  expect(g.itinerary_transport_services[0].operator_literal).toBe("");
  expect(
    p5IdentityPatch(service, {
      service_number: "44",
      identity_state: {
        ...(upgraded.identity_state as object),
        fields: { ...(upgraded.identity_state as any).fields, service_number: "KNOWN" },
      },
    }),
  ).toMatchObject({ operator_literal: null, service_number: "44" });
});
