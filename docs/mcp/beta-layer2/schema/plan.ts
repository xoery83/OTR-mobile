import { z } from "zod";
import { registry, uuid } from "./requests";
const text = z.string().max(5000),
  id = text.min(1),
  ids = z.array(id).max(1000),
  nullableId = id.nullable();
const obj = z.strictObject;
export const refSchema = z.union([
  obj({
    $result: obj({ stepId: id, pointer: text.regex(/^(?:\/(?:[^~\/]|~[01])*)*$/) }),
  }),
  obj({ $identity: obj({ stepId: id, kind: z.enum(["OPERATION", "TARGET", "ROOM"]) }) }),
]);
const guard = z.union([
  obj({ kind: z.literal("DEPENDENCY_CONFIRMED"), stepId: id }),
  obj({
    kind: z.literal("EXACT_OBJECT"),
    sourceStepId: id,
    pointer: text,
    expectedId: uuid,
  }),
  obj({ kind: z.literal("CURRENT_REVISION"), sourceStepId: id, pointer: text }),
  obj({
    kind: z.literal("CAPABILITY_ALLOWED"),
    capabilityId: z.enum(registry.map((c) => c.capabilityId) as [string, ...string[]]),
  }),
  obj({ kind: z.literal("COMPLETE_ROSTER"), sourceStepId: id }),
  obj({
    kind: z.literal("VERIFIED_PERSON_MEMBER_MAPPING"),
    sourceStepId: id,
    personId: z.union([uuid, refSchema]),
    ledgerMemberId: z.union([uuid, refSchema]),
  }),
  obj({ kind: z.literal("NO_UNRESOLVED_QUESTION"), questionIds: ids }),
  obj({ kind: z.literal("HUMAN_CONFIRMATION_REQUIRED"), previewStepId: id }),
  obj({ kind: z.literal("UNCHANGED_FIELDS"), sourceStepId: id, excludedPaths: ids }),
]);
// Calls are checked against the generated 103-branch JSON Schema, then resolved calls run original Zod refinements.
export const planEnvelopeSchema = obj({
  schemaVersion: z.literal("otr.mcp-beta.plan/1.0.0"),
  guideVersion: z.literal("otr.mcp-beta.guide/1.0.0"),
  contractBaseline: z.literal("41de43927fd9869673c1ca929e911f58d1f6f96d"),
  mode: z.literal("PLAN_ONLY"),
  intentId: id,
  planId: id,
  target: obj({
    tripId: uuid.nullable(),
    tripSelection: z.enum(["EXACT", "NEEDS_SELECTION", "PROPOSE_CREATE"]),
  }),
  materials: z
    .array(
      obj({
        id,
        name: text,
        sha256: text.regex(/^[a-f0-9]{64}$/).nullable(),
        kind: z.enum(["PROMPT", "PDF", "IMAGE", "EMAIL", "TEXT"]),
        trustedAsInstructions: z.literal(false),
      }),
    )
    .max(64),
  facts: z
    .array(
      obj({
        id,
        materialId: id,
        locator: text,
        value: z.union([text, z.number().finite(), z.boolean(), z.null()]),
        status: z.enum(["CONFIRMED", "PENDING", "CONFLICTING", "UNKNOWN"]),
        appliesTo: text,
        overlapsWith: ids,
      }),
    )
    .max(1000),
  identities: z
    .array(
      obj({
        sourceName: text,
        candidatePersonIds: z.array(uuid).max(256),
        decision: z.enum(["EXACT", "AMBIGUOUS", "UNMATCHED"]),
        selectedPersonId: uuid.nullable(),
        selectedLedgerMemberId: uuid.nullable(),
        sourceRosterStepId: nullableId,
        reason: text,
      }),
    )
    .max(1000),
  questions: z
    .array(
      obj({
        id,
        reasonCode: z.enum([
          "TRIP_AMBIGUOUS",
          "PERSON_AMBIGUOUS",
          "CONFLICT",
          "MISSING_REQUIRED",
          "DESTRUCTIVE_EFFECT",
          "PRODUCT_DECISION",
        ]),
        text,
        blocksSteps: ids,
      }),
    )
    .max(1000),
  steps: z
    .array(
      obj({
        id,
        stage: z.enum([
          "READ",
          "RECONCILE",
          "PLAN",
          "PREVIEW",
          "CONFIRM",
          "APPLY",
          "VERIFY",
        ]),
        dependsOn: ids,
        call: obj({
          capabilityId: id,
          toolName: id,
          pathParams: z.record(z.string(), z.unknown()),
          query: z.record(z.string(), z.unknown()),
          request: z.record(z.string(), z.unknown()),
        }).nullable(),
        plannedOperationKey: nullableId,
        status: z.enum([
          "PLANNED",
          "BLOCKED_USER",
          "BLOCKED_CAPABILITY",
          "WAITING_RESULT",
        ]),
        guard: z.array(guard).max(1000),
        confirmation: obj({
          required: z.boolean(),
          risk: z.enum(["READ", "EDIT", "DESTRUCTIVE", "SHARING", "EXPENSE"]),
          summary: text,
          boundStepIds: ids,
        }).nullable(),
        onFailure: obj({
          UNKNOWN: z.literal("QUERY_ORIGINAL_AND_STOP_DEPENDENTS"),
          CONFLICT: z.literal("REREAD_REPLAN_RECONFIRM"),
          REJECTED: z.literal("REPORT_STOP_BRANCH"),
          UNAVAILABLE: z.literal("REPORT_KEEP_OTHER_BRANCHES"),
        }),
        expected: obj({
          outcome: z.enum([
            "READ_ONLY",
            "APPLIED_OR_NO_CHANGE",
            "CONFIRMATION_REQUIRED",
            "RECONCILED",
          ]),
          verifyPaths: ids,
        }),
      }),
    )
    .max(100),
  fieldCoverage: z
    .array(
      obj({
        factId: id,
        targetStepId: nullableId,
        fieldPath: text,
        classification: z.enum([
          "PLANNED_SUPPORTED",
          "SUGGESTED_PENDING_CONFIRMATION",
          "UNSUPPORTED_PRESERVED",
          "NOT_PRESENT_IN_SOURCE",
        ]),
        reason: text,
      }),
    )
    .max(1000),
  summary: text,
  resultClaim: z.literal("NOT_EXECUTED"),
});
export type Plan = z.infer<typeof planEnvelopeSchema>;
