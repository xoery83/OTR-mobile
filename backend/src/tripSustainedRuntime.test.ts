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

it("does not expose an absent parent reader and fences an injected parent reader across closure", async () => {
  const f = fixture();
  expect(
    createSustainedDevTripPorts(f.ports, true)!.tripCreatePort.parentReceipt,
  ).toBeUndefined();
  let done!: (value: null) => void;
  const parentReceipt = vi.fn(
    () =>
      new Promise<null>((resolve) => {
        done = resolve;
      }),
  );
  const runtime = createSustainedDevTripPorts(
    { ...f.ports, create: { ...f.ports.create, parentReceipt } },
    true,
  )!;
  const actor = randomUUID(),
    trip = randomUUID();
  const reading = runtime.tripCreatePort.parentReceipt!(actor, trip);
  expect(parentReceipt).toHaveBeenCalledExactlyOnceWith(actor, trip);
  runtime.close();
  done(null);
  await expect(reading).rejects.toThrow("CLOSED");
  await expect(runtime.tripCreatePort.parentReceipt!(actor, trip)).rejects.toThrow(
    "CLOSED",
  );
  expect(parentReceipt).toHaveBeenCalledOnce();
  expect(f.create).not.toHaveBeenCalled();
  expect(f.receipt).not.toHaveBeenCalled();
});

it("preserves explicit Member Access and fences its owning methods on close", async () => {
  const f = fixture(), actor = randomUUID(), trip = randomUUID(), operation = randomUUID();
  const memberAccess = { execute: vi.fn().mockResolvedValue({}), readOperation: vi.fn().mockResolvedValue(null), observeAccessLoss: vi.fn().mockResolvedValue(null) };
  const runtime = createSustainedDevTripPorts({ ...f.ports, core: { ...f.ports.core, memberAccess } }, true)!;
  expect(createSustainedDevTripPorts(f.ports, true)!.coreConnection.memberAccess).toBeUndefined();
  const port = runtime.coreConnection.memberAccess!;
  await port.readOperation(actor, trip, operation); await port.observeAccessLoss(actor, trip);
  await runtime.close();
  await expect(port.readOperation(actor, trip, operation)).rejects.toThrow("TRIP_SUSTAINED_DEV_CLOSED");
  await expect(port.observeAccessLoss(actor, trip)).rejects.toThrow("TRIP_SUSTAINED_DEV_CLOSED");
  await expect(port.execute(actor, trip, {} as never)).rejects.toThrow("TRIP_SUSTAINED_DEV_CLOSED");
  expect(memberAccess.execute).not.toHaveBeenCalled();
  expect(memberAccess.readOperation).toHaveBeenCalledOnce();
  expect(memberAccess.observeAccessLoss).toHaveBeenCalledOnce();
});

it("does not publish an in-flight Member result after the runtime closes or resend it", async () => {
  const f = fixture();
  let finish!: (value: unknown) => void;
  const execute = vi.fn(() => new Promise<any>((resolve) => { finish = resolve; }));
  const memberAccess = { execute, readOperation: vi.fn(), observeAccessLoss: vi.fn() };
  const runtime = createSustainedDevTripPorts({ ...f.ports, core: { ...f.ports.core, memberAccess } }, true)!;
  const pending = runtime.coreConnection.memberAccess!.execute(randomUUID(), randomUUID(), {} as never);
  await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
  runtime.close(); finish({});
  await expect(pending).rejects.toThrow("TRIP_SUSTAINED_DEV_CLOSED");
  expect(execute).toHaveBeenCalledOnce();
});
