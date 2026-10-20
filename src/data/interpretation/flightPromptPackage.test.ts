import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/cpLlm02bStage1.json";
import {
  consumeSyntheticModelTaskResult,
  stage1FixturePort,
  type SyntheticModelTaskResultV1,
} from "./__fixtures__/cpLlm02b";
import {
  prepareFlightPromptInput,
  validateFlightPromptOutput,
  type FlightPromptOutput,
} from "./flightPromptPackage";

function replay() {
  const port = stage1FixturePort();
  const output: FlightPromptOutput = {
    version: "otr-capture-flight-output-v1",
    candidates: port.candidates.map((c, i) => ({
      candidate_id: c.id,
      fields: c.targetFields.map((path) => ({
        path,
        claim:
          path === "service" && i !== 2
            ? {
                knowledge: "PRESENT",
                evidence: [
                  port.evidence.find((e) => e.path === path && e.id.startsWith(`e${i}-`))!
                    .id,
                ],
              }
            : { knowledge: "UNKNOWN", evidence: [] },
      })),
      relationships: c.targetRelationships.map((kind) => ({
        kind,
        claim: { knowledge: "UNKNOWN", evidence: [] },
      })),
    })),
  };
  const result: SyntheticModelTaskResultV1 = {
    fixture_version: "cp-llm-02b-model-task-result-fixture-v1",
    outcome: "STRUCTURED_OUTPUT",
    output,
  };
  return {
    port,
    output,
    result,
    run: () => consumeSyntheticModelTaskResult(result, port, structuredClone(port)),
  };
}

