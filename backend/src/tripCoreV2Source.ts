import { z } from "zod";
import {
  canonicalCoreJson,
  parseCoreJson,
  type Json,
} from "@/domain/trip/tripCoreV2Json";
import type { ImportHash } from "@/domain/trip/flightImportReview";
import { coreHashValue as importDigest } from "@/domain/trip/tripCoreV2Read";
import {
  mintFlightOutputPurposeV2,
  assertFlightOutputClaimsV2,
  type CertifiedFlightPurposeV2,
  type FlightOutputClaimV2,
  type FlightPurposeBindingV2,
  type FlightPurposeIdentityV2,
  type FlightPurposeEvidenceV2,
} from "@/domain/trip/flightOutputPurposeV2";
import {
  validateCoreCommand,
  coreCommandSchema,
  coreVectorEntrySchema,
  type CoreCommand,
} from "@/domain/trip/tripCoreV2Commands";

import { validateCoreReceipt, type CoreReceipt } from "@/domain/trip/tripCoreV2Receipt";
const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/),
  hash = z.string().regex(/^[0-9a-f]{64}$/);
const revision = z.number().int().positive().safe();
const key = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const ids = z
  .array(uuid)
  .max(64)
  .refine((a) => new Set(a).size === a.length);
const refs = z
  .record(key, z.array(z.string().min(1).max(512)).min(1).max(16))
  .refine((a) => Object.keys(a).length <= 256);
const targetKind = z.enum([
  "ITEM",
  "BOOKING",
  "ENTITLEMENT",
  "DOCUMENT",
  "INSTRUCTION",
  "RELATION",
]);
const proposedSlotSchema = z.strictObject({
  slotId: uuid,
  slotKey: z.string().regex(/^[A-Za-z0-9._:-]{1,32}$/),
  candidateId: uuid,
  targetKind,
  target: z.strictObject({ kind: targetKind, id: uuid }),
  command: coreCommandSchema.shape.command,
  operationId: uuid,
  dependsOn: ids,
  selectedFields: z
    .array(key)
    .min(1)
    .max(256)
    .refine((a) => new Set(a).size === a.length),
  evidenceRefs: refs,
  baseVector: z.array(coreVectorEntrySchema).min(1).max(32).nullable(),
  payload: z.json(),
});
export const coreSourcePrepareV2Schema = z
  .strictObject({
    captureVersion: z.literal(2),
    planId: uuid,
    sourceId: uuid,
    sourceRevision: revision,
    mode: z.enum(["REVIEWED_SOURCE", "AUTO_SOURCE"]),
    policyVersion: z.literal("otr.trip.auto-admit/1").nullable(),
    candidateIds: ids,
    slots: z.array(proposedSlotSchema).min(1).max(64),
  })
  .superRefine((p, c) => {
    const fail = () => c.addIssue({ code: "custom", message: "INVALID_SOURCE_PLAN" });
    if (
      (p.mode === "AUTO_SOURCE") !== (p.policyVersion !== null) ||
      new Set(p.slots.map((s) => s.slotId)).size !== p.slots.length ||
      new Set(p.slots.map((s) => s.operationId)).size !== p.slots.length ||
      new Set(p.slots.map((s) => `${s.candidateId}:${s.slotKey}:${s.targetKind}`))
        .size !== p.slots.length ||
      p.slots.some(
        (s) => !p.candidateIds.includes(s.candidateId) || s.target.kind !== s.targetKind,
      ) ||
      p.candidateIds.some((id) => !p.slots.some((s) => s.candidateId === id))
    )
      fail();
    const byId = new Map(p.slots.map((s) => [s.slotId, s]));
    const visited = new Set<string>(),
      active = new Set<string>();
    function visit(id: string) {
      if (active.has(id)) return fail();
      if (visited.has(id)) return;
      const slot = byId.get(id);
      if (!slot) return fail();
      active.add(id);
      for (const dependency of slot.dependsOn) visit(dependency);
      active.delete(id);
      visited.add(id);
    }
    for (const s of p.slots) visit(s.slotId);
  });
