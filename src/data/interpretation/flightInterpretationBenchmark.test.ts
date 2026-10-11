import { createHash } from "node:crypto";
import { admittedFlightBatch } from "./__fixtures__/flightInterpretation";
import { airNzTableText, deltaRebookingText } from "./__fixtures__/flightFirstStage1";
import { interpretFlightBatch } from "./flightInterpretation";
import { assessFlightInterpretationQuality } from "./flightInterpretationQuality";
import { describe, expect, it } from "vitest";
import {
  flightEnrichmentBenchmarkFixture,
  flightStage1SampleGold,
} from "./__fixtures__/flightEnrichmentBenchmark";
import { measureFlightBenchmark } from "./flightInterpretationBenchmark";

describe("synthetic Flight gold and cost measurements", () => {
  it.each(["A", "B"] as const)(
    "scores sanitized sample %s only on source-observable gold",
    async (sample) => {
      const batch = await admittedFlightBatch([
        sample === "A" ? airNzTableText : deltaRebookingText,
      ]);
      const set = await interpretFlightBatch(batch, {
        sha256: async (b) => createHash("sha256").update(b).digest("hex"),
        getAccountId: async () => batch.request.binding.account_id,
        now: () => "2026-10-06T00:00:00Z",
      });
      const quality = assessFlightInterpretationQuality(set);
      const input = flightEnrichmentBenchmarkFixture("LOCAL_ONLY");
      input.fixtureId = `SYNTHETIC_SAMPLE_${sample}`;
      input.execution = "OBSERVED_LOCAL";
      input.gold = flightStage1SampleGold[sample];
      input.predicted = quality.structuralCoverage.orderedByInput[0].candidateIds.map(
        (id, i) => {
          const candidate = quality.fieldSupport.find((c) => c.candidateId === id)!;
          return {
            flightKey: input.gold[i].flightKey,
            fields: Object.fromEntries(
              Object.keys(input.gold[i].criticalFields).map((path) => {
                const value = candidate.fields.find((f) => f.path === path)?.value;
                const normalized =
                  path === "service"
                    ? (value as { service_literal: string }).service_literal
                    : path.endsWith("local_time")
                      ? (value as { value: string }).value
                      : value;
                return [
                  path,
                  {
                    value: normalized!,
                    automaticallyConfirmed: false,
                    verifiedEvidence: false,
                  },
                ];
              }),
            ),
          };
        },
      );
      const result = measureFlightBenchmark(input);
      expect(result.goldMatchedCriticalFields).toBe(sample === "A" ? 12 : 4);
      expect(result.goldCriticalFieldDenominator).toBe(sample === "A" ? 12 : 4);
      expect(result.goldSegmentCount).toBe(sample === "A" ? 2 : 4);
      expect(result.missedSegments).toBe(0);
      expect(result.duplicateActualFlights).toBe(0);
      expect(result.falseConfirmedFields).toBe(0);
      expect(result.automaticConfirmationDenominator).toBe(0);
      expect(result.falseAutomaticConfirmationRate).toBeNull();
      expect(result.correctlyVerifiedCandidates).toBe(0);
      expect(result.populationAccuracy).toBe("NOT_MEASURED");
    },
  );
  it.each([
    "LOCAL_ONLY",
    "LOCAL_PLUS_PROVIDER",
    "LOCAL_PLUS_REMOTE_LLM",
    "SELECTIVE_ROUTING",
  ] as const)(
    "labels %s comparison as simulated and keeps pricing/latency unknown",
    (strategy) => {
      const result = measureFlightBenchmark(flightEnrichmentBenchmarkFixture(strategy));
      expect(result.execution).toBe("SIMULATED");
      expect(result.goldCriticalFieldDenominator).toBe(3);
      expect(result.goldMatchedCriticalFields).toBe(strategy === "LOCAL_ONLY" ? 2 : 3);
      expect(result.falseConfirmedFields).toBe(0);
      expect(result.calls.actualProvider).toBe(0);
      expect(result.calls.actualLlm).toBe(0);
      expect(result.cost.estimatedTotalMinor).toBeNull();
      expect(result.cost.actualMinorPerCorrectlyVerifiedCandidate).toBeNull();
      expect(result.populationAccuracy).toBe("NOT_MEASURED");
      expect(result.latencyMs).toBeNull();
    },
  );
  it("correct unverified model fill cannot count as verified confirmation", () => {
    const input = flightEnrichmentBenchmarkFixture("LOCAL_PLUS_REMOTE_LLM");
    input.predicted[0].fields["destination.airport"].automaticallyConfirmed = true;
    const result = measureFlightBenchmark(input);
    expect(result.falseConfirmedFields).toBe(1);
    expect(result.automaticConfirmationDenominator).toBe(1);
    expect(result.falseAutomaticConfirmationRate).toBe(1);
    expect(result.correctlyVerifiedCandidates).toBe(0);
    expect(result.candidatesNeedingCorrection).toBe(1);
  });
  it("wrong and nongold auto confirmations increase the false-confirmation guardrail", () => {
    const input = flightEnrichmentBenchmarkFixture("LOCAL_PLUS_PROVIDER");
    input.predicted[0].fields["destination.airport"].value = "LAX";
    input.predicted[0].fields["passenger"] = {
      value: "SYNTHETIC_PERSON",
      automaticallyConfirmed: true,
      verifiedEvidence: true,
    };
    const result = measureFlightBenchmark(input);
    expect(result.falseConfirmedFields).toBe(1);
    expect(result.unscoredConfirmedFields).toBe(1);
    expect(result.goldLabeledAutomaticConfirmationDenominator).toBe(3);
    expect(result.automaticConfirmationDenominator).toBe(4);
    expect(result.falseAutomaticConfirmationRate).toBe(1 / 3);
    expect(result.correctlyVerifiedCandidates).toBe(0);
  });
  it("missed and duplicate actual flights cannot inflate verified candidate counts", () => {
    const input = flightEnrichmentBenchmarkFixture("LOCAL_PLUS_PROVIDER");
    input.predicted.push(structuredClone(input.predicted[0]));
    input.gold.push({
      flightKey: "SYNTHETIC_LEG_B",
      criticalFields: { service: "XY124" },
    });
    const result = measureFlightBenchmark(input);
    expect(result.missedSegments).toBe(1);
    expect(result.duplicateActualFlights).toBe(1);
    expect(result.correctlyVerifiedCandidates).toBe(0);
    expect(result.goldCriticalFieldDenominator).toBe(4);
    expect(result.goldMatchedCriticalFields).toBe(0);
  });
  it("uses all cost categories per verified candidate and leaves omitted categories unknown", () => {
    const input = flightEnrichmentBenchmarkFixture("LOCAL_PLUS_PROVIDER");
    input.cost.estimatedMinor = {
      modelTokens: 0,
      providerRequests: 30,
      ocrDevice: 5,
      humanCorrection: 15,
    };
    const result = measureFlightBenchmark(input);
    expect(result.correctlyVerifiedCandidates).toBe(1);
    expect(result.cost.estimatedTotalMinor).toBe(50);
    expect(result.cost.estimatedMinorPerCorrectlyVerifiedCandidate).toBe(50);
    input.cost.estimatedMinor.ocrDevice = null;
    expect(
      measureFlightBenchmark(input).cost.estimatedMinorPerCorrectlyVerifiedCandidate,
    ).toBeNull();
    expect(
      measureFlightBenchmark(flightEnrichmentBenchmarkFixture("LOCAL_ONLY"))
        .falseAutomaticConfirmationRate,
    ).toBeNull();
  });
  it.each([
    "duplicate-gold",
    "unknown-gold",
    "negative-cost",
    "simulated-actual-cost",
    "local-remote-calls",
    "private-id",
  ])(
    "rejects invalid %s measurement rather than publishing a misleading result",
    (kind) => {
      const input = flightEnrichmentBenchmarkFixture("LOCAL_ONLY");
      if (kind === "duplicate-gold") input.gold.push(structuredClone(input.gold[0]));
      if (kind === "unknown-gold") input.gold[0].criticalFields.service = null;
      if (kind === "negative-cost") input.cost.estimatedMinor.modelTokens = -1;
      if (kind === "simulated-actual-cost") input.cost.actualMinor.providerRequests = 50;
      if (kind === "local-remote-calls") {
        input.execution = "OBSERVED_LOCAL";
        input.llmCalls = 1;
      }
      if (kind === "private-id") input.fixtureId = "owner-booking-reference";
      expect(() => measureFlightBenchmark(input)).toThrow();
    },
  );
  it("leaves nongold confirmations unscored and excludes them from verified cost denominator", () => {
    const input = flightEnrichmentBenchmarkFixture("LOCAL_PLUS_PROVIDER");
    input.predicted[0].fields.terminal = {
      value: "T1",
      automaticallyConfirmed: true,
      verifiedEvidence: true,
    };
    const result = measureFlightBenchmark(input);
    expect(result.falseConfirmedFields).toBe(0);
    expect(result.unscoredConfirmedFields).toBe(1);
    expect(result.correctlyVerifiedCandidates).toBe(0);
    expect(result.cost.estimatedMinorPerCorrectlyVerifiedCandidate).toBeNull();
    input.predicted[0].fields.terminal.verifiedEvidence = false;
    const unsupported = measureFlightBenchmark(input);
    expect(unsupported.unsupportedAutomaticConfirmations).toBe(1);
    expect(unsupported.falseConfirmedFields).toBe(0);
    expect(unsupported.candidatesNeedingCorrection).toBe(1);
  });
  it("keeps per-candidate cost unknown when no candidate is correctly verified", () => {
    const input = flightEnrichmentBenchmarkFixture("LOCAL_ONLY");
    input.cost.estimatedMinor = {
      modelTokens: 0,
      providerRequests: 0,
      ocrDevice: 5,
      humanCorrection: 0,
    };
    expect(
      measureFlightBenchmark(input).cost.estimatedMinorPerCorrectlyVerifiedCandidate,
    ).toBeNull();
  });
});
