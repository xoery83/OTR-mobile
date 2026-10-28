import { coreClosedCapabilities } from "../../src/domain/trip/tripCoreV2Commands";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createNormalDevTripPorts,
  normalDevTripRuntimeSchema,
} from "./tripNormalRuntime";
import { isNormalP1Gate, normalP1Commands } from "./tripNormalP1Policy";
const actor = randomUUID();
const config = {
  version: 1 as const,
  actorAccountId: actor,
  adoptionCutoff: "2026-10-24T00:00:00.000Z",
  startsAt: "2026-10-24T00:01:00.000Z",
  expiresAt: "2026-10-24T01:01:00.000Z",
};
function fixture() {
  let now = Date.parse(config.startsAt);
  const create = {
    create: vi.fn().mockResolvedValue({}),
    receipt: vi.fn().mockResolvedValue(null),
  };
  const metadata = {
    update: vi.fn().mockResolvedValue({}),
    receipt: vi.fn().mockResolvedValue(null),
    snapshot: vi.fn().mockResolvedValue({}),
  };
  const core = {
    hash: async () => "a".repeat(64),
    source: {},
    publishSourceCandidates: vi.fn(),
    commands: { withLockedCommand: vi.fn() },
    readOperation: vi.fn().mockResolvedValue(null),
    read: {
      collection: vi.fn(),
      item: vi.fn(),
      capabilities: vi.fn(async () => coreClosedCapabilities),
    },
  };
  const runtime = createNormalDevTripPorts(
    config,
    { create, metadata, core } as never,
    () => now,
  );
  return {
    create,
    metadata,
    core,
    runtime,
    expire: () => {
      now = Date.parse(config.expiresAt);
    },
  };
}
it("requires an explicit <=24h scope without unknown configuration fields", () => {
  expect(
    normalDevTripRuntimeSchema.safeParse({
      ...config,
      expiresAt: "2026-10-26T00:00:00.000Z",
    }).success,
  ).toBe(false);
  expect(
    normalDevTripRuntimeSchema.safeParse({ ...config, unrestricted: true }).success,
  ).toBe(false);
});
it("withholds wrong Actor, V1 create, expired and manually closed requests before owning ports", async () => {
  const f = fixture();
  await expect(
    f.runtime.tripCreatePort.receipt(randomUUID(), randomUUID()),
  ).rejects.toThrow("FORBIDDEN");
  await expect(f.runtime.tripCreatePort.create(actor, {} as never)).rejects.toThrow(
    "V2_REQUIRED",
  );
  f.expire();
  await expect(f.runtime.tripMetadataV2Port.receipt(actor, randomUUID())).rejects.toThrow(
    "CLOSED",
  );
  expect(f.create.create).not.toHaveBeenCalled();
  expect(f.metadata.receipt).not.toHaveBeenCalled();
  const second = fixture();
  second.runtime.close();
  await expect(
    second.runtime.coreConnection.readOperation(actor, randomUUID(), randomUUID()),
  ).rejects.toThrow("CLOSED");
  expect(second.core.readOperation).not.toHaveBeenCalled();
});
it("retains result-unknown safety if the scope closes while a write completes", async () => {
  const f = fixture();
  f.create.create.mockImplementation(async () => {
    f.expire();
    return {};
  });
  await expect(
    f.runtime.tripCreatePort.create(actor, { formatVersion: 2 } as never),
  ).rejects.toThrow("CLOSED");
  expect(f.create.create).toHaveBeenCalledOnce();
  expect(f.runtime.coreConnection.source).toBeUndefined();
  expect(f.runtime.coreConnection.publishSourceCandidates).toBeUndefined();
});
it("normal P1 policy exposes only the exact approved manual commands and family", () => {
  const gate = {
    enabled_commands: [...normalP1Commands],
    enabled_families: ["P1"],
    enabled_admission_modes: ["MANUAL"],
  };
  expect(isNormalP1Gate(gate)).toBe(true);
  expect(
    isNormalP1Gate({
      ...gate,
      enabled_commands: [...normalP1Commands, "CREATE_DOCUMENT"],
    }),
  ).toBe(false);
  expect(isNormalP1Gate({ ...gate, enabled_families: ["P1", "P2"] })).toBe(false);
});

it("preserves exact capability operation through the finite adapter without changing Manual or actor guards", async () => {
  const f = fixture(),
    trip = randomUUID(),
    operation = randomUUID();
  await f.runtime.coreConnection.read!.capabilities!(actor, trip);
  await f.runtime.coreConnection.read!.capabilities!(actor, trip, operation);
  expect(f.core.read.capabilities.mock.calls).toEqual([
    [actor, trip],
    [actor, trip, operation],
  ]);
  await expect(
    f.runtime.coreConnection.read!.capabilities!(randomUUID(), trip, operation),
  ).rejects.toThrow("FORBIDDEN");
  expect(f.core.read.capabilities).toHaveBeenCalledTimes(2);
  f.expire();
  await expect(
    f.runtime.coreConnection.read!.capabilities!(actor, trip, operation),
  ).rejects.toThrow("CLOSED");
  expect(f.core.read.capabilities).toHaveBeenCalledTimes(2);
});