export const coreSourceFinalizeV2Schema = z.strictObject({
  captureVersion: z.literal(2),
  slotId: uuid,
  operationId: uuid,
  intentSha256: hash,
  domainReceiptId: uuid,
  receiptSha256: hash,
});
export type CoreSourcePrepareV2 = z.infer<typeof coreSourcePrepareV2Schema>;
export type CoreSourceProposedSlotV2 = z.infer<typeof proposedSlotSchema>;
export type CoreSourceScopeV2 = {
  actorAccountId: string;
  tripId: string;
  planId: string;
  sourceId?: string;
};
export type CoreSourceCandidateV2 = {
  candidateId: string;
  runId: string;
  candidateSha256: string;
  kind: string;
  snapshot: Json;
  identityFacts: FlightPurposeIdentityV2 | null;
  identityEvidenceRefs: FlightPurposeEvidenceV2 | null;
};
export type CoreSourceCatalogV2 = {
  actorAccountId: string;
  tripId: string;
  sourceId: string;
  sourceRevision: number;
  inputCatalogSha256: string;
  source: Json;
  inputs: Json[];
  candidates: CoreSourceCandidateV2[];
};
export type CoreSourceReceiptV2 = CoreReceipt;
export type CoreSourceStoredSlotV2 = {
  proposed: CoreSourceProposedSlotV2;
  state:
    "READY" | "BLOCKED" | "REVIEW" | "DOMAIN_SUCCEEDED" | "EVIDENCE_PENDING" | "COMPLETE";
  command: CoreCommand | null;
  intentSha256: string | null;
  certified: CertifiedFlightPurposeV2 | null;
  binding: FlightPurposeBindingV2 | null;
  receipt: CoreSourceReceiptV2 | null;
  domainReceiptId: string | null;
  errorCode: string | null;
};
export type CoreSourceStoredPlanV2 = {
  scope: CoreSourceScopeV2;
  request: CoreSourcePrepareV2;
  proposalSha256: string;
  slots: CoreSourceStoredSlotV2[];
};
export type CoreSourcePlanTransactionV2 = {
  readPlan(): Promise<CoreSourceStoredPlanV2 | null>;
  readSealedCatalog(): Promise<CoreSourceCatalogV2>;
  readClaims(): Promise<FlightOutputClaimV2[]>;
  verifyFlightEvidence(input: {
    catalog: CoreSourceCatalogV2;
    candidate: CoreSourceCandidateV2;
    binding: FlightPurposeBindingV2;
    slot: CoreSourceProposedSlotV2;
    command: CoreCommand;
    proposalSha256: string;
  }): Promise<void>;
  assertCommandAdmission(command: CoreCommand): Promise<void>;
  readCoreReceipt(
    operationId: string,
  ): Promise<{ domainReceiptId: string; receiptText: string } | null>;
  putPlan(plan: CoreSourceStoredPlanV2): Promise<void>;
  finalizeEvidence(
    slot: CoreSourceStoredSlotV2,
    receipt: CoreSourceReceiptV2,
  ): Promise<{ state: "COMPLETE" | "EVIDENCE_PENDING"; errorCode: string | null }>;
};
export type CoreSourcePlanStorageV2 = {
  // Owning implementation authenticates current scope and holds Source/claim locks through commit.
  withLockedSourcePlan<T>(
    scope: CoreSourceScopeV2,
    task: (tx: CoreSourcePlanTransactionV2) => Promise<T>,
  ): Promise<T>;
};
const json = (v: unknown) => canonicalCoreJson(v as Json);
const supported = new Set([
  "CREATE_SPARSE_FLIGHT",
  "QUALIFY_FLIGHT",
  "UPDATE_FLIGHT_FACTS",
  "REPLACE_FLIGHT_SERVICE",
]);
const reviewErrors = new Set([
  "INPUT_STALE",
  "UNRESOLVED_IDENTITY",
  "UNRESOLVED_TEMPORAL",
  "INVALID_PROVENANCE",
  "INVALID_BASE_VECTOR",
  "REVISION_CONFLICT",
  "PROTECTED_FIELD",
  "NOT_VISIBLE",
  "INVALID_DEPENDENCY_TARGET",
  "PREDECESSOR_OUTCOME_UNKNOWN",
  "OUTPUT_TARGET_COLLISION",
  "OUTPUT_PURPOSE_COLLISION",
  "CAPABILITY_CLOSED",
  "CONTRACT_UNSUPPORTED",
]);
const code = (error: unknown) =>
  error instanceof Error ? error.message : "SOURCE_ADMISSION_FAILED";

