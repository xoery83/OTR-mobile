import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { coreHttpBoundary } from "./tripCoreV2Http";
const actor = randomUUID(),
  trip = randomUUID();
export const command = () => ({
  contractVersion: 2,
  intentVersion: 2,
  operationId: randomUUID(),
  tripId: trip,
  command: "REVOKE_LINKED_MEMBER_ACCESS",
  target: { kind: "TRIP_ACCESS", id: trip },
  baseVector: [{ kind: "TRIP_ACCESS", id: trip, revision: 7 }],
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  payload: {
    personId: randomUUID(),
    targetAccountId: randomUUID(),
    coreEpoch: randomUUID(),
  },
});
it("recognizes the formal member command but stays default closed without its owning port", async () => {
  const response = await coreHttpBoundary(
    new Request(`https://dev.invalid/v2/trips/${trip}/core/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command()),
    }),
    actor,
    async () => true,
  );
  expect(response.status).toBe(503);
});

it("returns B's explicit access-loss observation before normal Trip read admission", async () => {
  const personId = randomUUID();
  const loss = {
    schemaId: "otr.trip.core-access-loss/1",
    accountId: actor,
    tripId: trip,
    personId,
    state: "ACCESS_REVOKED",
    coreReference: { epoch: randomUUID(), revision: 11, accessRevision: 8 },
  };
  const connection = {
    memberAccess: { observeAccessLoss: async () => loss },
  } as unknown as import("./tripCoreV2Http").CoreHttpConnection;
  const response = await coreHttpBoundary(
    new Request(`https://dev.invalid/v2/trips/${trip}/core/access-loss`),
    actor,
    async () => false,
    connection,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(loss);
});
it("never discloses another Account's access-loss metadata", async () => {
  const loss = {
    schemaId: "otr.trip.core-access-loss/1",
    accountId: randomUUID(),
    tripId: trip,
    personId: randomUUID(),
    state: "ACCESS_REVOKED",
    coreReference: { epoch: randomUUID(), revision: 11, accessRevision: 8 },
  };
  const connection = {
    memberAccess: { observeAccessLoss: async () => loss },
  } as unknown as import("./tripCoreV2Http").CoreHttpConnection;
  const response = await coreHttpBoundary(
    new Request(`https://dev.invalid/v2/trips/${trip}/core/access-loss`),
    actor,
    async () => false,
    connection,
  );
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain(loss.accountId);
});
it("keeps the loss reader closed when composition is absent, without inferring revocation", async () => {
  const response = await coreHttpBoundary(
    new Request(`https://dev.invalid/v2/trips/${trip}/core/access-loss`),
    actor,
    async () => false,
  );
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty("state", "ACCESS_REVOKED");
});
