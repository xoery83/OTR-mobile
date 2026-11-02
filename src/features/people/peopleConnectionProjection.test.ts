import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import type { TripPerson } from "@/domain/trip/person";
import type { createTripCoreV2Repository } from "@/data/repositories/tripCoreV2Repository";
import {
  readPeopleConnectionProjection,
  type AcceptedPeopleConnections,
  type PeopleConnectionReader,
} from "./peopleConnectionProjection";

async function fixture() {
  let accountId = randomUUID();
  const account = async () => accountId;
  const context = await captureAccountRequestContext(randomUUID(), account);
  const people: TripPerson[] = [0, 1].map(() => ({
    tripId: context.tripId,
    personId: randomUUID(),
    displayName: "同名 e\u0301",
    participation: { isParticipating: false, revision: 0 },
  }));
  const snapshot: AcceptedPeopleConnections = {
    certificate: {
      epoch: randomUUID(),
      revision: "7",
      access_revision: 2,
      applied_generation: 1,
      actor_person_binding_hash: "a".repeat(64),
      roster_hash: "b".repeat(64),
      manifest_sha256: "c".repeat(64),
      ordinary_order_version: 1,
    },
    people: [
      { personId: people[0].personId, connected: true, isCurrentActor: true },
      { personId: people[1].personId, connected: false, isCurrentActor: false },
    ],
  };
  const sources = {
    account,
    listTripPersons: vi.fn(async () => people),
    connections: vi.fn<PeopleConnectionReader>(async () => snapshot),
  };
  return {
    context,
    people,
    snapshot,
    sources,
    switch() {
      accountId = randomUUID();
      advanceAccountGeneration();
    },
  };
}

it("accepts the delivered Native repository reader without a DTO conversion", async () => {
  const f = await fixture();
  const native: Pick<
    ReturnType<typeof createTripCoreV2Repository>,
    "readAcceptedPeopleConnections"
  > = {
    readAcceptedPeopleConnections: vi.fn(async () => ({
      certificate: f.snapshot.certificate,
      people: [...f.snapshot.people],
    })),
  };
  const result = await readPeopleConnectionProjection(f.context, {
    account: f.sources.account,
    listTripPersons: f.sources.listTripPersons,
    connections: native.readAcceptedPeopleConnections,
  });
  expect(native.readAcceptedPeopleConnections).toHaveBeenCalledWith(f.context);
  expect(result.people.map((person) => person.connection)).toEqual([
    { status: "OBSERVED_CACHE", connected: true, isCurrentActor: true },
    { status: "OBSERVED_CACHE", connected: false, isCurrentActor: false },
  ]);
});

it("keeps duplicate names distinct and does not equate participation with connection", async () => {
  const f = await fixture();
  const result = await readPeopleConnectionProjection(f.context, f.sources);
  expect(result.people.map((p) => p.connection)).toEqual([
    { status: "OBSERVED_CACHE", connected: true, isCurrentActor: true },
    { status: "OBSERVED_CACHE", connected: false, isCurrentActor: false },
  ]);
  expect(result.people[0].participation?.isParticipating).toBe(false);
  expect(result.people.map((p) => p.displayName)).toEqual(
    f.people.map((p) => p.displayName),
  );
  expect(result.observation).toEqual({
    epoch: f.snapshot.certificate.epoch,
    coreAccessRevision: 2,
  });
});

it("keeps an absent reader, missing/inactive projection or pending local Person UNKNOWN", async () => {
  const f = await fixture();
  const unavailable = await readPeopleConnectionProjection(f.context, {
    account: f.sources.account,
    listTripPersons: f.sources.listTripPersons,
  });
  expect(unavailable.people.every((p) => p.connection.status === "UNKNOWN")).toBe(true);
  expect(f.sources.connections).not.toHaveBeenCalled();
  f.sources.connections.mockResolvedValueOnce(null);
  expect(
    (await readPeopleConnectionProjection(f.context, f.sources)).people.every(
      (p) => p.connection.status === "UNKNOWN",
    ),
  ).toBe(true);
  f.sources.connections.mockResolvedValueOnce({ ...f.snapshot, people: [] });
  expect(
    (await readPeopleConnectionProjection(f.context, f.sources)).people.every(
      (p) => p.connection.status === "UNKNOWN",
    ),
  ).toBe(true);
  f.people[0].localState = "LOCAL_PENDING";
  expect(
    (await readPeopleConnectionProjection(f.context, f.sources)).people[0].connection,
  ).toEqual({ status: "UNKNOWN" });
});

it("copies the roster before awaiting the connection reader", async () => {
  const f = await fixture();
  f.sources.connections.mockImplementationOnce(async () => {
    f.people[0].tripId = randomUUID();
    f.people[0].displayName = "Changed after local read";
    return f.snapshot;
  });
  const output = await readPeopleConnectionProjection(f.context, f.sources);
  expect(output.people[0]).toMatchObject({
    tripId: f.context.tripId,
    displayName: "同名 e\u0301",
  });
});

it("does not downgrade an owning-reader denial to an UNKNOWN roster result", async () => {
  const f = await fixture();
  f.sources.connections.mockRejectedValueOnce(Error("CORE_READ_AUTHORIZATION_REVOKED"));
  await expect(readPeopleConnectionProjection(f.context, f.sources)).rejects.toThrow(
    "AUTHORIZATION_REVOKED",
  );
});

it("rejects old-account and late connection responses instead of displaying them", async () => {
  const f = await fixture();
  f.sources.connections.mockImplementationOnce(async () => {
    f.switch();
    return f.snapshot;
  });
  await expect(readPeopleConnectionProjection(f.context, f.sources)).rejects.toThrow();
  f.sources.listTripPersons.mockClear();
  await expect(readPeopleConnectionProjection(f.context, f.sources)).rejects.toThrow();
  expect(f.sources.listTripPersons).not.toHaveBeenCalled();
});

it.each(["duplicate", "disconnected self", "multiple self", "account leakage"])(
  "rejects invalid binding projection: %s",
  async (kind) => {
    const f = await fixture();
    const first = f.snapshot.people[0],
      second = f.snapshot.people[1];
    const people =
      kind === "duplicate"
        ? [first, first]
        : kind === "disconnected self"
          ? [{ ...first, connected: false }]
          : kind === "multiple self"
            ? [first, { ...second, connected: true, isCurrentActor: true }]
            : [{ ...first, accountId: randomUUID() }];
    f.sources.connections.mockResolvedValueOnce({ ...f.snapshot, people });
    await expect(readPeopleConnectionProjection(f.context, f.sources)).rejects.toThrow();
  },
);

it("refuses foreign Trip roster rows before consulting Core and excludes unrelated private fields", async () => {
  const f = await fixture();
  f.people[0].tripId = randomUUID();
  await expect(readPeopleConnectionProjection(f.context, f.sources)).rejects.toThrow(
    "SCOPE_MISMATCH",
  );
  expect(f.sources.connections).not.toHaveBeenCalled();
  f.people[0].tripId = f.context.tripId;
  Object.assign(f.people[0], {
    globalDisplayName: "Private global name",
    accountId: randomUUID(),
  });
  const output = await readPeopleConnectionProjection(f.context, f.sources);
  expect(output.people[0]).not.toHaveProperty("globalDisplayName");
  expect(output.people[0]).not.toHaveProperty("accountId");
});