async function exactReceipt(
  tx: CoreSourcePlanTransactionV2,
  scope: CoreSourceScopeV2,
  slot: CoreSourceStoredSlotV2,
  sha256: ImportHash,
) {
  if (!slot.command || !slot.intentSha256) return null;
  const raw = await tx.readCoreReceipt(slot.command.operationId);
  if (raw === null) return null;
  const r = await validateCoreReceipt(parseCoreJson(raw.receiptText, 262144), sha256);
  if (
    r.actorAccountId !== scope.actorAccountId ||
    r.tripId !== scope.tripId ||
    r.operationId !== slot.command.operationId ||
    r.command !== slot.command.command ||
    r.intentSha256 !== slot.intentSha256
  )
    throw new Error("INVALID_DOMAIN_RECEIPT");
  if (
    r.result.created
      .concat(r.result.changed)
      .some((v) => v.kind !== "ITEM" || v.id !== slot.command!.target.id) ||
    r.result.retiredEdges.length ||
    r.result.replacement ||
    r.result.custodyGrantId ||
    r.audit.before
      .concat(r.audit.after)
      .some((v) => v.kind !== "ITEM" || v.id !== slot.command!.target.id)
  )
    throw new Error("INVALID_DOMAIN_RECEIPT");
  const expected = slot.command.baseVector;
  const actual = r.targetVector.map((v) => ({
    kind: v.kind,
    id: v.id,
    revision: v.baseRevision,
  }));
  if (
    json(actual) !== json(expected) ||
    ((r.outcome === "APPLIED" || r.outcome === "NO_CHANGE") &&
      r.targetVector.some(
        (v) =>
          v.committedRevision !==
            (r.outcome === "APPLIED" ? (v.baseRevision ?? 0) + 1 : v.baseRevision) ||
          v.committedRevision === null,
      ))
  )
    throw new Error("INVALID_DOMAIN_RECEIPT");
  return {
    receipt: r as CoreSourceReceiptV2,
    domainReceiptId: uuid.parse(raw.domainReceiptId),
  };
}
function recordReceipt(
  slot: CoreSourceStoredSlotV2,
  record: { receipt: CoreSourceReceiptV2; domainReceiptId: string },
) {
  const { receipt, domainReceiptId } = record;
  if (slot.domainReceiptId && slot.domainReceiptId !== domainReceiptId)
    throw new Error("INVALID_DOMAIN_RECEIPT");
  slot.domainReceiptId = domainReceiptId;
  if (slot.receipt && slot.receipt.receiptSha256 !== receipt.receiptSha256)
    throw new Error("INVALID_DOMAIN_RECEIPT");
  slot.receipt = receipt;
  if (receipt.outcome === "APPLIED" || receipt.outcome === "NO_CHANGE") {
    if (slot.state !== "COMPLETE" && slot.state !== "EVIDENCE_PENDING")
      slot.state = "DOMAIN_SUCCEEDED";
    slot.errorCode = null;
  } else {
    slot.state = "REVIEW";
    slot.errorCode = receipt.errorCode ?? "DOMAIN_REJECTED";
  }
}
async function assertStoredPlan(
  plan: CoreSourceStoredPlanV2,
  scope: CoreSourceScopeV2,
  sha256: ImportHash,
) {
  const request = coreSourcePrepareV2Schema.parse(plan.request);
  if (
    plan.scope.actorAccountId !== scope.actorAccountId ||
    plan.scope.tripId !== scope.tripId ||
    request.planId !== scope.planId ||
    plan.scope.planId !== scope.planId ||
    plan.scope.sourceId !== request.sourceId ||
    (scope.sourceId && scope.sourceId !== request.sourceId) ||
    plan.proposalSha256 !==
      (await importDigest("otr-trip-core-source-plan-v2", request as Json, sha256)) ||
    plan.slots.length !== request.slots.length
  )
    throw new Error("INVALID_STORED_PLAN");
  for (let i = 0; i < plan.slots.length; i++) {
    const s = plan.slots[i],
      p = request.slots[i];
    if (json(s.proposed) !== json(p)) throw new Error("INVALID_STORED_PLAN");
    if (!s.command) {
      if (s.intentSha256 || s.certified || s.binding || s.receipt || s.domainReceiptId)
        throw new Error("INVALID_STORED_PLAN");
      continue;
    }
    const c = validateCoreCommand(s.command);
    if (
      c.tripId !== scope.tripId ||
      c.operationId !== p.operationId ||
      c.command !== p.command ||
      json(c.target) !== json(p.target) ||
      json(c.payload) !== json(p.payload) ||
      c.admission.sourceIntentId !== p.slotId ||
      c.admission.mode !== request.mode ||
      c.admission.policyVersion !== request.policyVersion ||
      (p.baseVector && json(c.baseVector) !== json(p.baseVector)) ||
      s.intentSha256 !==
        (await importDigest("otr-trip-core-intent-v2", c as Json, sha256)) ||
      !s.binding ||
      !s.certified
    )
      throw new Error("INVALID_STORED_PLAN");
    const b = s.binding;
    if (
      b.accountId !== scope.actorAccountId ||
      b.tripId !== scope.tripId ||
      b.planId !== request.planId ||
      b.slotId !== p.slotId ||
      b.candidateId !== p.candidateId ||
      b.sourceId !== request.sourceId ||
      b.sourceRevision !== request.sourceRevision ||
      b.targetKind !== p.targetKind ||
      b.targetId !== p.target.id
    )
      throw new Error("INVALID_STORED_PLAN");
    // The certificate digest and its frozen binding must survive storage unchanged.
    await assertFlightOutputClaimsV2(
      b,
      s.certified,
      [{ kind: "CERTIFIED", binding: b, certified: s.certified, outcome: "UNKNOWN" }],
      sha256,
    );
  }
}
function publicPlan(plan: CoreSourceStoredPlanV2) {
  const slots = plan.slots
    .filter((s) => s.certified !== null)
    .map((s) => ({
      slotId: s.proposed.slotId,
      slotKey: s.proposed.slotKey,
      adapterKey: "otr.trip.core/2" as const,
      candidateId: s.proposed.candidateId,
      targetKind: s.proposed.targetKind,
      target: {
        kind: s.proposed.target.kind,
        candidateSlotId: null,
        existingId: s.proposed.target.id,
      },
      command: s.proposed.command,
      operationId: s.proposed.operationId,
      intentSha256: s.intentSha256,
      dependsOn: s.proposed.dependsOn,
      selectedFields: s.proposed.selectedFields,
      evidenceRefs: s.proposed.evidenceRefs,
      baseVector: s.command?.baseVector ?? s.proposed.baseVector,
      outputPurpose: s.certified!.purpose,
      state: s.state,
    }));
  const request = plan.request;
  return {
    proposalVersion: 2 as const,
    intentVersion: 2 as const,
    planId: request.planId,
    accountId: plan.scope.actorAccountId,
    tripId: plan.scope.tripId,
    sourceId: request.sourceId,
    sourceRevision: request.sourceRevision,
    candidateIds: request.candidateIds,
    mode: request.mode,
    policyVersion: request.policyVersion,
    slots,
  };
}
function preparationResult(plan: CoreSourceStoredPlanV2) {
  return {
    captureVersion: 2 as const,
    plan: publicPlan(plan),
    readyCommands: plan.slots.flatMap((s) =>
      s.state === "READY" && s.command ? [s.command] : [],
    ),
    reviewSlots: plan.slots.flatMap((s) =>
      s.errorCode ? [{ slotId: s.proposed.slotId, errorCode: s.errorCode }] : [],
    ),
  };
}

