import { expect, it } from "vitest";
import { createCoreSourcePgAuthority } from "./tripCoreV2SourcePgAuthority";
import { extractCoreFlightPublication } from "./tripCoreV2CandidatePublication";
import {
  publicationFixture,
  publicationTestHash,
  publicationTestAirport,
} from "./__fixtures__/tripCoreV2CandidatePublication";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import type { CoreReceipt } from "../../src/domain/trip/tripCoreV2Receipt";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture() {
  const f = await publicationFixture();
  const flight = (
    await extractCoreFlightPublication(
      f.request,
      f.materials,
      id(1),
      id(2),
      publicationTestHash,
      publicationTestAirport,
    )
  ).sealed[0];
  const header = {
    accountId: id(1),
    tripId: id(2),
    sourceId: id(3),
    sourceRevision: 1,
    taskId: id(4),
    batchId: id(5),
    runId: id(6),
    candidateId: id(7),
    token: "i1",
    resultSha256: "a".repeat(64),
  };
  const rows = [
    { candidate_json: { ...header, schemaId: "otr.core.universal-p1-source/2" } },
    { candidate_json: { ...header, schemaId: "otr.core.universal-p3-source/1" } },
    { candidate_json: flight },
  ];
  const lease: CorePgLease = {
    retire() {},
    async query(sql) {
      if (sql === "SELECT current_user AS role")
        return { rows: [{ role: "otr_trip_core_v2_writer" }] };
      if (sql.startsWith("SELECT c.candidate_json")) return { rows };
      throw Error("UNEXPECTED_QUERY");
    },
  };
  const authority = createCoreSourcePgAuthority(
    { withLease: async (work) => work(lease) },
    publicationTestHash,
  );
  const binding = flight.airportBindings[0];
  const pointer = `otr-core/airport-registry/${encodeURIComponent(binding.registryVersion)}/${binding.registrySha256}`;
  const read = (ref = pointer) =>
    authority.canReadAudit(
      lease,
      {
        accountId: id(1),
        tripId: id(2),
        active: true,
        canManageShared: false,
        personId: null,
        personIds: [],
      },
      {
        audit: { evidenceRefs: [], authorizationRefs: [ref], before: [], after: [] },
      } as unknown as CoreReceipt,
    );
  return { rows, flight, read, pointer };
}
it("reads Flight registry audit alongside retained P1 and P3 candidates", async () => {
  const f = await fixture();
  expect(await f.read()).toBe(true);
});
it("does not authorize a registry absent from the retained Flight", async () => {
  const f = await fixture();
  expect(await f.read(f.pointer.replace(/[^/]+$/, "0".repeat(64)))).toBe(false);
});
it("still rejects a malformed Flight snapshot", async () => {
  const f = await fixture();
  f.rows.splice(0, 2);
  f.rows[0].candidate_json = { ...f.flight, version: 3 } as never;
  await expect(f.read()).rejects.toThrow();
});
