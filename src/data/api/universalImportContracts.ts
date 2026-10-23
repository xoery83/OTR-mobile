import { z } from "zod";

const uuid = z.uuid(),
  sha = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().max(65536),
  token = z.string().min(1).max(2048);
export const universalContextSchema = z.strictObject({
  version: z.literal("otr.backend.universal-context/1"),
  actorId: uuid,
  accountId: uuid,
  tripId: uuid,
  batchId: uuid,
  taskId: uuid,
});
export type UniversalExecutionContext = z.infer<typeof universalContextSchema>;
const commonEvidence = {
  sourceId: token,
  path: token,
  raw: text,
  uncertainty: text.optional(),
};
const evidence = z.union([
  z
    .strictObject({
      ...commonEvidence,
      start: z.number().int().nonnegative(),
      end: z.number().int().positive(),
    })
    .refine((f) => f.end > f.start),
  z.strictObject({
    ...commonEvidence,
    region: z.strictObject({
      imageSha256: sha,
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      unit: z.literal("PIXELS"),
    }),
  }),
]);
const fields = z.array(evidence).max(512),
  tokens = z.array(token).max(64);
const kind = z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]);
const temporaryId = z.string().regex(/^[a-f0-9]{24}$/);
const readiness = z.strictObject({
  token,
  kind,
  minimumFacts: z.enum(["INCOMPLETE", "EVIDENCED_CANDIDATE_FACTS"]),
  missing: z.array(text).max(64),
  createReady: z.literal(false),
  formalAdmission: z.literal("OWNING_INTERFACE_UNAVAILABLE"),
});
// Wire validation only. Interpretation and evidence qualification remain Backend-owned.
export const universalResultSchema = z
  .strictObject({
    version: z.literal("otr.backend.universal-interpretation/1"),
    actorId: uuid,
    accountId: uuid,
    tripId: uuid,
    batchId: uuid,
    taskId: uuid,
    requestSha256: sha,
    promptVersion: token,
    status: z.enum(["CANDIDATES_READY", "ABSTAIN", "EXECUTION_OUTCOME_UNKNOWN"]),
    providerOutcome: z.enum(["NOT_RUN", "LOCAL_FIXTURE", "SETTLED", "UNKNOWN"]),
    providerReceipt: z
      .strictObject({
        requestId: text.nullable(),
        requestSha256: sha.nullable(),
        responseSha256: sha.nullable().optional(),
        usage: z.unknown(),
        costNanos: z.string().regex(/^\d+$/).nullable(),
      })
      .nullable(),
    sourceBindings: z
      .array(
        z.strictObject({
          alias: token,
          inputId: uuid,
          sourceId: uuid,
          representationId: uuid,
          revision: z.number().int().positive(),
          mime: token,
          originalSha256: sha,
          submittedSha256: sha.nullable(),
          status: token,
        }),
      )
      .min(1)
      .max(64),
    candidates: z
      .array(
        z.strictObject({
          id: temporaryId,
          token,
          kind,
          subtype: token,
          fields,
          bookingTokens: tokens,
          ticketTokens: tokens,
          validation: z.literal("CANDIDATE_VALIDATED"),
          admission: z.literal("NOT_RUN"),
          closure: z.literal("POLICY_PENDING"),
          visualReviewRequired: z.boolean(),
          readiness: readiness.optional(),
          presentationTier: z.enum([
            "INCOMPLETE",
            "HIGH_CONFIDENCE",
            "REVIEWABLE",
            "ABSTAIN",
          ]),
        }),
      )
      .max(64),
    bookingObservations: z
      .array(
        z.strictObject({
          id: temporaryId,
          token,
          supplier: evidence,
          reference: evidence,
          fields,
          objectTokens: tokens,
          relationCandidateWith: tokens,
        }),
      )
      .max(64),
    ticketObservations: z
      .array(
        z.strictObject({
          id: temporaryId,
          token,
          label: evidence,
          objectTokens: tokens,
          authority: z.literal("NONE"),
        }),
      )
      .max(64),
    quality: z
      .strictObject({
        decisions: z
          .array(
            z.strictObject({
              token,
              kind: token,
              tier: z.enum(["HIGH_CONFIDENCE", "REVIEWABLE", "ABSTAIN"]),
              reasons: z.array(text).max(64),
              sourceIds: tokens,
              fieldCount: z.number().int().nonnegative(),
            }),
          )
          .max(64),
        acceptedTokens: tokens,
        reviewableTokens: tokens,
        abstainedTokens: tokens,
        formalQualification: z.literal("NOT_SCORABLE"),
      })
      .nullable(),
    minimumFacts: z.array(readiness).max(64),
    // Preserve optional/unsupported Core fields intact as observations, not Canonical fields.
    sourceObservations: z.array(z.unknown()).max(1024),
    advisoryStatus: z.enum(["ABSENT", "VALID", "PARTIAL", "INVALID"]),
    advisoryIssues: z.array(text).max(1024),
    outputCoverage: z.literal("PARTIAL_COVERAGE"),
    coverageGaps: z.array(z.strictObject({ field: token, reason: text })).max(128),
    unresolved: z.array(z.strictObject({ sourceId: token, reason: text })).max(1024),
    formalReview: z.literal("NOT_RUN"),
    admission: z.literal("NOT_RUN"),
    canonicalWrites: z.literal(false),
  })
  .superRefine((r, ctx) => {
    const aliases = r.sourceBindings.map((b) => b.alias);
    if (
      new Set(aliases).size !== aliases.length ||
      new Set(r.sourceBindings.map((b) => b.representationId)).size !==
        r.sourceBindings.length
    )
      ctx.addIssue({ code: "custom", message: "UNIVERSAL_SOURCE_BINDING_INVALID" });
    const all = [
      ...r.candidates.flatMap((c) => c.fields),
      ...r.bookingObservations.flatMap((b) => [b.supplier, b.reference, ...b.fields]),
      ...r.ticketObservations.map((t) => t.label),
    ];
    if (all.some((f) => !aliases.includes(f.sourceId)))
      ctx.addIssue({ code: "custom", message: "UNIVERSAL_EVIDENCE_BINDING_INVALID" });
  });
export type UniversalImportResult = z.infer<typeof universalResultSchema>;