export async function prepareCoreSourcePlanV2(
  storage: CoreSourcePlanStorageV2,
  actorAccountId: string,
  tripId: string,
  input: unknown,
  sha256: ImportHash,
) {
  const request = coreSourcePrepareV2Schema.parse(structuredClone(input));
  if (new TextEncoder().encode(json(request)).length > 32768)
    throw new Error("INVALID_WIRE");
  const scope = {
    actorAccountId: uuid.parse(actorAccountId),
    tripId: uuid.parse(tripId),
    planId: request.planId,
    sourceId: request.sourceId,
  };
  const proposalSha256 = await importDigest(
    "otr-trip-core-source-plan-v2",
    request as Json,
    sha256,
  );
  return storage.withLockedSourcePlan(scope, async (tx) => {
    let plan = await tx.readPlan();
    if (
      plan &&
      (plan.proposalSha256 !== proposalSha256 || json(plan.scope) !== json(scope))
    )
      throw new Error("OPERATION_REUSE_MISMATCH");
    if (!plan)
      plan = {
        scope,
        request,
        proposalSha256,
        slots: request.slots.map((proposed) => ({
          proposed,
          state: "BLOCKED",
          command: null,
          intentSha256: null,
          certified: null,
          binding: null,
          receipt: null,
          domainReceiptId: null,
          errorCode: null,
        })),
      };
    plan = structuredClone(plan);
    await assertStoredPlan(plan, scope, sha256);
    // Recover exact recorded outcomes before fresh admission; no new operation/key is allocated.
    for (const slot of plan.slots) {
      const receipt = await exactReceipt(tx, scope, slot, sha256);
      if (receipt) recordReceipt(slot, receipt);
    }
    const needsFresh = plan.slots.some((s) => s.state === "BLOCKED");
    if (!needsFresh) {
      await tx.putPlan(plan);
      return preparationResult(plan);
    }
    const catalog = await tx.readSealedCatalog();
    if (
      catalog.actorAccountId !== actorAccountId ||
      catalog.tripId !== tripId ||
      catalog.sourceId !== request.sourceId ||
      catalog.sourceRevision !== request.sourceRevision
    )
      throw new Error("INPUT_STALE");
    const claims = await tx.readClaims();
    const remaining = new Set(
      plan.slots.filter((s) => s.state === "BLOCKED").map((s) => s.proposed.slotId),
    );
    while (remaining.size) {
      let progressed = false;
      for (const slot of plan.slots) {
        const proposed = slot.proposed;
        if (!remaining.has(proposed.slotId)) continue;
        if (proposed.dependsOn.some((id) => remaining.has(id))) continue;
        remaining.delete(proposed.slotId);
        progressed = true;
        try {
          if (
            request.mode !== "REVIEWED_SOURCE" ||
            !supported.has(proposed.command) ||
            proposed.targetKind !== "ITEM"
          )
            throw new Error("CONTRACT_UNSUPPORTED");
          const candidate = catalog.candidates.find(
            (c) => c.candidateId === proposed.candidateId,
          );
          if (
            !candidate ||
            candidate.kind !== "P2" ||
            !candidate.identityFacts ||
            !candidate.identityEvidenceRefs
          )
            throw new Error("UNRESOLVED_IDENTITY");
          const dependencies = proposed.dependsOn.map((id) =>
            plan!.slots.find((s) => s.proposed.slotId === id)!,
          );
          if (
            dependencies.some(
              (s) => !s.receipt || !["APPLIED", "NO_CHANGE"].includes(s.receipt.outcome),
            )
          ) {
            slot.errorCode = "DEPENDENCY_PENDING";
            continue;
          }
          let baseVector = proposed.baseVector;
          if (baseVector === null) {
            const targets = dependencies
              .flatMap((s) => s.receipt!.targetVector)
              .filter((v) => v.kind === "ITEM" && v.id === proposed.target.id);
            if (targets.length !== 1 || targets[0].committedRevision === null)
              throw new Error("INVALID_DEPENDENCY_TARGET");
            baseVector = [
              {
                kind: "ITEM",
                id: proposed.target.id,
                revision: targets[0].committedRevision,
              },
            ];
          }
          if (
            baseVector.length !== 1 ||
            baseVector[0].kind !== "ITEM" ||
            baseVector[0].id !== proposed.target.id ||
            (proposed.command === "CREATE_SPARSE_FLIGHT") !==
              (baseVector[0].revision === null)
          )
            throw new Error("INVALID_BASE_VECTOR");
          const command = validateCoreCommand({
            contractVersion: 2,
            intentVersion: 2,
            operationId: proposed.operationId,
            tripId,
            command: proposed.command,
            target: proposed.target,
            baseVector,
            admission: {
              mode: request.mode,
              sourceIntentId: proposed.slotId,
              policyVersion: request.policyVersion,
            },
            payload: proposed.payload,
          });
          const binding: FlightPurposeBindingV2 = {
            accountId: actorAccountId,
            tripId,
            runId: candidate.runId,
            candidateId: candidate.candidateId,
            version: 2,
            planId: request.planId,
            slotId: proposed.slotId,
            sourceId: request.sourceId,
            sourceRevision: request.sourceRevision,
            inputCatalogSha256: catalog.inputCatalogSha256,
            candidateSha256: candidate.candidateSha256,
            targetKind: "ITEM",
            targetId: proposed.target.id,
            purposeKind: "FLIGHT_OCCURRENCE",
          };
          const certified = await mintFlightOutputPurposeV2(
            binding,
            candidate.identityFacts,
            candidate.identityEvidenceRefs,
            async () =>
              tx.verifyFlightEvidence(
                structuredClone({
                  catalog,
                  candidate,
                  binding,
                  slot: proposed,
                  command,
                  proposalSha256,
                }),
              ),
            sha256,
          );
          await tx.assertCommandAdmission(structuredClone(command));
          if (proposed.command === "CREATE_SPARSE_FLIGHT")
            await assertFlightOutputClaimsV2(binding, certified, claims, sha256);
          slot.command = command;
          slot.binding = binding;
          slot.certified = certified;
          slot.intentSha256 = await importDigest(
            "otr-trip-core-intent-v2",
            command as Json,
            sha256,
          );
          slot.state = "READY";
          slot.errorCode = null;
          if (proposed.command === "CREATE_SPARSE_FLIGHT")
            claims.push({ kind: "CERTIFIED", binding, certified, outcome: "UNKNOWN" });
        } catch (error) {
          if (!reviewErrors.has(code(error))) throw error;
          slot.state = "REVIEW";
          slot.errorCode = code(error);
        }
      }
      if (!progressed) throw new Error("INVALID_SOURCE_PLAN");
    }
    await tx.putPlan(plan);
    return preparationResult(plan);
  });
}