describe("CP-LLM-02B CLOSED Capture boundary", () => {
  it("retains Stage 1 assessment/decision and all four provenance layers", () => {
    const f = replay();
    f.port.humanConfirmed = [
      {
        candidateId: f.port.candidates[0].id,
        path: "origin.local_date",
        value: "2030-12-14",
        revision: 1,
      },
    ];
    const before = structuredClone(f.port);
    const r = f.run();
    expect(r.calls).toBe(0);
    expect(r.quality).toEqual(fixture.evidence.quality);
    expect(r.enrichment).toEqual(fixture.evidence.enrichment);
    expect(r.proposal?.provenance.humanConfirmed).toEqual(f.port.humanConfirmed);
    expect(r.proposal?.provenance.documentObserved).toHaveLength(f.port.evidence.length);
    expect(r.proposal?.provenance.deterministicDerived).toHaveLength(
      f.port.evidence.length,
    );
    expect(r.proposal?.grantsCanonicalAuthority).toBe(false);
    expect(f.port).toEqual(before);
  });
  it("expresses one Source to several Candidates and several Sources to one Candidate without merging identities", () => {
    const f = replay();
    const supports = f.port.evidence.filter((e) => e.path === "service");
    expect(new Set(supports.map((e) => e.sourceId)).size).toBe(2);
    // Explicit synthetic reviewed association; no model gets to broaden its own support.
    expect(supports[0].raw).toBe(supports[2].raw);
    supports[2].candidateIds.push(f.port.candidates[0].id);
    f.output.candidates[0].fields[0].claim.evidence = [supports[0].id, supports[2].id];
    const r = f.run();
    expect(r.proposal?.provenance.modelInferred.candidates).toHaveLength(3);
    expect(r.proposal?.unknownSiblingFence).toBe("UNCHANGED");
    expect(
      r.proposal?.provenance.modelInferred.candidates[2].fields[0].claim.knowledge,
    ).toBe("UNKNOWN");
    expect(
      f.port.evidence.filter(
        (e) => e.sourceId === supports[2].sourceId && e.path === "service",
      ),
    ).toHaveLength(2);
  });
  it.each([null, {}, "not JSON", { version: "old", candidates: [] }])(
    "rejects malformed output %j",
    (raw) => {
      const f = replay();
      expect(() => validateFlightPromptOutput(raw, f.port, f.port)).toThrow();
    },
  );
  it("rejects missing, mismatched or duplicate evidence", () => {
    for (const evidence of [
      [],
      ["missing"],
      [replay().port.evidence[0].id],
      ["missing", "missing"],
    ]) {
      const f = replay();
      f.output.candidates[0].fields[0].claim.evidence = evidence;
      expect(f.run).toThrow();
    }
  });
  it.each([
    "reviewRevision",
    "basis",
    "evidence",
    "humanConfirmed",
    "candidates",
  ] as const)("rejects stale %s", (key) => {
    const f = replay();
    const current = structuredClone(f.port);
    if (key === "reviewRevision") current.reviewRevision++;
    else if (key === "basis")
      current.basis = { ...fixture.evidence.quality.basis, runGeneration: 2 };
    else if (key === "evidence") current.evidence[0].raw += "changed";
    else if (key === "humanConfirmed")
      current.humanConfirmed = [
        {
          candidateId: current.candidates[0].id,
          path: "service",
          value: "human value",
          revision: 2,
        },
      ];
    else current.candidates[0].protectedFields.push("service");
    expect(() => validateFlightPromptOutput(f.output, f.port, current)).toThrow(
      "STALE_FLIGHT_EVIDENCE",
    );
  });
  it("protects reviewed fields even when model evidence supports the value", () => {
    const f = replay();
    f.port.candidates[0].protectedFields.push("service");
    expect(f.run).toThrow("PROTECTED_FLIGHT_FIELD");
  });
  it("uses human-confirmed provenance as protection even without a separate protected list", () => {
    const f = replay();
    f.port.humanConfirmed = [
      {
        candidateId: f.port.candidates[0].id,
        path: "service",
        value: "NZ123",
        revision: 1,
      },
    ];
    expect(prepareFlightPromptInput(f.port).candidates[0].targetFields).not.toContain(
      "service",
    );
    expect(f.run).toThrow("PROTECTED_FLIGHT_FIELD");
    f.output.candidates[0].fields.shift();
    expect(f.run().disposition).toBe("ADVISORY_ONLY");
  });
  it("rejects duplicate evidence identifiers in the prepared port", () => {
    const f = replay();
    f.port.evidence.push(f.port.evidence[0]);
    expect(f.run).toThrow("INVALID_FLIGHT_PORT");
  });
  it("preserves candidate grounding in the prompt and rejects another leg's service evidence", () => {
    const f = replay();
    expect(prepareFlightPromptInput(f.port).evidence[0].candidateIds).toEqual(
      f.port.evidence[0].candidateIds,
    );
    const wrongLeg = f.port.evidence.find(
      (e) => e.path === "service" && e.raw === "NZ124",
    )!;
    f.output.candidates[0].fields[0].claim.evidence = [wrongLeg.id];
    expect(f.run).toThrow("UNSUPPORTED_FLIGHT_CLAIM");
  });
  it("retains evidence IDs and locators for every inferred claim", () => {
    const f = replay();
    const p = f.run().proposal!;
    for (const c of p.provenance.modelInferred.candidates)
      for (const field of c.fields)
        for (const id of field.claim.evidence) {
          const observed = p.provenance.documentObserved.find((e) => e.id === id)!;
          expect(observed.path).toBe(field.path);
          expect(observed.candidateIds).toContain(c.candidate_id);
          expect(observed.observation).toHaveProperty("locator");
          expect(
            p.provenance.deterministicDerived.find((e) => e.id === id),
          ).toBeDefined();
        }
  });
  it("rejects oversized output", () => {
    const f = replay();
    expect(() =>
      validateFlightPromptOutput({ padding: "x".repeat(262145) }, f.port, f.port),
    ).toThrow("FLIGHT_OUTPUT_TOO_LARGE");
  });
  it.each(["live_status", "gate", "cancellation", "terminal", "published_schedule"])(
    "rejects hallucinated %s",
    (path) => {
      const f = replay();
      f.output.candidates[0].fields[0].path = path;
      expect(f.run).toThrow();
    },
  );
  it("rejects dropping or duplicating the UNKNOWN sibling", () => {
    const f = replay();
    f.output.candidates.pop();
    expect(f.run).toThrow("FLIGHT_SIBLING_MISMATCH");
    const g = replay();
    g.output.candidates[2] = g.output.candidates[0];
    expect(g.run).toThrow("FLIGHT_SIBLING_MISMATCH");
  });
  it("rejects model values/authority and unsupported relationship claims", () => {
    const f = replay();
    Object.assign(f.output.candidates[0].fields[0], { value: "invented" });
    expect(f.run).toThrow();
    const g = replay();
    g.output.candidates[0].relationships[0].claim = {
      knowledge: "PRESENT",
      evidence: [g.port.evidence[0].id],
    };
    expect(g.run).toThrow("UNSUPPORTED_FLIGHT_CLAIM");
    const h = replay();
    Object.assign(h.output, { confirmed: true });
    expect(h.run).toThrow();
  });
  it.each(["BUDGET_EXHAUSTED", "EXECUTION_UNKNOWN"] as const)(
    "defers %s without retrying or parsing output",
    (outcome) => {
      const f = replay();
      f.result.outcome = outcome;
      f.result.output = "invalid";
      expect(f.run()).toMatchObject({
        disposition: "DEFERRED",
        reason: outcome,
        calls: 0,
        enrichment: fixture.evidence.enrichment,
      });
    },
  );
  it("publishes strict generated grammar, a complete prompt and CLOSED provider", () => {
    const f = replay();
    const input = prepareFlightPromptInput(f.port);
    expect(input.package.flight_provider).toBe("NOT_CONFIGURED");
    expect(input.package.output_grammar.additionalProperties).toBe(false);
    expect(JSON.stringify(input.package.output_grammar)).toContain('"UNKNOWN"');
    for (const term of [
      "Booking",
      "Ticket",
      "Codeshare",
      "Rebooking",
      "UNKNOWN",
      "Human-reviewed",
      "untrusted",
    ])
      expect(input.package.instructions).toContain(term);
    expect(input).not.toHaveProperty("humanConfirmed");
  });
});
