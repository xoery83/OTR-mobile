import { z } from "zod";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";

const count = z.number().int().nonnegative().safe();
const costs = z.strictObject({
  modelTokens: count.nullable(),
  providerRequests: count.nullable(),
  ocrDevice: count.nullable(),
  humanCorrection: count.nullable(),
});
const field = z.strictObject({
  value: z.json(),
  automaticallyConfirmed: z.boolean(),
  verifiedEvidence: z.boolean(),
});
export const flightBenchmarkSchema = z
  .strictObject({
    fixtureId: z.string().regex(/^SYNTHETIC_[A-Z0-9_]{1,64}$/),
    strategy: z.enum([
      "LOCAL_ONLY",
      "LOCAL_PLUS_PROVIDER",
      "LOCAL_PLUS_REMOTE_LLM",
      "SELECTIVE_ROUTING",
    ]),
    execution: z.enum(["SIMULATED", "OBSERVED_LOCAL"]),
    documentCount: count,
    gold: z
      .array(
        z.strictObject({
          flightKey: z.string().regex(/^SYNTHETIC_[A-Z0-9_]{1,64}$/),
          criticalFields: z.record(z.string().min(1).max(128), z.json()),
        }),
      )
      .min(1)
      .max(64),
    predicted: z
      .array(
        z.strictObject({
          flightKey: z.string().regex(/^SYNTHETIC_[A-Z0-9_]{1,64}$/),
          fields: z.record(z.string().min(1).max(128), field),
        }),
      )
      .max(64),
    unresolvedMaterialConflicts: count,
    reviewRequests: count,
    providerCalls: count,
    llmCalls: count,
    retries: count,
    latencyMs: count.nullable(),
    cost: z.strictObject({
      currency: z.string().regex(/^[A-Z]{3}$/),
      estimatedMinor: costs,
      actualMinor: costs,
    }),
  })
  .superRefine((v, context) => {
    if (
      new Set(v.gold.map((g) => g.flightKey)).size !== v.gold.length ||
      v.gold.some(
        (g) =>
          Object.keys(g.criticalFields).length === 0 ||
          Object.values(g.criticalFields).some((f) => f === null),
      ) ||
      (v.execution === "OBSERVED_LOCAL" && (v.providerCalls || v.llmCalls)) ||
      (v.execution === "SIMULATED" &&
        Object.values(v.cost.actualMinor).some((c) => c !== null))
    )
      context.addIssue({
        code: "custom",
        message: "BENCHMARK_LABEL_OR_MEASUREMENT_INVALID",
      });
  });
export type FlightBenchmarkInput = z.input<typeof flightBenchmarkSchema>;

