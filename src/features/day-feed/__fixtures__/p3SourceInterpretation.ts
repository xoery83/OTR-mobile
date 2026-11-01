import {
  universalP3FormInterpretationSchema,
  type UniversalP3FormContext,
  type UniversalP3FormInterpretation,
} from "@/data/operations/universalP3FormInterpretation";
// Typed owning-output fixture only; no Source, Task, Provider or permission is created.
export function p3SourceInterpretationFixture(
  context: UniversalP3FormContext,
  fields: UniversalP3FormInterpretation["candidates"][number]["fields"],
) {
  const paths = {
    title: "property.name",
    location: "property.address",
    startDate: "check_in.date",
    endDate: "check_out.date",
    startTime: "check_in.time",
    endTime: "check_out.time",
  };
  return universalP3FormInterpretationSchema.parse({
    version: "otr.import.p3-form-interpretation/1",
    context,
    task: {
      actorId: context.accountId,
      batchId: "11111111-1111-4111-8111-111111111111",
      taskId: "22222222-2222-4222-8222-222222222222",
      requestSha256: "a".repeat(64),
    },
    sourceBindings: [
      {
        alias: "s1",
        inputId: "33333333-3333-4333-8333-333333333333",
        sourceId: "44444444-4444-4444-8444-444444444444",
        representationId: "55555555-5555-4555-8555-555555555555",
        revision: 1,
        mime: "text/plain",
        originalSha256: "b".repeat(64),
        submittedSha256: null,
        status: "BOUND",
      },
    ],
    status: "CANDIDATES_READY",
    providerOutcome: "LOCAL_FIXTURE",
    candidates: [
      {
        id: "1".repeat(24),
        token: "stay-fixture",
        presentationTier: "REVIEWABLE",
        fields,
        evidence: Object.fromEntries(
          Object.entries(fields).map(([key, raw]) => [
            key,
            [
              {
                sourceId: "s1",
                path: paths[key as keyof typeof paths],
                raw,
                start: 0,
                end: String(raw).length,
              },
            ],
          ]),
        ),
        unsupported: [],
        unhandledEvidence: [],
      },
    ],
    sourceObservations: [],
    canonicalWrites: false,
  });
}
