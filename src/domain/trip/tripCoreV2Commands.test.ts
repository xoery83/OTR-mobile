import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { validateCoreCommand, coreClosedCapabilities } from "./tripCoreV2Commands";
import { coreDefaults, parseCoreWire } from "./tripCoreV2";
const id = randomUUID(),
  trip = randomUUID();
const sparse = () => ({
  contractVersion: 2,
  intentVersion: 2,
  operationId: randomUUID(),
  tripId: trip,
  command: "CREATE_SPARSE_FLIGHT",
  target: { kind: "ITEM", id },
  baseVector: [{ kind: "ITEM", id, revision: null }],
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  payload: {
    flightNumberLiteral: "NZ0001",
    departureDate: "2026-12-14",
    ...coreDefaults("member"),
  },
});
describe("Core finite command boundary", () => {
  it("saves sparse literal/date independently from qualified service", () => {
    expect(validateCoreCommand(sparse()).target.id).toBe(id);
  });
  it("rejects arbitrary fields, commands, duplicate JSON and forged admission modes", () => {
    const q = sparse();
    expect(() =>
      validateCoreCommand({ ...q, payload: { ...q.payload, services: [] } }),
    ).toThrow();
    expect(() => validateCoreCommand({ ...q, command: "PATCH_ANYTHING" })).toThrow();
    expect(() => parseCoreWire('{"x":1,"x":2}')).toThrow();
    expect(() =>
      validateCoreCommand({
        ...q,
        admission: {
          mode: "AUTO_SOURCE",
          sourceIntentId: null,
          policyVersion: "otr.trip.auto-admit/1",
        },
      }),
    ).toThrow("INVALID_ADMISSION_BINDING");
  });
  it("separates organizer shared defaults from member private SELF", () => {
    expect(coreDefaults("organizer").acl.visibility).toBe("GROUP");
    expect(coreDefaults("member").participation.mode).toBe("SELF");
    expect(coreDefaults("member").acl.visibility).toBe("PRIVATE");
  });
  it("cannot qualify a sparse Flight with manual literal/date or relaxed time", () => {
    expect(() =>
      validateCoreCommand({
        ...sparse(),
        command: "QUALIFY_FLIGHT",
        payload: { flightNumberLiteral: "NZ0001", departureDate: "2026-12-14" },
      }),
    ).toThrow();
  });
  it("starts all runtime command and source capabilities CLOSED", () => {
    expect(coreClosedCapabilities.enabledCommands).toEqual([]);
    expect(coreClosedCapabilities.sourceEvidenceAvailable).toBe(false);
  });
  it("rejects duplicate roots and out-of-scope source revision entries", () => {
    const q = sparse();
    expect(() =>
      validateCoreCommand({ ...q, baseVector: [...q.baseVector, ...q.baseVector] }),
    ).toThrow("INVALID_BASE_VECTOR");
  });
});