// Gold evaluation only; never feeds confirmation/admission or logs source content.
export function measureFlightBenchmark(input: FlightBenchmarkInput) {
  const sample = flightBenchmarkSchema.parse(input);
  const equal = (a: unknown, b: unknown) =>
    canonicalEventJson(a as Json) === canonicalEventJson(b as Json);
  let matched = 0,
    confirmed = 0,
    falseConfirmed = 0,
    labeledConfirmed = 0,
    unscoredConfirmed = 0,
    unsupportedConfirmed = 0,
    verifiedCandidates = 0;
  const correctionKeys = new Set<string>();
  for (const prediction of sample.predicted) {
    const gold = sample.gold.find((g) => g.flightKey === prediction.flightKey);
    for (const [path, field] of Object.entries(prediction.fields)) {
      const match =
        gold &&
        Object.hasOwn(gold.criticalFields, path) &&
        equal(field.value, gold.criticalFields[path]);
      if (field.automaticallyConfirmed) {
        confirmed++;
        if (!field.verifiedEvidence) {
          unsupportedConfirmed++;
          correctionKeys.add(prediction.flightKey);
        }
        if (!gold || !Object.hasOwn(gold.criticalFields, path)) {
          unscoredConfirmed++;
        } else {
          labeledConfirmed++;
          if (!match || !field.verifiedEvidence) {
            falseConfirmed++;
            correctionKeys.add(prediction.flightKey);
          }
        }
      }
    }
  }
  for (const gold of sample.gold) {
    const predictions = sample.predicted.filter((p) => p.flightKey === gold.flightKey);
    // Duplicated actual flights cannot count as correctly verified candidates.
    if (predictions.length !== 1) continue;
    const fields = predictions[0].fields;
    const keys = Object.keys(gold.criticalFields);
    matched += keys.filter(
      (k) => fields[k] && equal(fields[k].value, gold.criticalFields[k]),
    ).length;
    if (
      !correctionKeys.has(gold.flightKey) &&
      Object.entries(fields).every(
        ([path, f]) =>
          !f.automaticallyConfirmed || Object.hasOwn(gold.criticalFields, path),
      ) &&
      keys.every(
        (k) =>
          fields[k]?.automaticallyConfirmed &&
          fields[k].verifiedEvidence &&
          equal(fields[k].value, gold.criticalFields[k]),
      )
    )
      verifiedCandidates++;
  }
  const total = (values: z.infer<typeof costs>) => {
    const amounts = Object.values(values);
    if (amounts.some((v) => v === null)) return null;
    const sum = amounts.reduce<number>((n, v) => n + v!, 0);
    if (!Number.isSafeInteger(sum)) throw new Error("BENCHMARK_COST_OVERFLOW");
    return sum;
  };
  const estimatedTotalMinor = total(sample.cost.estimatedMinor);
  const actualTotalMinor = total(sample.cost.actualMinor);
  return {
    version: 1,
    fixtureId: sample.fixtureId,
    strategy: sample.strategy,
    execution: sample.execution,
    documentCount: sample.documentCount,
    goldSegmentCount: sample.gold.length,
    predictedCandidateCount: sample.predicted.length,
    goldCriticalFieldDenominator: sample.gold.reduce(
      (n, g) => n + Object.keys(g.criticalFields).length,
      0,
    ),
    goldMatchedCriticalFields: matched,
    automaticConfirmationDenominator: confirmed,
    goldLabeledAutomaticConfirmationDenominator: labeledConfirmed,
    unscoredConfirmedFields: unscoredConfirmed,
    unsupportedAutomaticConfirmations: unsupportedConfirmed,
    falseConfirmedFields: falseConfirmed,
    falseAutomaticConfirmationRate: labeledConfirmed
      ? falseConfirmed / labeledConfirmed
      : null,
    verificationScope: "EXPLICIT_SYNTHETIC_GOLD_FIELDS_ONLY" as const,
    missedSegments: sample.gold.filter(
      (g) => !sample.predicted.some((p) => p.flightKey === g.flightKey),
    ).length,
    duplicateActualFlights: [...new Set(sample.predicted.map((p) => p.flightKey))].reduce(
      (n, key) =>
        n +
        (sample.gold.some((g) => g.flightKey === key)
          ? Math.max(0, sample.predicted.filter((p) => p.flightKey === key).length - 1)
          : 0),
      0,
    ),
    unmatchedCandidates: sample.predicted.filter(
      (p) => !sample.gold.some((g) => g.flightKey === p.flightKey),
    ).length,
    correctlyVerifiedCandidates: verifiedCandidates,
    candidatesNeedingCorrection: correctionKeys.size,
    unresolvedMaterialConflicts: sample.unresolvedMaterialConflicts,
    reviewRequests: sample.reviewRequests,
    calls: {
      simulatedProvider: sample.execution === "SIMULATED" ? sample.providerCalls : 0,
      simulatedLlm: sample.execution === "SIMULATED" ? sample.llmCalls : 0,
      actualProvider: 0,
      actualLlm: 0,
      retries: sample.retries,
    },
    latencyMs: sample.latencyMs,
    cost: {
      ...sample.cost,
      estimatedTotalMinor,
      actualTotalMinor,
      estimatedMinorPerCorrectlyVerifiedCandidate:
        verifiedCandidates && estimatedTotalMinor !== null
          ? estimatedTotalMinor / verifiedCandidates
          : null,
      actualMinorPerCorrectlyVerifiedCandidate:
        verifiedCandidates && actualTotalMinor !== null
          ? actualTotalMinor / verifiedCandidates
          : null,
    },
    populationAccuracy: "NOT_MEASURED" as const,
  };
}
