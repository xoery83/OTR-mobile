import type { FlightBenchmarkInput } from "../flightInterpretationBenchmark";

// Synthetic gold and simulated strategies only; prices/latencies remain unknown.
export function flightEnrichmentBenchmarkFixture(
  strategy: FlightBenchmarkInput["strategy"],
): FlightBenchmarkInput {
  const provider = strategy === "LOCAL_PLUS_PROVIDER" || strategy === "SELECTIVE_ROUTING";
  const remote = strategy === "LOCAL_PLUS_REMOTE_LLM";
  return {
    fixtureId: "SYNTHETIC_ENRICHMENT_COMPARISON",
    strategy,
    execution: "SIMULATED",
    documentCount: 1,
    gold: [
      {
        flightKey: "SYNTHETIC_LEG_A",
        criticalFields: {
          service: "XY123",
          "origin.local_date": "2030-12-14",
          "destination.airport": "NSN",
        },
      },
    ],
    predicted: [
      {
        flightKey: "SYNTHETIC_LEG_A",
        fields: {
          service: {
            value: "XY123",
            automaticallyConfirmed: provider,
            verifiedEvidence: true,
          },
          "origin.local_date": {
            value: "2030-12-14",
            automaticallyConfirmed: provider,
            verifiedEvidence: true,
          },
          ...(provider || remote
            ? {
                "destination.airport": {
                  value: "NSN",
                  automaticallyConfirmed: provider,
                  verifiedEvidence: provider,
                },
              }
            : {}),
        },
      },
    ],
    unresolvedMaterialConflicts: 0,
    reviewRequests: 0,
    providerCalls: provider ? 1 : 0,
    llmCalls: remote ? 1 : 0,
    retries: 0,
    latencyMs: null,
    cost: {
      currency: "NZD",
      estimatedMinor: {
        modelTokens: null,
        providerRequests: null,
        ocrDevice: null,
        humanCorrection: null,
      },
      actualMinor: {
        modelTokens: null,
        providerRequests: null,
        ocrDevice: null,
        humanCorrection: null,
      },
    },
  };
}

// Partial gold: only source-observable facts, never labels for unobserved timings.
export const flightStage1SampleGold: Record<"A" | "B", FlightBenchmarkInput["gold"]> = {
  A: [
    {
      flightKey: "SYNTHETIC_RETURN_OUT",
      criticalFields: {
        "origin.place_label": "Auckland",
        "destination.place_label": "Nelson",
        "origin.local_date": "2030-12-14",
        "destination.local_date": "2030-12-14",
        "origin.local_time": "09:00",
        "destination.local_time": "10:35",
      },
    },
    {
      flightKey: "SYNTHETIC_RETURN_BACK",
      criticalFields: {
        "origin.place_label": "Nelson",
        "destination.place_label": "Auckland",
        "origin.local_date": "2030-12-22",
        "destination.local_date": "2030-12-22",
        "origin.local_time": "11:55",
        "destination.local_time": "13:25",
      },
    },
  ],
  B: ["QF0140", "DL0040", "DL0799", "DL4714"].map((service, i) => ({
    flightKey: `SYNTHETIC_REBOOK_LEG_${i}`,
    criticalFields: { service },
  })),
};
