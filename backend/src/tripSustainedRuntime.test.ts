import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
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
