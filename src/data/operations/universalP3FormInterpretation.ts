import { z } from "zod";
import { sourceReviewCivilDate } from "@/domain/trip/universalP1SourceReview";
import {
  universalContextSchema,
  universalResultSchema,
  type UniversalImportResult,
} from "../api/universalImportContracts";

// Native owns these revisions and must recapture them before reviewing or adopting fields.
export const universalP3FormContextSchema = z
  .strictObject({
    accountId: z.uuid(),
    tripId: z.uuid(),
    formId: z.string().min(1).max(128),
    formType: z.literal("P3"),
    itemId: z.uuid(),
    generation: z.number().int().nonnegative().safe(),
    revision: z.number().int().nonnegative().safe(),
    itemRevision: z.number().int().positive().safe().nullable(),
    mode: z.enum(["CREATE", "EDIT"]),
  })
  .refine((v) =>
    v.mode === "CREATE" ? v.itemRevision === null : v.itemRevision !== null,
  );
export type UniversalP3FormContext = z.infer<typeof universalP3FormContextSchema>;

const paths = {
  title: ["property.name", "title"],
  location: ["property.address"],
  startDate: ["check_in.date", "checkin.local_date", "schedule.start.local_date"],
  endDate: ["check_out.date", "checkout.local_date", "schedule.end.local_date"],
  startTime: ["check_in.time"],
  endTime: ["check_out.time"],
} as const;
type Key = keyof typeof paths;
type Evidence = UniversalImportResult["candidates"][number]["fields"][number];
type Issue = { field: string; state: "UNSUPPORTED" | "NEEDS_INPUT" };
const wire = universalResultSchema.shape;
const candidateWire = wire.candidates.element.shape;
const keySchema = z.enum(Object.keys(paths) as [Key, ...Key[]]);
// Reuse owning Evidence/Source schemas so Native never needs a synthetic conversion.
export const universalP3FormInterpretationSchema = z
  .strictObject({
    version: z.literal("otr.import.p3-form-interpretation/1"),
    context: universalP3FormContextSchema,
    task: z.strictObject({
      actorId: wire.actorId,
      batchId: wire.batchId,
      taskId: wire.taskId,
      requestSha256: wire.requestSha256,
    }),
    sourceBindings: wire.sourceBindings,
    status: wire.status,
    providerOutcome: wire.providerOutcome,
    candidates: z
      .array(
        z.strictObject({
          id: candidateWire.id,
          token: candidateWire.token,
          presentationTier: candidateWire.presentationTier,
          fields: z.partialRecord(keySchema, z.string()),
          evidence: z.partialRecord(keySchema, candidateWire.fields),
          unsupported: z
            .array(
              z.strictObject({
                field: z.string().min(1).max(2048),
                state: z.enum(["UNSUPPORTED", "NEEDS_INPUT"]),
              }),
            )
            .max(1024),
          unhandledEvidence: candidateWire.fields,
        }),
      )
      .max(64),
    sourceObservations: wire.sourceObservations,
    canonicalWrites: wire.canonicalWrites,
  })
  .superRefine((r, ctx) => {
    const aliases = r.sourceBindings.map((b) => b.alias);
    let invalid =
      new Set(aliases).size !== aliases.length ||
      new Set(r.sourceBindings.map((b) => b.representationId)).size !==
        r.sourceBindings.length ||
      new Set(r.candidates.map((c) => c.id)).size !== r.candidates.length ||
      new Set(r.candidates.map((c) => c.token)).size !== r.candidates.length ||
      ((r.status !== "CANDIDATES_READY" ||
        !["SETTLED", "LOCAL_FIXTURE"].includes(r.providerOutcome)) &&
        r.candidates.length > 0);
    for (const c of r.candidates) {
      if (invalidRange(c.fields)) invalid = true;
      if (
        c.presentationTier === "ABSTAIN" &&
        (Object.keys(c.fields).length || c.unsupported.length)
      )
        invalid = true;
      if (
        [...Object.values(c.evidence).flat(), ...c.unhandledEvidence].some(
          (f) => !aliases.includes(f.sourceId),
        )
      )
        invalid = true;
      for (const key of Object.keys(c.fields) as Key[]) {
        const facts = c.evidence[key];
        try {
          if (
            !facts?.length ||
            value(key, c.fields[key]!) !== c.fields[key] ||
            facts.some(
              (f) =>
                f.uncertainty ||
                !(paths[key] as readonly string[]).includes(f.path) ||
                value(key, f.raw) !== c.fields[key],
            )
          )
            invalid = true;
        } catch {
          invalid = true;
        }
      }
    }
    if (invalid)
      ctx.addIssue({ code: "custom", message: "P3_FORM_INTERPRETATION_INVALID" });
  });
export type UniversalP3FormInterpretation = z.infer<
  typeof universalP3FormInterpretationSchema
>;

