import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { coreClosedCapabilities } from "../../src/domain/trip/tripCoreV2Commands";
import { createSustainedDevTripPorts } from "./tripSustainedRuntime";
function fixture() {
  const create = vi.fn().mockResolvedValue({}),
    receipt = vi.fn().mockResolvedValue(null),
    update = vi.fn(),
    snapshot = vi.fn();
  const ports = {
    create: { create, receipt },
    metadata: { update, receipt, snapshot },
    core: {
      hash: vi.fn(),
      commands: { withLockedCommand: vi.fn() },
      readOperation: vi.fn(),
      read: {
        collection: vi.fn(),
        item: vi.fn(),
        capabilities: vi.fn(async () => coreClosedCapabilities),
        authorizedVersion: vi.fn(
          async (actorAccountId: string, tripId: string, _ordinaryOrderVersion?: 1) => ({
            version: "otr.core.authorized-trip-version/1" as const,
            actorAccountId,
            tripId,
            token: "a".repeat(64),
          }),
        ),
      },
    },
  };
  return { ports, create, receipt };
}
it("is opt-in CLOSED and does not touch owning ports by default", () => {
  const f = fixture();
  expect(createSustainedDevTripPorts(f.ports)).toBeUndefined();
  expect(f.create).not.toHaveBeenCalled();
});
it("has no fixed Trip, QA Actor or temporary clock; owning SQL remains authority on every request", async () => {
  const f = fixture(),
    runtime = createSustainedDevTripPorts(f.ports, true)!;
  const request = {
    formatVersion: 2 as const,
    operationId: randomUUID(),
    tripId: randomUUID(),
    name: "App authored",
    destination: null,
    destinations: [],
    startDate: null,
    endDate: null,
  };
  await runtime.tripCreatePort.create(randomUUID(), request);
  await runtime.tripCreatePort.create(randomUUID(), {
    ...request,
    operationId: randomUUID(),
    tripId: randomUUID(),
  });
  expect(f.create).toHaveBeenCalledTimes(2);
  runtime.close();
  await expect(
    runtime.tripCreatePort.receipt(randomUUID(), randomUUID()),
  ).rejects.toMatchObject({ code: "TRIP_SUSTAINED_DEV_CLOSED" });
  expect(f.receipt).not.toHaveBeenCalled();
});
it("refuses old scalar Create and Metadata without upgrading their payload", async () => {
  const f = fixture(),
    runtime = createSustainedDevTripPorts(f.ports, true)!;
  await expect(
    runtime.tripCreatePort.create(randomUUID(), {
      operationId: randomUUID(),
      tripId: randomUUID(),
      name: "old",
      destination: null,
      startDate: null,
      endDate: null,
    }),
  ).rejects.toMatchObject({ code: "TRIP_SUSTAINED_V2_REQUIRED" });
  expect(f.create).not.toHaveBeenCalled();
});

it("retains all capability context through the deployed sustained adapter and fences closure", async () => {
  const f = fixture(),
    runtime = createSustainedDevTripPorts(f.ports, true)!,
    actor = randomUUID(),
    trip = randomUUID(),
    operation = randomUUID();
  await runtime.coreConnection.read!.capabilities!(actor, trip);
  await runtime.coreConnection.read!.capabilities!(actor, trip, operation);
  expect(f.ports.core.read.capabilities.mock.calls).toEqual([
    [actor, trip],
    [actor, trip, operation],
  ]);
  f.ports.core.read.capabilities.mockImplementation(async () => {
    runtime.close();
    return coreClosedCapabilities;
  });
  await expect(
    runtime.coreConnection.read!.capabilities!(actor, trip, operation),
  ).rejects.toThrow("CLOSED");
});

it("forwards authorized versions through sustained runtime and fences closure", async () => {
  const f = fixture(),
    runtime = createSustainedDevTripPorts(f.ports, true)!;
  const actor = randomUUID(),
    trip = randomUUID();
  expect(await runtime.coreConnection.read!.authorizedVersion!(actor, trip, 1)).toEqual({
    version: "otr.core.authorized-trip-version/1",
    actorAccountId: actor,
    tripId: trip,
    token: "a".repeat(64),
  });
  expect(f.ports.core.read.authorizedVersion).toHaveBeenCalledExactlyOnceWith(
    actor,
    trip,
    1,
  );
  const original = f.ports.core.read.authorizedVersion.getMockImplementation()!;
  f.ports.core.read.authorizedVersion.mockImplementationOnce(async (...args) => {
    runtime.close();
    return original(...args);
  });
  await expect(
    runtime.coreConnection.read!.authorizedVersion!(actor, trip),
  ).rejects.toThrow("CLOSED");
  const calls = f.ports.core.read.authorizedVersion.mock.calls.length;
  await expect(
    runtime.coreConnection.read!.authorizedVersion!(actor, trip),
  ).rejects.toThrow("CLOSED");
  expect(f.ports.core.read.authorizedVersion).toHaveBeenCalledTimes(calls);
});

it("keeps the sustained version request closed when its owning port is absent", async () => {
  const f = fixture();
  Object.defineProperty(f.ports.core.read, "authorizedVersion", { value: undefined });
  const runtime = createSustainedDevTripPorts(f.ports, true)!;
  await expect(
    runtime.coreConnection.read!.authorizedVersion!(randomUUID(), randomUUID()),
  ).rejects.toThrow("CORE_READ_UNAVAILABLE");
});