export async function finalizeCoreSourceSlotV2(
  storage: CoreSourcePlanStorageV2,
  actorAccountId: string,
  tripId: string,
  planId: string,
  input: unknown,
  sha256: ImportHash,
) {
  const request = coreSourceFinalizeV2Schema.parse(structuredClone(input));
  const scope = {
    actorAccountId: uuid.parse(actorAccountId),
    tripId: uuid.parse(tripId),
    planId: uuid.parse(planId),
  };
  return storage.withLockedSourcePlan(scope, async (tx) => {
    const loaded = await tx.readPlan();
    if (!loaded) throw new Error("NOT_VISIBLE");
    const plan = structuredClone(loaded);
    await assertStoredPlan(plan, scope, sha256);
    const slot = plan.slots.find((s) => s.proposed.slotId === request.slotId);
    if (
      !slot?.command ||
      slot.command.operationId !== request.operationId ||
      slot.intentSha256 !== request.intentSha256
    )
      throw new Error("INVALID_DOMAIN_RECEIPT");
    const receipt = await exactReceipt(tx, scope, slot, sha256);
    if (!receipt)
      return {
        captureVersion: 2 as const,
        slotId: request.slotId,
        state: "EVIDENCE_PENDING" as const,
        errorCode: "RECEIPT_UNAVAILABLE",
      };
    if (
      receipt.receipt.receiptSha256 !== request.receiptSha256 ||
      receipt.domainReceiptId !== request.domainReceiptId
    )
      throw new Error("INVALID_DOMAIN_RECEIPT");
    recordReceipt(slot, receipt);
    if (slot.state === "REVIEW") {
      await tx.putPlan(plan);
      return {
        captureVersion: 2 as const,
        slotId: request.slotId,
        state: "EVIDENCE_PENDING" as const,
        errorCode: slot.errorCode,
      };
    }
    if (slot.state !== "COMPLETE") {
      const finalized = await tx.finalizeEvidence(slot, receipt.receipt);
      slot.state = finalized.state;
      slot.errorCode = finalized.errorCode;
      await tx.putPlan(plan);
    }
    return {
      captureVersion: 2 as const,
      slotId: request.slotId,
      state: slot.state as "COMPLETE" | "EVIDENCE_PENDING",
      errorCode: slot.errorCode,
    };
  });
}

