import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { callSchemas, registry } from "./requests";
import { z } from "zod";
import { responseSchemas, validateSnapshot } from "./responses";
import { planEnvelopeSchema, refSchema } from "./plan";
const require = createRequire(import.meta.url),
  Ajv = require("ajv");
const schema = JSON.parse(
  readFileSync(new URL("../tool-planning.schema.json", import.meta.url), "utf8"),
);
// Existing Ajv v6 validates the compatible keyword subset; pinned Zod owns format/refinement checks.
const ajv = new Ajv({
  schemaId: "auto",
  meta: false,
  validateSchema: false,
  unknownFormats: "ignore",
  allErrors: false,
  logger: false,
});
const envelope = ajv.compile(z.toJSONSchema(planEnvelopeSchema, { io: "input" }));
const callValidators = new Map<string, any>();
const structural = (raw: any) => {
  if (!envelope(raw)) {
    structural.errors = envelope.errors;
    return false;
  }
  for (const step of raw.steps) {
    if (step.call === null) continue;
    const c = registry.find((c) => c.capabilityId === step.call?.capabilityId);
    if (!c) {
      structural.errors = "Unknown capability";
      return false;
    }
    let check = callValidators.get(c.capabilityId);
    if (!check) {
      const api = schema.$defs[schema.$defs.ApiCall.$ref.split("/").pop()];
      check = ajv.compile({ $defs: schema.$defs, ...api.oneOf[registry.indexOf(c)] });
      callValidators.set(c.capabilityId, check);
    }
    if (!check(step.call)) {
      structural.errors = check.errors;
      return false;
    }
  }
  return true;
};
structural.errors = null as any;
const fail = (message: string): never => {
  throw Error(message);
};
function refs(value: any, path: string[] = []): any[] {
  if (!value || typeof value !== "object") return [];
  if ("$result" in value || "$identity" in value) {
    refSchema.parse(value);
    return [{ value, path }];
  }
  return Object.entries(value).flatMap(([k, v]) => refs(v, [...path, k]));
}
function pointer(value: any, p: string): any {
  return p
    .split("/")
    .slice(1)
    .reduce((v, k) => v?.[k.replace(/~1/g, "/").replace(/~0/g, "~")], value);
}
function nodesAt(s: any, path: string[]): any[] {
  if (!s || typeof s !== "object") return [];
  if (!path.length)
    return s.anyOf || s.oneOf
      ? (s.anyOf ?? s.oneOf).flatMap((a: any) => nodesAt(a, []))
      : [s];
  const alternatives = (s.anyOf ?? s.oneOf ?? s.allOf ?? []).flatMap((a: any) =>
    nodesAt(a, path),
  );
  const [k, ...rest] = path;
  const child =
    s.properties?.[k] ??
    (/^\d+$/.test(k)
      ? s.items
      : typeof s.additionalProperties === "object"
        ? s.additionalProperties
        : undefined);
  return [...alternatives, ...(child ? nodesAt(child, rest) : [])];
}
function types(s: any): string[] {
  if (s.const !== undefined) return [s.const === null ? "null" : typeof s.const];
  if (s.type)
    return Array.isArray(s.type) ? s.type : [s.type === "integer" ? "number" : s.type];
  return (s.anyOf ?? s.oneOf ?? []).flatMap(types);
}
function sameReference(a: any, b: any) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function sameTargetVerify(write: any, read: any, writeId: string): boolean {
  const request = write.request,
    params = write.pathParams;
  if (
    typeof params.tripId === "string" &&
    typeof read.pathParams.tripId === "string" &&
    params.tripId !== read.pathParams.tripId
  )
    return false;
  const link = ["otr.expense.link", "otr.expense.unlink"].includes(write.capabilityId);
  const kind =
    link ||
    (write.capabilityId.startsWith("otr.p") && write.capabilityId.match(/^otr\.p[1-6]\./))
      ? "item"
      : write.capabilityId.startsWith("otr.expense.")
        ? "expense"
        : "trip";
  const expected =
    kind === "item"
      ? link
        ? request.payload?.targetId
        : request.target?.id
      : kind === "expense"
        ? params.expenseId
        : (params.tripId ?? request.tripId);
  const actual =
    kind === "item"
      ? read.pathParams.itemId
      : kind === "expense"
        ? read.pathParams.expenseId
        : read.pathParams.tripId;
  if (actual === undefined)
    return kind === "trip" || ["otr.core.collection.read"].includes(read.capabilityId);
  if (expected === undefined)
    return !!actual?.$result && actual.$result.stepId === writeId;
  if (sameReference(actual, expected)) return true;
  if (typeof actual === "string" && typeof expected === "string") return false;
  return !!actual?.$result && actual.$result.stepId === writeId;
}
function patterns(node: any): string[] {
  return [
    ...(node.pattern ? [node.pattern] : []),
    ...(node.allOf ?? []).flatMap(patterns),
  ];
}
function assignable(source: any, target: any, depth = 0): boolean {
  const { $schema: _sourceMeta, ...sourceShape } = source;
  const { $schema: _targetMeta, ...targetShape } = target;
  if (JSON.stringify(sourceShape) === JSON.stringify(targetShape)) return true;
  const sourceTypes = types(source),
    targetTypes = types(target);
  if (!sourceTypes.length || sourceTypes.some((t) => !targetTypes.includes(t)))
    return false;
  if (sourceTypes.includes("string")) {
    if (target.format === "uuid" && source.format !== "uuid") return false;
    const uuidPattern = (node: any) =>
      node.format === "uuid" ||
      patterns(node).some(
        (p) => p.includes("[0-9a-f-]{36}") || p.includes("[0-9a-fA-F]{8}"),
      );
    // UUID identity provenance is checked here; other string refinements run on resolved calls.
    if (uuidPattern(target) && !uuidPattern(source) && source.const === undefined)
      return false;
  }
  if (sourceTypes.includes("object") && depth < 8) {
    if ((target.required ?? []).some((key: string) => !source.properties?.[key]))
      return false;
    if (
      target.additionalProperties === false &&
      Object.keys(source.properties ?? {}).some((key) => !target.properties?.[key])
    )
      return false;
    for (const key of target.required ?? []) {
      const sourceNodes = nodesAt(source, [key]),
        targetNodes = nodesAt(target, [key]);
      if (sourceNodes.some((s) => !targetNodes.some((t) => assignable(s, t, depth + 1))))
        return false;
    }
  }
  return true;
}
export function validatePlan(
  raw: any,
  results: Record<string, unknown> = {},
  identities: Record<string, string> = {},
) {
  if (Buffer.byteLength(JSON.stringify(raw)) > 1048576) fail("Plan exceeds 1MiB");
  const p = planEnvelopeSchema.parse(raw);
  for (const [id, value] of Object.entries(results)) {
    const step = p.steps.find((s) => s.id === id);
    const c = registry.find((c) => c.capabilityId === step?.call?.capabilityId);
    if (!c) fail("Result without declared response");
    validateSnapshot(c!.responseSchema, value);
  }
  if (!structural(raw)) fail("Invalid Schema: " + JSON.stringify(structural.errors));
  const steps = new Map(p.steps.map((s) => [s.id, s]));
  if (steps.size !== p.steps.length) fail("Duplicate step ID");
  for (const collection of [p.facts, p.materials, p.questions])
    if (new Set(collection.map((x) => x.id)).size !== collection.length)
      fail("Duplicate evidence/question ID");
  const seen = new Set<string>(),
    ancestors = new Map<string, Set<string>>(),
    pending: string[] = [],
    stoppedByUnknown: string[] = [];
  const cap = (s: any) => registry.find((c) => c.capabilityId === s.call?.capabilityId);
  for (const s of p.steps) {
    const parents = new Set<string>();
    for (const d of s.dependsOn) {
      if (!seen.has(d)) fail("Invalid Dependency: future, missing, self or cyclic " + d);
      parents.add(d);
      for (const a of ancestors.get(d) ?? []) parents.add(a);
    }
    ancestors.set(s.id, parents);
    const isAncestor = (id: string) => parents.has(id);
    for (const located of refs(s.call)) {
      const r = located.value;
      const ref = r.$result ?? r.$identity;
      if (r.$identity && ref.stepId === s.id) {
        if (s.stage !== "APPLY") fail("Identity self-reference outside APPLY");
      } else if (!isAncestor(ref.stepId))
        fail("Invalid Dependency: result not an ancestor");
      if (r.$result) {
        const source = steps.get(ref.stepId);
        if (!source?.call) fail("Reference has no response");
        if (ref.pointer.includes("://") || ref.pointer.includes("__proto__"))
          fail("Invalid pointer");
        const response = registry.find(
          (c) => c.capabilityId === source!.call!.capabilityId,
        )!;
        const sourceNodes = nodesAt(
          z.toJSONSchema(responseSchemas[response.responseSchema], { io: "input" }),
          ref.pointer
            .split("/")
            .slice(1)
            .map((v: string) => v.replace(/~1/g, "/").replace(/~0/g, "~")),
        );
        if (!sourceNodes.length)
          fail("Unknown or untyped response pointer " + ref.pointer);
        const index = registry.findIndex((c) => c.capabilityId === s.call!.capabilityId);
        const targetNodes = nodesAt(
          z.toJSONSchema(callSchemas[index], { io: "input" }),
          located.path,
        );
        const sourceTypes = new Set(sourceNodes.flatMap(types)),
          targetTypes = new Set(targetNodes.flatMap(types));
        if (!sourceTypes.size || !targetTypes.size) fail("Untyped reference");
        const mapped = s.guard.some(
          (g: any) =>
            g.kind === "VERIFIED_PERSON_MEMBER_MAPPING" && g.sourceStepId === ref.stepId,
        );
        if (
          sourceNodes.some(
            (source) =>
              !(mapped && types(source).every((t) => t === "null")) &&
              !targetNodes.some((target) => assignable(source, target)),
          )
        )
          fail("Reference type mismatch " + ref.pointer);
      } else {
        const index = registry.findIndex((c) => c.capabilityId === s.call!.capabilityId);
        if (
          !nodesAt(
            z.toJSONSchema(callSchemas[index], { io: "input" }),
            located.path,
          ).some((n) => types(n).includes("string"))
        )
          fail("Identity reference requires a string field");
      }
    }
    for (const g of s.guard as any[]) {
      const source = g.sourceStepId ?? g.stepId ?? g.previewStepId;
      if (source && !isAncestor(source)) fail("Guard requires dependency");
      if (g.kind === "VERIFIED_PERSON_MEMBER_MAPPING") {
        if (steps.get(g.sourceStepId)?.call?.capabilityId !== "otr.people.list")
          fail("Verified mapping requires formal roster response");
        for (const v of [g.personId, g.ledgerMemberId])
          for (const located of refs(v)) {
            const r = located.value;
            if (!r.$result || r.$result.stepId !== g.sourceStepId)
              fail("Mapping identity must reference its owning roster");
          }
      }
      if (
        g.kind === "NO_UNRESOLVED_QUESTION" &&
        g.questionIds.some((id: string) => !p.questions.some((q) => q.id === id))
      )
        fail("Unknown question guard");
    }
    if (s.stage === "CONFIRM" && (s.call !== null || !s.confirmation?.required))
      fail("Confirmation must be a future human action");
    if (s.confirmation?.boundStepIds.some((id) => !steps.has(id)))
      fail("Unknown confirmation binding");
    if (s.stage === "APPLY") {
      if (!s.call || cap(s)?.effect !== "WRITE")
        fail("APPLY must name a registered write");
      const previews = p.steps.filter((a) => a.stage === "PREVIEW" && isAncestor(a.id));
      const confirmations = p.steps.filter(
        (a) =>
          a.stage === "CONFIRM" &&
          isAncestor(a.id) &&
          a.confirmation?.boundStepIds.includes(s.id),
      );
      if (!previews.length || !confirmations.length)
        fail("Missing Confirmation or Preview");
      if (
        !s.guard.some(
          (g: any) =>
            g.kind === "HUMAN_CONFIRMATION_REQUIRED" &&
            previews.some((a) => a.id === g.previewStepId),
        )
      )
        fail("Missing human confirmation guard");
      if (
        !s.guard.some(
          (g: any) =>
            g.kind === "CAPABILITY_ALLOWED" && g.capabilityId === s.call!.capabilityId,
        )
      )
        fail("Missing capability guard");
      if (!s.plannedOperationKey) fail("Missing stable operation key");
      if (
        !p.steps.some(
          (v) =>
            v.stage === "VERIFY" &&
            v.call &&
            v.dependsOn.includes(s.id) &&
            cap(v)?.effect === "READ" &&
            sameTargetVerify(s.call, v.call, s.id),
        )
      )
        fail("Missing independent verification");
      if (
        !s.call!.capabilityId.endsWith(".create") &&
        !s.guard.some((g: any) => g.kind === "CURRENT_REVISION")
      )
        fail("Missing current revision guard");
      const request: any = s.call!.request;
      const intent = request.envelope?.patchOrIntent;
      const financial =
        s.call!.capabilityId === "otr.expense.create" ||
        (s.call!.capabilityId === "otr.expense.payment_record" &&
          request.payerMemberId !== undefined) ||
        (s.call!.capabilityId === "otr.expense.update" &&
          (!intent?.patch ||
            intent.patch.participantSplit ||
            intent.patch.financial?.payerMemberId));
      if (
        s.call!.capabilityId.startsWith("otr.expense.") &&
        financial &&
        !s.guard.some((g: any) => g.kind === "VERIFIED_PERSON_MEMBER_MAPPING")
      )
        fail("Missing verified Person/Member mapping");
      if (
        s.call!.capabilityId.match(/^otr\.p[1-6]\.update$/) &&
        !s.guard.some((g: any) => g.kind === "UNCHANGED_FIELDS")
      )
        fail("Missing field preservation guard");
    } else if (cap(s)?.effect === "WRITE") fail("Write call must be APPLY");
    if (s.stage === "VERIFY" && cap(s)?.effect !== "READ")
      fail("VERIFY must use independent read");
    if (s.call && ["READ", "VERIFY"].includes(s.stage)) {
      const response = cap(s)!;
      const responseJson = z.toJSONSchema(responseSchemas[response.responseSchema], {
        io: "input",
      });
      for (const path of s.expected.verifyPaths) {
        if (
          !/^(?:\/(?:[^~\/]|~[01])*)*$/.test(path) ||
          !nodesAt(
            responseJson,
            path
              .split("/")
              .slice(1)
              .map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~")),
          ).length
        )
          fail("Wrong verification field " + path);
      }
    }
    if (s.call) {
      // UNKNOWN has no receipt; preserve statically checked future branches without executing their references.
      if (
        [...parents].some((id) => {
          const r: any = results[id];
          return r?.state === "UNKNOWN" || r?.outcome === "UNKNOWN";
        })
      ) {
        pending.push(s.id);
        stoppedByUnknown.push(s.id);
        seen.add(s.id);
        continue;
      }
      let unresolved = false;
      const resolve = (v: any): any => {
        if (!v || typeof v !== "object") return v;
        if (v.$identity) {
          const key = p.intentId + ":" + v.$identity.stepId + ":" + v.$identity.kind;
          if (identities[key] !== undefined) return z.uuid().parse(identities[key]);
          unresolved = true;
          return v;
        }
        if (v.$result) {
          const r = results[v.$result.stepId];
          if (r === undefined) {
            unresolved = true;
            return v;
          }
          const out = pointer(r, v.$result.pointer);
          if (out === undefined) fail("Missing referenced response path");
          return out;
        }
        return Array.isArray(v)
          ? v.map(resolve)
          : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
      };
      const concrete = resolve(s.call),
        index = registry.findIndex((c) => c.capabilityId === s.call!.capabilityId);
      const verifiedMembers = new Set<string>();
      for (const guard of s.guard as any[]) {
        if (
          guard.kind === "COMPLETE_ROSTER" &&
          results[guard.sourceStepId] &&
          (results[guard.sourceStepId] as any).complete !== true
        )
          fail("Incomplete roster");
        if (
          guard.kind === "VERIFIED_PERSON_MEMBER_MAPPING" &&
          results[guard.sourceStepId]
        ) {
          const roster: any = results[guard.sourceStepId],
            personId = resolve(guard.personId),
            memberId = resolve(guard.ledgerMemberId);
          if (typeof personId === "string" && typeof memberId === "string") {
            if (
              roster.tripId !== concrete.pathParams.tripId ||
              !roster.people.some(
                (p: any) =>
                  p.personId === personId &&
                  p.ledgerMemberId === memberId &&
                  p.memberMappingStatus === "VERIFIED",
              )
            )
              fail("Invalid or cross-Trip Person/Member mapping");
            verifiedMembers.add(memberId);
          }
        }
      }
      const intent = concrete.request.envelope?.patchOrIntent;
      const financialInput =
        s.call!.capabilityId === "otr.expense.create"
          ? intent?.expense
          : s.call!.capabilityId === "otr.expense.update"
            ? { ...intent?.patch?.financial, ...intent?.patch?.participantSplit }
            : s.call!.capabilityId === "otr.expense.payment_record"
              ? concrete.request
              : null;
      if (
        financialInput &&
        s.guard.some(
          (g: any) =>
            g.kind === "VERIFIED_PERSON_MEMBER_MAPPING" && results[g.sourceStepId],
        )
      ) {
        const ids = [
          financialInput.payerMemberId,
          ...(Array.isArray(financialInput.participants)
            ? financialInput.participants
            : []
          ).map((p: any) => p.memberId),
          ...(Array.isArray(financialInput.splits) ? financialInput.splits : []).map(
            (p: any) => p.memberId,
          ),
        ].filter((v: any) => typeof v === "string");
        if (ids.some((id: string) => !verifiedMembers.has(id)))
          fail("Financial member has no verified mapping guard");
      }
      if (unresolved) {
        pending.push(s.id);
        if (s.stage === "APPLY" && s.status === "PLANNED")
          fail("Unresolved write must wait");
      } else {
        callSchemas[index].parse(concrete);
        const observedBase = concrete.request.envelope?.observedBase;
        if (
          observedBase &&
          (observedBase.id !== concrete.pathParams.expenseId ||
            observedBase.journeyId !== concrete.pathParams.tripId)
        )
          fail("Expense observed base belongs to another target/Trip");
        if (
          concrete.pathParams.tripId &&
          concrete.request.tripId &&
          concrete.pathParams.tripId !== concrete.request.tripId
        )
          fail("Cross Trip payload");
      }
      if (
        cap(s)?.family &&
        concrete.query.family &&
        typeof concrete.query.family === "string" &&
        concrete.query.family !== cap(s)!.family
      )
        fail("Wrong family");
    }
    seen.add(s.id);
  }
  for (const q of p.questions)
    for (const id of q.blocksSteps) {
      const s = steps.get(id);
      if (!s) fail("Unknown blocked step");
      if (s!.status === "PLANNED") fail("Unresolved question cannot permit Apply");
    }
  const materialIds = new Set(p.materials.map((m) => m.id)),
    factIds = new Set(p.facts.map((f) => f.id));
  for (const f of p.facts) {
    if (!materialIds.has(f.materialId)) fail("Unknown fact material");
    if (f.overlapsWith.some((id) => !factIds.has(id))) fail("Unknown overlapping fact");
  }
  for (const f of p.fieldCoverage)
    if (!factIds.has(f.factId) || (f.targetStepId !== null && !steps.has(f.targetStepId)))
      fail("Invalid field coverage reference");
  for (const i of p.identities) {
    if (i.selectedPersonId && !i.candidatePersonIds.includes(i.selectedPersonId))
      fail("Selected identity absent from candidates");
    if (i.selectedLedgerMemberId && !i.sourceRosterStepId)
      fail("Member identity requires roster provenance");
    if (
      i.sourceRosterStepId &&
      steps.get(i.sourceRosterStepId)?.call?.capabilityId !== "otr.people.list"
    )
      fail("Invalid roster provenance");
  }
  return {
    status: pending.length ? "STRUCTURE_PASS_RESOLUTION_PENDING" : "STATIC_PASS",
    pendingReferenceSteps: pending,
    stoppedByUnknownSteps: stoppedByUnknown,
    executed: false,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      JSON.stringify(
        validatePlan(JSON.parse(readFileSync(process.argv[2], "utf8"))),
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(String(e));
    process.exitCode = 1;
  }
}
