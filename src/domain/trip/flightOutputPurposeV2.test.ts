import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertFlightOutputClaimsV2,
  compareFlightOutputPurposesV2,
  mintFlightOutputPurposeV2,
  type FlightOutputClaimV2,
  type FlightPurposeBindingV2,
  type FlightPurposeIdentityV2,
} from "./flightOutputPurposeV2";
const id = (n: number) => `fa000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha256 = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const binding = (n = 1): FlightPurposeBindingV2 => ({
  accountId: id(100),
  tripId: id(101),
  runId: id(102),
  candidateId: id(200 + n),
  version: 2,
  planId: id(103),
  slotId: id(n),
  sourceId: id(104),
  sourceRevision: 1,
  inputCatalogSha256: "a".repeat(64),
  candidateSha256: String(n).repeat(64),
  targetKind: "ITEM",
  targetId: id(300 + n),
  purposeKind: "FLIGHT_OCCURRENCE",
});
const outbound: FlightPurposeIdentityV2 = {
  namespace: "IATA_AIRLINE",
  issuer: "IATA",
  operator: "NZ",
  serviceNumber: "5069",
  originDate: "2026-12-18",
  originAirportId: "IATA:AKL",
  destinationAirportId: "IATA:CHC",
};
const returning: FlightPurposeIdentityV2 = {
  ...outbound,
  serviceNumber: "5070",
  originDate: "2026-12-20",
  originAirportId: "IATA:CHC",
  destinationAirportId: "IATA:AKL",
};
const ref = (key: string) => `track-c/field-evidence/${id(200)}/${key}`;
const evidence = () => ({
  service: [ref("services")],
  originDate: [ref("origin.date")],
  originAirportId: [ref("origin.airport")],
  destinationAirportId: [ref("destination.airport")],
});
const mint = (b = binding(), facts = outbound) =>
  mintFlightOutputPurposeV2(b, facts, evidence(), async () => {}, sha256);
const claim = async (
  b = binding(),
  facts = outbound,
  outcome: FlightOutputClaimV2["outcome"] = "UNKNOWN",
) => ({
  kind: "CERTIFIED" as const,
  binding: b,
  certified: await mint(b, facts),
  outcome,
});

describe("Core Flight output-purpose2", () => {
  it("admits two return segments from one Source while first outcome remains UNKNOWN", async () => {
    const first = await claim();
    const second = await mint(binding(2), returning);
    expect(await assertFlightOutputClaimsV2(binding(2), second, [first], sha256)).toBe(
      "NEW_OUTPUT",
    );
    expect(
      await assertFlightOutputClaimsV2(
        binding(),
        first.certified!,
        [await claim(binding(2), returning)],
        sha256,
      ),
    ).toBe("NEW_OUTPUT");
  });
  it("replays an exact serialized certificate without new target allocation", async () => {
    const first = await claim();
    const cold = JSON.parse(JSON.stringify(first)) as FlightOutputClaimV2;
    expect(
      await assertFlightOutputClaimsV2(
        binding(),
        (cold as Extract<FlightOutputClaimV2, { kind: "CERTIFIED" }>).certified,
        [cold],
        sha256,
      ),
    ).toBe("EXACT_REPLAY");
  });
  it("retains successful first output while a distinct second output is unresolved", async () => {
    const first = await claim(binding(), outbound, "SUCCEEDED");
    const second = await claim(binding(2), returning);
    expect(
      await assertFlightOutputClaimsV2(
        binding(2),
        second.certified,
        [first, second],
        sha256,
      ),
    ).toBe("EXACT_REPLAY");
    expect(first.outcome).toBe("SUCCEEDED");
  });
  it("identity hash ignores candidate/plan/slot and opaque target allocation", async () => {
    const a = await mint();
    const b = await mint({ ...binding(2), planId: id(400) });
    expect(a.identitySha256).toBe(b.identitySha256);
    expect(a.purpose.purposeSha256).not.toBe(b.purpose.purposeSha256);
    await expect(
      assertFlightOutputClaimsV2(
        binding(2),
        await mint(binding(2)),
        [await claim()],
        sha256,
      ),
    ).rejects.toThrow("OUTPUT_PURPOSE_COLLISION");
  });
  it("does not treat changed service numbers on the same route/date as distinct legs", async () => {
    const ambiguous = { ...outbound, serviceNumber: "289" };
    expect(compareFlightOutputPurposesV2(outbound, ambiguous)).toBe("UNKNOWN");
    await expect(
      assertFlightOutputClaimsV2(
        binding(2),
        await mint(binding(2), ambiguous),
        [await claim()],
        sha256,
      ),
    ).rejects.toThrow("PREDECESSOR_OUTCOME_UNKNOWN");
  });
  it("keeps same-date reroutes and connecting observations unresolved", () => {
    expect(
      compareFlightOutputPurposesV2(outbound, {
        ...outbound,
        destinationAirportId: "IATA:WLG",
      }),
    ).toBe("UNKNOWN");
    expect(
      compareFlightOutputPurposesV2(outbound, {
        ...outbound,
        originAirportId: "IATA:CHC",
        destinationAirportId: "IATA:WLG",
      }),
    ).toBe("UNKNOWN");
    expect(
      compareFlightOutputPurposesV2(outbound, {
        ...returning,
        originDate: outbound.originDate,
      }),
    ).toBe("DISTINCT_OUTPUT");
  });
  it("keeps conflicting supplier/operating continuity UNKNOWN across dates or routes", () => {
    const supplierOccurrence = {
      namespace: "SUPPLIER",
      issuer: "NZ",
      value: "leg42",
      scopeId: "order42",
    };
    expect(
      compareFlightOutputPurposesV2(
        { ...outbound, supplierOccurrence },
        { ...returning, supplierOccurrence },
      ),
    ).toBe("UNKNOWN");
    expect(
      compareFlightOutputPurposesV2(
        { ...outbound, operatingOccurrence: "operating-leg42" },
        { ...returning, operatingOccurrence: "operating-leg42" },
      ),
    ).toBe("UNKNOWN");
    expect(
      compareFlightOutputPurposesV2(
        { ...outbound, supplierOccurrence },
        { ...returning, originDate: outbound.originDate, supplierOccurrence },
      ),
    ).toBe("UNKNOWN");
  });
  it("treats verified shared operating occurrence as one output across service aliases", () => {
    const operatingOccurrence = "operating-leg42";
    expect(
      compareFlightOutputPurposesV2(
        { ...outbound, operatingOccurrence },
        { ...outbound, operator: "SQ", serviceNumber: "4289", operatingOccurrence },
      ),
    ).toBe("SAME_OUTPUT");
  });
  it("retains supplier continuity in the certificate without changing the physical tuple fingerprint", async () => {
    const supplierOccurrence = {
      namespace: "SUPPLIER",
      issuer: "NZ",
      value: "leg42",
      scopeId: "order42",
    };
    const annotated = await mintFlightOutputPurposeV2(
      binding(),
      { ...outbound, supplierOccurrence },
      { ...evidence(), supplierOccurrence: [ref("supplier.leg")] },
      async () => {},
      sha256,
    );
    expect(annotated.identitySha256).toBe((await mint()).identitySha256);
    expect(annotated.purpose.identityFacts.supplierOccurrence).toEqual(
      supplierOccurrence,
    );
    await expect(mint(binding(), { ...outbound, supplierOccurrence })).rejects.toThrow(
      "INVALID_PROVENANCE",
    );
  });
  it("does not upgrade a legacy UNKNOWN claim into a purpose certificate", async () => {
    await expect(
      assertFlightOutputClaimsV2(
        binding(2),
        await mint(binding(2), returning),
        [
          {
            kind: "LEGACY",
            accountId: binding().accountId,
            tripId: binding().tripId,
            slotId: binding().slotId,
            outcome: "UNKNOWN",
          },
        ],
        sha256,
      ),
    ).rejects.toThrow("PREDECESSOR_OUTCOME_UNKNOWN");
  });
  it("requires authoritative no-commit recovery before releasing an unclassified claim", async () => {
    expect(
      await assertFlightOutputClaimsV2(
        binding(2),
        await mint(binding(2), returning),
        [
          {
            kind: "LEGACY",
            accountId: binding().accountId,
            tripId: binding().tripId,
            slotId: binding().slotId,
            outcome: "NO_COMMIT",
          },
        ],
        sha256,
      ),
    ).toBe("NEW_OUTPUT");
  });
  it("replays a terminal no-commit slot instead of authorizing reexecution", async () => {
    const terminal = await claim(binding(), outbound, "NO_COMMIT");
    expect(
      await assertFlightOutputClaimsV2(binding(), terminal.certified, [terminal], sha256),
    ).toBe("EXACT_REPLAY");
  });
  it("checks all claims even after an exact replay match", async () => {
    const own = await claim();
    await expect(
      assertFlightOutputClaimsV2(
        binding(),
        own.certified,
        [
          own,
          {
            kind: "LEGACY",
            accountId: binding().accountId,
            tripId: binding().tripId,
            slotId: binding(2).slotId,
            outcome: "UNKNOWN",
          },
        ],
        sha256,
      ),
    ).rejects.toThrow("PREDECESSOR_OUTCOME_UNKNOWN");
  });
  it.each(["accountId", "tripId"] as const)(
    "rejects foreign %s claim without bypassing UNKNOWN",
    async (key) => {
      const foreign = await claim({ ...binding(), [key]: id(999) });
      await expect(
        assertFlightOutputClaimsV2(
          binding(2),
          await mint(binding(2), returning),
          [foreign],
          sha256,
        ),
      ).rejects.toThrow("IMPORT_SCOPE_MISMATCH");
    },
  );
  it("rejects wrong target sharing even for different dates", async () => {
    const b = { ...binding(2), targetId: binding().targetId };
    await expect(
      assertFlightOutputClaimsV2(b, await mint(b, returning), [await claim()], sha256),
    ).rejects.toThrow("OUTPUT_TARGET_COLLISION");
  });
  it.each([
    "sourceRevision",
    "inputCatalogSha256",
    "candidateSha256",
    "sourceId",
    "targetId",
  ] as const)("rejects stale %s", async (key) => {
    const b = binding();
    const changed = {
      ...b,
      [key]:
        key === "sourceRevision" ? 2 : key.endsWith("Sha256") ? "e".repeat(64) : id(999),
    };
    await expect(
      assertFlightOutputClaimsV2(changed, await mint(b), [], sha256),
    ).rejects.toThrow("OUTPUT_PURPOSE_BINDING_MISMATCH");
  });
  it.each(["runId", "candidateId"] as const)(
    "rejects reused slot under a different %s",
    async (key) => {
      const b = { ...binding(), [key]: id(999) };
      await expect(
        assertFlightOutputClaimsV2(b, await mint(b), [await claim()], sha256),
      ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
    },
  );
  it("rejects corrupted certificates and normalized identity fingerprints", async () => {
    const c = await mint();
    await expect(
      assertFlightOutputClaimsV2(
        binding(),
        { ...c, identitySha256: "f".repeat(64) },
        [],
        sha256,
      ),
    ).rejects.toThrow("INVALID_OUTPUT_PURPOSE");
    await expect(
      assertFlightOutputClaimsV2(
        binding(),
        {
          ...c,
          purpose: { ...c.purpose, identityFacts: returning },
        },
        [],
        sha256,
      ),
    ).rejects.toThrow("INVALID_OUTPUT_PURPOSE");
  });
  it("requires owning Core verification of exact pins/identity/evidence before minting", async () => {
    const verify = vi.fn(async () => {
      throw new Error("INPUT_STALE");
    });
    await expect(
      mintFlightOutputPurposeV2(binding(), outbound, evidence(), verify, sha256),
    ).rejects.toThrow("INPUT_STALE");
    expect(verify).toHaveBeenCalledWith({
      binding: binding(),
      identityFacts: outbound,
      identityEvidenceRefs: evidence(),
    });
  });
  it("preserves opaque qualified airport identities and requires Core to qualify authored names", async () => {
    const opaque = {
      ...outbound,
      originAirportId: "fixture-airport:AKL",
      destinationAirportId: "fixture-airport:CHC",
    };
    expect((await mint(binding(), opaque)).purpose.identityFacts).toEqual(opaque);
    await expect(
      mintFlightOutputPurposeV2(
        binding(),
        { ...outbound, originAirportId: "Auckland" },
        evidence(),
        async () => {
          throw new Error("UNRESOLVED_IDENTITY");
        },
        sha256,
      ),
    ).rejects.toThrow("UNRESOLVED_IDENTITY");
  });
  it("snapshots inputs across asynchronous proof verification", async () => {
    const b = binding(),
      facts = { ...outbound },
      refs = evidence();
    const c = await mintFlightOutputPurposeV2(
      b,
      facts,
      refs,
      async (input) => {
        b.targetId = id(999);
        facts.originDate = "2026-12-21";
        refs.originDate.push(ref("altered"));
        input.binding.targetId = id(998);
      },
      sha256,
    );
    expect(c.purpose.targetId).toBe(binding().targetId);
    expect(c.purpose.identityFacts).toEqual(outbound);
    expect(c.purpose.identityEvidenceRefs).toEqual(evidence());
  });
  it("rejects sparse/partial identity, unqualified airports and impossible date", async () => {
    for (const facts of [
      { ...outbound, operator: "" },
      { ...outbound, originAirportId: "" },
      { ...outbound, originDate: "2026-02-30" },
    ])
      await expect(mint(binding(), facts)).rejects.toThrow();
    await expect(
      mintFlightOutputPurposeV2(
        binding(),
        outbound,
        { ...evidence(), originDate: [] },
        async () => {},
        sha256,
      ),
    ).rejects.toThrow();
  });
  it("rejects duplicate evidence and claim over-limit instead of ignoring part of lineage", async () => {
    await expect(
      mintFlightOutputPurposeV2(
        binding(),
        outbound,
        { ...evidence(), originDate: [ref("a"), ref("a")] },
        async () => {},
        sha256,
      ),
    ).rejects.toThrow("INVALID_PROVENANCE");
    const old = await claim();
    await expect(
      assertFlightOutputClaimsV2(binding(), old.certified, Array(65).fill(old), sha256),
    ).rejects.toThrow("IMPORT_RESOURCE_LIMIT");
  });
});
