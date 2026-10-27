import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  localAuthorityFixture,
  localTestHash,
  localTestStamp,
  sealLocalTestEnvelope,
} from "./__fixtures__/localCoreAuthority";
import {
  localSourceCandidateSchema,
  localReviewSelections,
  localHash,
  parseLocalCommitEnvelope,
  verifyLocalCommit,
} from "./localCoreAuthority";
import { applyLocalCoreOperation, emptyCoreGraph } from "./tripCoreV2Mutation";
import { validateCoreCommand } from "./tripCoreV2Commands";
import { validateCoreGraph, validateLocalCoreGraph } from "./tripCoreV2Graph";

describe("strict local authority, old authority unchanged", () => {
  it("genuine manual number/date uses existing mutation, not accepted receipt", async () => {
    const { env, state } = await localAuthorityFixture();
    const [op] = await verifyLocalCommit(env, state, localTestHash);
    const result = applyLocalCoreOperation(
      emptyCoreGraph(),
      op,
      state.actor,
      localTestStamp,
    );
    expect(result.graph.trip_flight_intents[0].flight_number_literal).toBe("NZ5069");
    expect(result.graph.itinerary_events).toHaveLength(1);
    expect(() =>
      applyLocalCoreOperation(
        emptyCoreGraph(),
        structuredClone(op),
        state.actor,
        localTestStamp,
      ),
    ).toThrow("LOCAL_CAPABILITY_REQUIRED");
  });
  it("deep immutable capability rejects mutation and same-Trip foreign actor", async () => {
    const { env, state } = await localAuthorityFixture();
    const [op] = await verifyLocalCommit(env, state, localTestHash);
    expect(() => {
      op.command.target.id = randomUUID();
    }).toThrow();
    expect(() => {
      (op.command.payload as Record<string, unknown>).flightNumberLiteral = "OTHER";
    }).toThrow();
    expect(() =>
      applyLocalCoreOperation(
        emptyCoreGraph(),
        op,
        { ...state.actor, accountId: randomUUID() },
        localTestStamp,
      ),
    ).toThrow("LOCAL_CAPABILITY_REQUIRED");
  });
  it("numberless booked route persists real endpoint facts without service rows or fake instant", async () => {
    const { env, state } = await localAuthorityFixture(true);
    const [op] = await verifyLocalCommit(env, state, localTestHash);
    const graph = applyLocalCoreOperation(
      emptyCoreGraph(),
      op,
      state.actor,
      localTestStamp,
    ).graph;
    expect(graph.trip_flight_intents[0].flight_number_literal).toBeNull();
    expect(graph.itinerary_transport_services).toHaveLength(0);
    expect(
      graph.itinerary_transport_endpoints.map((x) => [
        x.role,
        x.local_date,
        x.local_time,
        x.instant,
      ]),
    ).toEqual([
      ["ORIGIN", "2026-12-22", "11:55:00", null],
      ["DESTINATION", "2026-12-22", "13:25:00", null],
    ]);
    expect(() => validateCoreGraph(graph, env.tripId)).toThrow();
    expect(validateLocalCoreGraph(graph, env.tripId)).toBe(graph);
    expect(() => validateCoreCommand(op.command)).toThrow();
  });
  it("route-time known number uses same proof branch and preserves endpoint clocks", async () => {
    const { env, state } = await localAuthorityFixture(true, "NZ5069");
    const [op] = await verifyLocalCommit(env, state, localTestHash);
    const g = applyLocalCoreOperation(
      emptyCoreGraph(),
      op,
      state.actor,
      localTestStamp,
    ).graph;
    expect(g.trip_flight_intents[0].flight_number_literal).toBe("NZ5069");
    expect(g.itinerary_transport_endpoints[0].local_time).toBe("11:55:00");
    expect(g.itinerary_transport_services).toHaveLength(0);
  });
  it("booking-evidenced known number retains clocks but cannot borrow return evidence", async () => {
    const f = await localAuthorityFixture(true);
    if (f.env.authority !== "LOCAL_REVIEWED_SOURCE") throw Error();
    const x = f.env.slots[0];
    if (!x.command) throw Error();
    (x.reviewedPayload as { flightNumberLiteral: string | null }).flightNumberLiteral =
      "NZ5069";
    await sealLocalTestEnvelope(f.env, f.state);
    await expect(verifyLocalCommit(f.env, f.state, localTestHash)).rejects.toThrow(
      "LOCAL_AUTHORITY_INVALID",
    );
  });
  it("route-time cannot add timezone authority absent retained field support", async () => {
    const f = await localAuthorityFixture(true);
    if (f.env.authority !== "LOCAL_REVIEWED_SOURCE") throw Error();
    const x = f.env.slots[0];
    if (!x.command) throw Error();
    (
      x.reviewedPayload as { origin: { time: { zone_id: string | null } } }
    ).origin.time.zone_id = "Pacific/Auckland";
    await sealLocalTestEnvelope(f.env, f.state);
    await expect(verifyLocalCommit(f.env, f.state, localTestHash)).rejects.toThrow(
      "LOCAL_AUTHORITY_INVALID",
    );
  });
  it("cannot borrow a field from a different segment in the same retained Source", async () => {
    const f = await localAuthorityFixture(true);
    if (f.env.authority !== "LOCAL_REVIEWED_SOURCE") throw Error();
    const x = f.env.slots[0];
    if (!x.command) throw Error();
    const material = f.state.source!.materials[0];
    const sample = x.fieldEvidence[0];
    const entry = {
      ref: {
        ...structuredClone(sample),
        evidenceId: "outbound-service",
        fieldKey: "service",
      },
      normalizedValue: "NZ5069",
    };
    (material.evidenceCatalog as unknown[]).push(entry);
    f.state.source!.evidence = new Map([
      ...f.state.source!.evidence,
      [entry.ref.evidenceId, entry],
    ]);
    material.pin.evidenceCatalogDigest = await localHash(
      "otr-local-import-evidence-catalog-v1",
      material.evidenceCatalog,
      localTestHash,
    );
    f.env.materials[0] = structuredClone(material.pin);
    x.fieldEvidence.push(entry.ref);
    x.selectedFields.push("service");
    (x.reviewedPayload as { flightNumberLiteral: string | null }).flightNumberLiteral =
      "NZ5069";
    await sealLocalTestEnvelope(f.env, f.state);
    await expect(verifyLocalCommit(f.env, f.state, localTestHash)).rejects.toThrow(
      "LOCAL_AUTHORITY_INVALID",
    );
  });
  it("cannot invent airport by rehashing all caller evidence/proof", async () => {
    const f = await localAuthorityFixture(true);
    if (f.env.authority !== "LOCAL_REVIEWED_SOURCE") throw Error();
    const x = f.env.slots[0];
    if (!x.command) throw Error();
    (x.reviewedPayload as { origin: { airportCode: string } }).origin.airportCode = "WLG";
    await sealLocalTestEnvelope(f.env, f.state);
    await expect(verifyLocalCommit(f.env, f.state, localTestHash)).rejects.toThrow(
      "LOCAL_AUTHORITY_INVALID",
    );
  });
  it("stale bytes, stale decision, unknown claims fail closed independently", async () => {
    for (const change of ["bytes", "decision", "claims"]) {
      const f = await localAuthorityFixture(true);
      if (change === "bytes") f.state.source!.materials[0].bytes[0] ^= 1;
      if (change === "decision") f.state.source!.decision.decisionRevision++;
      if (change === "claims") f.state.claims = new Map();
      await expect(verifyLocalCommit(f.env, f.state, localTestHash)).rejects.toThrow();
    }
  });
  it("manual cannot borrow source exception or carry source proof keys", async () => {
    const f = await localAuthorityFixture();
    if (f.env.authority !== "LOCAL_MANUAL") throw Error();
    const env = f.env;
    expect(() => parseLocalCommitEnvelope({ ...env, materials: [] })).toThrow();
    expect(() =>
      parseLocalCommitEnvelope({
        ...env,
        outputs: [
          { ...env.outputs[0], command: "CREATE_BOOKING_EVIDENCED_FLIGHT_LOCAL" },
        ],
      }),
    ).toThrow();
  });
  it("duplicates, cycles, >64, oversize and changed immutable envelope deny", async () => {
    const f = await localAuthorityFixture();
    if (f.env.authority !== "LOCAL_MANUAL") throw Error();
    const env = f.env;
    expect(() =>
      parseLocalCommitEnvelope({
        ...env,
        outputs: [env.outputs[0], env.outputs[0]],
      }),
    ).toThrow();
    expect(() =>
      parseLocalCommitEnvelope({ ...env, outputs: Array(65).fill(env.outputs[0]) }),
    ).toThrow();
    const cyclic = structuredClone(f.env);
    cyclic.outputs[0].dependsOn = [cyclic.outputs[0].slotId];
    expect(() => parseLocalCommitEnvelope(cyclic)).toThrow("LOCAL_DEPENDENCY_CYCLE");
    expect(() => parseLocalCommitEnvelope(" ".repeat(1048577))).toThrow();
    f.env.commitId = randomUUID();
    await expect(verifyLocalCommit(f.env, f.state, localTestHash)).rejects.toThrow();
  });
});

