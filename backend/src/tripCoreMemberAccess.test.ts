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