export function isCurrentUniversalP3FormContext(
  captured: unknown,
  current: unknown,
): boolean {
  const a = universalP3FormContextSchema.safeParse(captured);
  const b = universalP3FormContextSchema.safeParse(current);
  return (
    a.success &&
    b.success &&
    (Object.keys(a.data) as (keyof UniversalP3FormContext)[]).every(
      (key) => a.data[key] === b.data[key],
    )
  );
}

function value(key: Key, raw: string): string {
  if (key === "startDate" || key === "endDate") return sourceReviewCivilDate(raw);
  if (key === "startTime" || key === "endTime") {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) throw Error("CLOCK_INVALID");
    return raw;
  }
  const text = raw.trim();
  if (!text || text.length > (key === "title" ? 200 : 500)) throw Error("TEXT_INVALID");
  return text;
}

function invalidRange(fields: Partial<Record<Key, string>>): boolean {
  return !!(
    fields.startDate &&
    fields.endDate &&
    (fields.endDate < fields.startDate ||
      (fields.endDate === fields.startDate &&
        fields.startTime &&
        fields.endTime &&
        fields.endTime < fields.startTime))
  );
}

// Pure advisory adapter over an existing owning result. No acquisition, dispatch or Save port.
export function projectUniversalP3FormInterpretation(input: {
  result: unknown;
  task: unknown;
  capturedContext: unknown;
  currentContext: unknown;
}): UniversalP3FormInterpretation | null {
  const context = universalP3FormContextSchema.safeParse(input.capturedContext);
  const task = universalContextSchema.safeParse(input.task);
  const result = universalResultSchema.safeParse(input.result);
  if (
    !context.success ||
    !task.success ||
    !result.success ||
    !isCurrentUniversalP3FormContext(context.data, input.currentContext)
  )
    return null;
  const r = result.data;
  if (
    task.data.accountId !== context.data.accountId ||
    task.data.tripId !== context.data.tripId ||
    (["actorId", "accountId", "tripId", "batchId", "taskId"] as const).some(
      (key) => r[key] !== task.data[key],
    ) ||
    (task.data.activity && task.data.activity.state !== "RESULTS_READY")
  )
    return null;
  const candidates = r.candidates.filter((c) => c.kind === "P3");
  if (
    new Set(candidates.map((c) => c.id)).size !== candidates.length ||
    new Set(candidates.map((c) => c.token)).size !== candidates.length ||
    ((r.status !== "CANDIDATES_READY" ||
      !["SETTLED", "LOCAL_FIXTURE"].includes(r.providerOutcome)) &&
      candidates.length > 0)
  )
    return null;
  const projected: UniversalP3FormInterpretation = {
    version: "otr.import.p3-form-interpretation/1",
    context: context.data,
    task: {
      actorId: r.actorId,
      batchId: r.batchId,
      taskId: r.taskId,
      requestSha256: r.requestSha256,
    },
    status: r.status,
    providerOutcome: r.providerOutcome,
    sourceBindings: r.sourceBindings,
    candidates: candidates.map((candidate) => {
      const fields: Partial<Record<Key, string>> = {};
      const evidence: Partial<Record<Key, Evidence[]>> = {};
      const unsupported: Issue[] = [];
      const mappedPaths: readonly string[] = Object.values(paths).flat();
      const unhandledEvidence = candidate.fields.filter(
        (f) => !mappedPaths.includes(f.path),
      );
      if (candidate.presentationTier !== "ABSTAIN")
        for (const field of new Set(unhandledEvidence.map((f) => f.path)))
          unsupported.push({ field, state: "UNSUPPORTED" });
      for (const key of Object.keys(paths) as Key[]) {
        const facts = candidate.fields.filter((f) =>
          (paths[key] as readonly string[]).includes(f.path),
        );
        if (!facts.length) {
          if (
            candidate.presentationTier !== "ABSTAIN" &&
            ["title", "startDate", "endDate"].includes(key)
          )
            unsupported.push({ field: key, state: "NEEDS_INPUT" });
          continue;
        }
        evidence[key] = facts;
        if (candidate.presentationTier === "ABSTAIN") continue;
        try {
          const values = facts.map((f) => value(key, f.raw));
          if (facts.some((f) => f.uncertainty) || new Set(values).size !== 1)
            throw Error("AMBIGUOUS_FIELD");
          fields[key] = values[0];
        } catch {
          unsupported.push({ field: key, state: "NEEDS_INPUT" });
        }
      }
      if (invalidRange(fields)) {
        for (const key of ["startDate", "endDate", "startTime", "endTime"] as const) {
          if (fields[key] !== undefined) {
            delete fields[key];
            unsupported.push({ field: key, state: "NEEDS_INPUT" });
          }
        }
      }
      return {
        id: candidate.id,
        token: candidate.token,
        presentationTier: candidate.presentationTier,
        fields,
        evidence,
        unsupported,
        unhandledEvidence,
      };
    }),
    sourceObservations: r.sourceObservations,
    canonicalWrites: false,
  };
  const parsed = universalP3FormInterpretationSchema.safeParse(projected);
  return parsed.success ? parsed.data : null;
}