it("retained candidate snapshots are bounded, exact-ID matched, and cannot disagree with owning evidence", async () => {
  const f = await localAuthorityFixture(true);
  if (f.env.authority !== "LOCAL_REVIEWED_SOURCE") throw Error();
  const candidate = f.state.source!.candidates.values().next().value!;
  const parsed = localSourceCandidateSchema.parse(candidate.body);
  expect(parsed.evidenceSnapshot.map((e) => e.ref.evidenceId)).toEqual(
    parsed.evidenceIds,
  );
  expect(() =>
    localSourceCandidateSchema.parse({ ...parsed, evidenceSnapshot: [] }),
  ).toThrow();
  expect(() =>
    localSourceCandidateSchema.parse({
      ...parsed,
      evidenceSnapshot: [...parsed.evidenceSnapshot, parsed.evidenceSnapshot[0]],
    }),
  ).toThrow();
  expect(() =>
    localSourceCandidateSchema.parse({
      ...parsed,
      evidenceSnapshot: parsed.evidenceSnapshot.map((e, i) =>
        i ? e : { ...e, raw: "x".repeat(65537) },
      ),
    }),
  ).toThrow();
  parsed.evidenceSnapshot[0].normalizedValue = "invented";
  candidate.body = parsed;
  candidate.sha256 = await localHash(
    "otr-local-import-candidate-v1",
    parsed,
    localTestHash,
  );
  const slot = f.env.slots[0];
  slot.candidateSha256 = candidate.sha256;
  if (slot.proof) slot.proof.candidateSha256 = candidate.sha256;
  await sealLocalTestEnvelope(f.env, f.state);
  await expect(verifyLocalCommit(f.env, f.state, localTestHash)).rejects.toThrow(
    "LOCAL_AUTHORITY_INVALID",
  );
});

it("explicit Review selections retain exact cold-recovery slot mapping without a proof hash cycle", async () => {
  const f = await localAuthorityFixture(true);
  if (f.env.authority !== "LOCAL_REVIEWED_SOURCE") throw Error();
  const selected = localReviewSelections(f.env)[0],
    slot = f.env.slots[0];
  const { proof: _derivedProof, ...allImmutableFields } = slot;
  expect(selected).toEqual(allImmutableFields);
  expect(selected).not.toHaveProperty("proof");
  for (const field of [
    "slotKey",
    "candidateId",
    "candidateSha256",
    "baseVector",
    "command",
    "fieldEvidence",
    "dependsOn",
    "outputPurpose",
  ] as const)
    expect(selected).toHaveProperty(field);
  const prior = await localHash(
    "otr-local-import-review-selections-v1",
    localReviewSelections(f.env),
    localTestHash,
  );
  slot.candidateId = randomUUID();
  expect(
    await localHash(
      "otr-local-import-review-selections-v1",
      localReviewSelections(f.env),
      localTestHash,
    ),
  ).not.toBe(prior);
});
