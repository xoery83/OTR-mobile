import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createCorePgHttpConnection } from "./tripCoreV2PgHttpConnection";
import { publicationFixture } from "./__fixtures__/tripCoreV2CandidatePublication";
it("composes one explicit owning connection without startup IO or capability activation", async () => {
  let leases = 0;
  const connection = createCorePgHttpConnection(
    {
      withLease: async () => {
        leases++;
        throw new Error("UNPROVISIONED");
      },
    },
    async (bytes) => createHash("sha256").update(bytes).digest("hex"),
  );
  expect(leases).toBe(0);
  expect(connection.commands).toBeDefined();
  expect(connection.source).toBeDefined();
  expect(connection.read).toBeDefined();
  const { request } = await publicationFixture();
  await expect(
    connection.publishSourceCandidates!(
      request.candidates[0].accountId,
      request.candidates[0].tripId,
      request,
    ),
  ).rejects.toThrow("UNPROVISIONED");
  expect(leases).toBe(1);
});