export async function readCoreSourcePlanV2(
  storage: CoreSourcePlanStorageV2,
  actorAccountId: string,
  tripId: string,
  planId: string,
  sha256: ImportHash,
) {
  const scope = {
    actorAccountId: uuid.parse(actorAccountId),
    tripId: uuid.parse(tripId),
    planId: uuid.parse(planId),
  };
  return storage.withLockedSourcePlan(scope, async (tx) => {
    const loaded = await tx.readPlan();
    if (!loaded) throw new Error("NOT_VISIBLE");
    const plan = structuredClone(loaded);
    await assertStoredPlan(plan, scope, sha256);
    for (const slot of plan.slots) {
      const receipt = await exactReceipt(tx, scope, slot, sha256);
      if (receipt) recordReceipt(slot, receipt);
    }
    const slots = plan.slots.map((s) => ({
      slotId: s.proposed.slotId,
      operationId: s.proposed.operationId,
      targetKind: s.proposed.targetKind,
      targetId: s.command?.target.id ?? null,
      outcome:
        s.state === "COMPLETE" || s.state === "EVIDENCE_PENDING"
          ? s.state
          : (s.receipt?.outcome ??
            (s.errorCode === "DEPENDENCY_PENDING" ? "DEPENDENCY_PENDING" : "PENDING")),
      errorCode: s.errorCode,
      domainReceiptId: s.domainReceiptId,
      committedRevision:
        s.receipt?.targetVector.find(
          (v) => v.kind === s.proposed.targetKind && v.id === s.proposed.target.id,
        )?.committedRevision ?? null,
    }));
    const reviewCount = plan.slots.filter((s) => s.state === "REVIEW").length;
    const status = plan.slots.every((s) => s.state === "COMPLETE")
      ? "COMPLETE"
      : reviewCount
        ? "REVIEW"
        : plan.slots.some((s) => s.receipt)
          ? "PARTIAL"
          : "PENDING";
    return {
      captureVersion: 2 as const,
      plan: publicPlan(plan),
      status: { planId, status, slots, reviewCount },
    };
  });
}
