import { z } from "zod";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { tripImportCatalogSchemas } from "../api/tripImportCatalogContracts";
import { interpretationMaterialSchema } from "../../domain/intelligence/interpretation";
import {
  flightLocatorSchema,
  type ImportHash,
} from "../../domain/trip/flightImportReview";
import {
  coreSourcePrepareV2Schema,
  type CoreSourceProposedSlotV2,
} from "../../domain/trip/tripCoreV2SourceContract";
import { validateCoreCommand } from "../../domain/trip/tripCoreV2Commands";
import { coreUuid, coreKindTables, type CoreKind } from "../../domain/trip/tripCoreV2";
import {
  coreCanManage,
  coreCanRead,
  type CoreActor,
  type CoreGraph,
} from "../../domain/trip/tripCoreV2Mutation";
import { coreLifecycleGraphHash } from "../../domain/trip/tripCoreV2Lifecycle";
import { coreHashValue } from "../../domain/trip/tripCoreV2Read";
import { canonicalCoreJson, type Json } from "../../domain/trip/tripCoreV2Json";
import {
  sourceBookingPublishRequestSchema,
  validateSourceBookingWorkflowResult,
  type SourceBookingWorkflowPort,
} from "../../domain/trip/sourceBookingWorkflowV1";
import { bookingPublicationHashV1 } from "../../domain/trip/bookingOutputPurposeV1";

import { sourceReviewCivilDate } from "../../domain/trip/universalP1SourceReview";

const key = z.string().min(1).max(512);
const ids = z
  .array(coreUuid)
  .min(1)
  .max(64)
  .refine((a) => new Set(a).size === a.length);
const relationshipSchema = z.strictObject({
  id: key,
  kind: z.enum([
    "NEW",
    "ADDITIONAL_DOCUMENT",
    "AMENDMENT",
    "CANCELLATION",
    "DUPLICATE",
    "UNRELATED",
  ]),
  candidateIds: ids,
  evidenceRefs: z.array(key).max(64),
});
const evidenceSchema = z.strictObject({
  ref: key,
  candidateId: coreUuid,
  fieldKey: key,
  locator: flightLocatorSchema,
  raw: z.string().min(1).max(5000),
  normalization: z
    .strictObject({ rule: z.literal("ENGLISH_MONTH_CIVIL_DATE"), value: z.string() })
    .optional(),
});
export const importLifecycleRequestSchema = z.strictObject({
  version: z.literal("otr.import.lifecycle-proposal/1"),
  plans: z.array(coreSourcePrepareV2Schema).max(64),
  evidence: z.array(evidenceSchema).max(4096),
  relationships: z.array(relationshipSchema).max(64),
  rawIssues: z.array(z.strictObject({ id: key, text: z.string().max(2000) })).max(64),
  conflicts: z
    .array(
      z.strictObject({
        id: key,
        fieldKey: key,
        evidenceRefs: z.array(key).min(2).max(16),
      }),
    )
    .max(64),
  // Read snapshots from the existing owning commercial workflow, never caller-issued decisions.
  commercialReviewRequests: z.array(sourceBookingPublishRequestSchema).max(64),
});
export const importLifecycleSnapshotSchema = z.strictObject({
  materials: z.array(interpretationMaterialSchema).min(1).max(64),
  sources: z.array(tripImportCatalogSchemas.trip_sources).min(1).max(64),
  representations: z
    .array(tripImportCatalogSchemas.trip_source_representations)
    .min(1)
    .max(64),
  associations: z.array(tripImportCatalogSchemas.trip_source_associations).max(64),
});
export type ImportLifecycleSnapshot = z.infer<typeof importLifecycleSnapshotSchema>;
export type ImportLifecycleRequest = z.infer<typeof importLifecycleRequestSchema>;
const creates = new Set([
  "CREATE_ITEM",
  "CREATE_SPARSE_FLIGHT",
  "CREATE_BOOKING",
  "CREATE_ENTITLEMENT",
  "CREATE_DOCUMENT",
]);
const amendments = new Set([
  "UPDATE_BOOKING",
  "UPDATE_FLIGHT_FACTS",
  "SET_ITEM_TEXT",
  "SET_ITEM_SCHEDULE",
  "SET_ITEM_PLACE",
  "SET_STAY_DETAILS",
  "SET_RENTAL_DETAILS",
  "SET_ACTIVITY_DETAILS",
  "SET_TRANSPORT_DETAILS",
]);

// Read-only qualification, never a Core/Review issuer or a journal. Callers supply owning read snapshots.
export async function qualifyImportLifecycleProposals(
  context: AccountRequestContext,
  supplied: unknown,
  current: { actor: CoreActor; graph: CoreGraph; snapshot: ImportLifecycleSnapshot },
  deps: {
    hash: ImportHash;
    getAccountId(): Promise<string>;
    commercialReviewReader?: Pick<SourceBookingWorkflowPort, "read">;
  },
) {
  await assertAccountRequestContext(context, deps.getAccountId);
  const q = {
      ...importLifecycleRequestSchema.parse(supplied),
      ...importLifecycleSnapshotSchema.parse(current.snapshot),
    },
    { actor, graph } = structuredClone(current);
  if (
    !actor.active ||
    actor.accountId !== context.accountId ||
    actor.tripId !== context.tripId
  )
    throw new Error("IMPORT_SCOPE_NOT_AUTHORIZED");
  if (new TextEncoder().encode(canonicalCoreJson(q as Json)).length > 4194304)
    throw new Error("IMPORT_LIFECYCLE_LIMIT");
  function unique<T>(rows: T[], id: (row: T) => string) {
    const map = new Map(rows.map((row) => [id(row), row]));
    if (map.size !== rows.length) throw new Error("IMPORT_DUPLICATE_IDENTITY");
    return map;
  }
  const sources = unique(q.sources, (s) => s.id),
    materials = unique(q.materials, (m) => m.pin.id);
  unique(q.associations, (a) => a.id);
  unique(q.relationships, (r) => r.id);
  unique(q.conflicts, (c) => c.id);
  unique(q.rawIssues, (i) => i.id);
  unique(q.commercialReviewRequests, (r) => r.binding.slotId);
  const evidence = unique(q.evidence, (e) => e.ref);
  const representations = unique(q.representations, (r) => r.id);
  unique(q.plans, (p) => p.planId);
  const bytes = new Map<string, Uint8Array>();
  for (const m of q.materials) {
    const r = representations.get(m.pin.representation_id);
    const s = sources.get(m.pin.source_id),
      b = new TextEncoder().encode(m.text);
    if (
      !r ||
      r.source_id !== m.pin.source_id ||
      r.introduced_revision > m.pin.material_revision ||
      r.payload_sha256 !== m.pin.payload_sha256 ||
      r.byte_count !== m.pin.byte_count ||
      r.retention_state !== "RETAINED" ||
      r.text_content !== m.text ||
      !s ||
      s.trip_id !== context.tripId ||
      s.acquired_by !== context.accountId ||
      s.lifecycle !== "ACTIVE" ||
      s.retention_state !== "RETAINED" ||
      s.row_revision !== m.pin.observed_source_row_revision ||
      m.pin.material_revision > s.current_material_revision ||
      (m.pin.material_revision !== s.current_material_revision &&
        !m.pin.historical_selection) ||
      b.length !== m.pin.byte_count ||
      (await deps.hash(b)) !== m.pin.payload_sha256
    )
      throw new Error("IMPORT_SOURCE_EVIDENCE_STALE");
    bytes.set(m.pin.id, b);
  }
  const slots = q.plans.flatMap((plan) => plan.slots.map((slot) => ({ plan, slot })));
  if (slots.length > 64) throw new Error("IMPORT_LIFECYCLE_LIMIT");
  unique(slots, (s) => s.slot.slotId);
  unique(slots, (s) => s.slot.operationId);
  const candidates = new Map<string, typeof slots>();
  for (const s of slots) {
    const source = sources.get(s.plan.sourceId);
    if (
      !source ||
      source.trip_id !== context.tripId ||
      source.acquired_by !== context.accountId ||
      source.current_material_revision !== s.plan.sourceRevision
    )
      throw new Error("IMPORT_SOURCE_SCOPE_INVALID");
    candidates.set(s.slot.candidateId, [
      ...(candidates.get(s.slot.candidateId) ?? []),
      s,
    ]);
  }
  for (const e of evidence.values()) {
    const b = bytes.get(e.locator.input_id),
      material = materials.get(e.locator.input_id);
    const own = candidates.get(e.candidateId);
    if (
      !b ||
      !material ||
      !own ||
      own.some((s) => s.plan.sourceId !== material.pin.source_id) ||
      e.locator.kind !== "TEXT_SPAN" ||
      e.locator.start === null ||
      e.locator.end === null ||
      e.locator.end <= e.locator.start ||
      e.locator.end > b.length ||
      new TextDecoder("utf-8", { fatal: true }).decode(
        b.slice(e.locator.start, e.locator.end),
      ) !== e.raw ||
      (e.locator.excerpt !== undefined && e.locator.excerpt !== e.raw)
    )
      throw new Error("IMPORT_EVIDENCE_INVALID");
  }
  const unresolved: { relationshipId: string; candidateIds: string[]; reason: string }[] =
    [];
  const findings: { slotId: string; reason: string }[] = [];
  const eligibleNewRecords: CoreSourceProposedSlotV2[] = [],
    proposedAmendmentsAndLinks: CoreSourceProposedSlotV2[] = [];
  const relationships = q.relationships;
  const blocked = (r: (typeof relationships)[number], reason: string) =>
    unresolved.push({ relationshipId: r.id, candidateIds: r.candidateIds, reason });
  const selectedValue = (slot: CoreSourceProposedSlotV2, field: string): unknown => {
    if (
      slot.payload === null ||
      typeof slot.payload !== "object" ||
      Array.isArray(slot.payload)
    )
      return undefined;
    const p = slot.payload as Record<string, any>;
    if (
      field.startsWith("BOOKING.") &&
      ["CREATE_BOOKING", "UPDATE_BOOKING"].includes(slot.command)
    )
      return p.fields?.[field.slice(8)];
    if (field === "ROOT.title") return p.core?.title ?? p.title;
    if (
      slot.command === "CREATE_SPARSE_FLIGHT" &&
      ["flightNumberLiteral", "departureDate"].includes(field)
    )
      return p[field];
    const match = /^(START|END)\.local_date$/.exec(field);
    if (match)
      return p.family === "P5"
        ? p.endpoints?.[match[1] === "START" ? "origin" : "destination"]?.time?.local_date
        : p.schedule?.[match[1].toLowerCase()]?.local_date;
    if (field === "SERVICE.main.transport_subtype" && p.family === "P5")
      return p.service?.transport_subtype;
    return undefined;
  };
  const validEvidence = (s: (typeof slots)[number]) =>
    s.slot.selectedFields.every((field) => {
      const refs = s.slot.evidenceRefs[field];
      return (
        refs?.length &&
        refs.every((ref) => {
          const e = evidence.get(ref);
          return (
            e?.candidateId === s.slot.candidateId &&
            e.fieldKey === field &&
            selectedValue(s.slot, field) ===
              (e.normalization
                ? (() => {
                    if (
                      s.slot.command !== "CREATE_ITEM" ||
                      !(
                        (field === "START.local_date" &&
                          ["P1", "P3", "P4", "P5"].includes(
                            (s.slot.payload as { family: string }).family,
                          )) ||
                        (field === "END.local_date" &&
                          ["P3", "P4"].includes(
                            (s.slot.payload as { family: string }).family,
                          ))
                      )
                    )
                      return undefined;
                    try {
                      return sourceReviewCivilDate(e.raw) === e.normalization.value
                        ? e.normalization.value
                        : undefined;
                    } catch {
                      return undefined;
                    }
                  })()
                : e.raw)
          );
        })
      );
    });
  const targetRow = (s: (typeof slots)[number]) => {
    const kind = s.slot.target.kind;
    if (!(kind in coreKindTables)) return null;
    return (
      graph[coreKindTables[kind as CoreKind]].find(
        (row) => row.id === s.slot.target.id,
      ) ?? null
    );
  };
  const supportedTarget = (s: (typeof slots)[number]) => {
    const row = targetRow(s),
      kind = s.slot.target.kind as CoreKind;
    if (
      !row ||
      !coreCanRead(graph, actor, kind, row) ||
      !coreCanManage(graph, actor, kind, row)
    )
      return false;
    const revision = row[kind === "ITEM" ? "semantic_revision" : "revision"];
    if (
      !s.slot.baseVector?.some(
        (v) => v.kind === kind && v.id === row.id && v.revision === revision,
      )
    )
      return false;
    const candidateAssociations = q.associations.filter(
      (a) =>
        a.source_id === s.plan.sourceId &&
        a.state === "ACTIVE" &&
        a.purpose === "CONFIRMED_SUPPORT" &&
        a.confirmation_id !== null &&
        a.target_kind === (kind === "ITEM" ? "ITINERARY_EVENT" : "ITINERARY_RESERVATION"),
    );
    if (new Set(candidateAssociations.map((a) => a.target_id)).size !== 1) return false;
    return q.associations.some(
      (a) =>
        a.source_id === s.plan.sourceId &&
        a.state === "ACTIVE" &&
        a.purpose === "CONFIRMED_SUPPORT" &&
        a.target_id === row.id &&
        a.target_kind ===
          (kind === "ITEM"
            ? "ITINERARY_EVENT"
            : kind === "BOOKING"
              ? "ITINERARY_RESERVATION"
              : "") &&
        a.confirmation_id !== null &&
        (a.preview_source_revision === null ||
          a.preview_source_revision === s.plan.sourceRevision) &&
        (a.preview_input_id === null ||
          materials.get(a.preview_input_id)?.pin.source_id === s.plan.sourceId) &&
        (a.preview_representation_id === null ||
          q.materials.some(
            (m) =>
              m.pin.source_id === s.plan.sourceId &&
              m.pin.representation_id === a.preview_representation_id,
          )),
    );
  };
  const syntaxQualified = new Set<string>();
  for (const s of slots) {
    try {
      // Structural validation of the proposed envelope confers no source intent/proof authority.
      const command = validateCoreCommand({
        contractVersion: 2,
        intentVersion: 2,
        operationId: s.slot.operationId,
        tripId: context.tripId,
        command: s.slot.command,
        target: s.slot.target,
        baseVector: s.slot.baseVector,
        admission: {
          mode: s.plan.mode,
          sourceIntentId: s.slot.slotId,
          policyVersion: s.plan.policyVersion,
        },
        payload: s.slot.payload,
      });
      const payload = command.payload as Record<string, any>;
      if (
        command.command === "CREATE_BOOKING" &&
        (payload.itemIds.length ||
          payload.entitlementIds.length ||
          payload.documentIds.length)
      )
        throw new Error("COMMERCIAL_LINK_RECEIPTS_REQUIRED");
      if (
        (payload.acl?.people ?? []).some((id: string) => !actor.personIds.includes(id)) ||
        (payload.participation?.people ?? []).some(
          (id: string) => !actor.personIds.includes(id),
        ) ||
        (payload.participation?.selfPersonId != null &&
          payload.participation.selfPersonId !== actor.personId)
      )
        throw new Error("PERSON_AUTHORITY_REQUIRED");
      for (const v of command.baseVector) {
        if (!(v.kind in coreKindTables)) throw new Error("UNSUPPORTED_VECTOR");
        const kind = v.kind as CoreKind;
        const row = graph[coreKindTables[kind]].find((row) => row.id === v.id);
        if (
          v.revision === null
            ? !!row
            : !row ||
              !coreCanManage(graph, actor, kind, row) ||
              row[kind === "ITEM" ? "semantic_revision" : "revision"] !== v.revision
        )
          throw new Error("STALE_VECTOR");
      }
      if (
        typeof command.payload === "object" &&
        command.payload !== null &&
        "graphHash" in command.payload &&
        command.payload.graphHash !==
          (await coreLifecycleGraphHash(graph, actor, command, deps.hash))
      )
        throw new Error("GRAPH_CHANGED");
      syntaxQualified.add(s.slot.slotId);
    } catch {
      findings.push({
        slotId: s.slot.slotId,
        reason: "PROPOSED_COMMAND_SCOPE_OR_REVISION_INVALID",
      });
    }
  }
  const existingReviewReads = [];
  for (const request of q.commercialReviewRequests) {
    const b = request.binding;
    if (
      b.accountId !== context.accountId ||
      b.tripId !== context.tripId ||
      !sources.has(b.sourceId) ||
      !candidates.has(b.candidateId) ||
      !slots.some(
        (s) =>
          s.slot.candidateId === b.candidateId &&
          s.slot.slotId === b.slotId &&
          s.slot.operationId === b.operationId &&
          s.slot.target.id === b.targetId &&
          s.plan.planId === b.planId &&
          s.plan.sourceId === b.sourceId &&
          s.plan.sourceRevision === b.sourceRevision,
      )
    )
      throw new Error("IMPORT_COMMERCIAL_REVIEW_SCOPE_INVALID");
    const candidate = request.publication.candidate;
    if (
      ["accountId", "tripId", "sourceId", "sourceRevision", "runId", "candidateId"].some(
        (k) => candidate[k as keyof typeof candidate] !== b[k as keyof typeof b],
      ) ||
      request.publication.publicationId !== b.publicationId ||
      request.publication.inputCatalogSha256 !== b.inputCatalogSha256 ||
      (await coreHashValue(
        "otr-source-commercial-candidate-v1",
        candidate as Json,
        deps.hash,
      )) !== b.candidateSha256
    )
      throw new Error("IMPORT_COMMERCIAL_REVIEW_BINDING_INVALID");
    const reviewSlot = slots.find((s) => s.slot.slotId === b.slotId)!.slot;
    const expectedRepresentations = q.materials
      .filter((m) => m.pin.source_id === b.sourceId)
      .map((m) => m.pin.representation_id)
      .sort();
    if (
      canonicalCoreJson([...candidate.inputRepresentationIds].sort()) !==
        canonicalCoreJson(expectedRepresentations) ||
      canonicalCoreJson((reviewSlot.payload as { fields: Json }).fields) !==
        canonicalCoreJson(candidate.facts.fields)
    )
      throw new Error("IMPORT_COMMERCIAL_REVIEW_BINDING_INVALID");
    if (!deps.commercialReviewReader) continue;
    const observed = await deps.commercialReviewReader.read(
      context.accountId,
      context.tripId,
      b.planId,
    );
    await assertAccountRequestContext(context, deps.getAccountId);
    if (observed === null) continue;
    const result = await validateSourceBookingWorkflowResult(observed, b, deps.hash);
    if (
      (await bookingPublicationHashV1(request.publication, deps.hash)) !==
      result.publicationSha256
    )
      throw new Error("IMPORT_COMMERCIAL_REVIEW_STALE");
    if (result.state === "REVIEW_REQUIRED")
      existingReviewReads.push({
        request,
        read: result,
        authority: "EXISTING_COMMERCIAL_REVIEW_READ" as const,
      });
  }
  for (const r of relationships) {
    if (r.candidateIds.some((id) => !candidates.has(id))) {
      blocked(r, "UNKNOWN_CANDIDATE");
      continue;
    }
    if (
      !r.evidenceRefs.length ||
      r.evidenceRefs.some(
        (ref) =>
          !evidence.has(ref) || !r.candidateIds.includes(evidence.get(ref)!.candidateId),
      )
    ) {
      blocked(r, "RELATIONSHIP_EVIDENCE_REQUIRED");
      continue;
    }
    for (const id of r.candidateIds) {
      if (relationships.filter((other) => other.candidateIds.includes(id)).length !== 1) {
        blocked(r, "CONFLICTING_LIFECYCLE_CLASSIFICATION");
        continue;
      }
      for (const s of candidates.get(id)!) {
        if (r.kind === "DUPLICATE") {
          blocked(r, "EXACT_RECEIPT_RECOVERY_REQUIRED");
          continue;
        }
        if (!syntaxQualified.has(s.slot.slotId)) continue;
        if (
          s.slot.selectedFields.some(
            (field) => selectedValue(s.slot, field) === undefined,
          )
        ) {
          blocked(r, "OWNING_SELECTED_FIELD_SOURCE_QUALIFIER_REQUIRED");
          continue;
        }
        if (!validEvidence(s)) {
          findings.push({
            slotId: s.slot.slotId,
            reason: "TYPED_PAYLOAD_OR_FIELD_EVIDENCE_INVALID",
          });
          continue;
        }
        if (
          r.kind === "AMENDMENT" ||
          r.kind === "CANCELLATION" ||
          r.kind === "ADDITIONAL_DOCUMENT"
        ) {
          if (!supportedTarget(s)) {
            blocked(r, "TARGET_IDENTITY_AUTHORITY_OR_REVISION_UNRESOLVED");
            continue;
          }
          const commandOkay =
            r.kind === "AMENDMENT"
              ? amendments.has(s.slot.command)
              : r.kind === "CANCELLATION"
                ? s.slot.command === "CANCEL_ARRANGEMENT"
                : ["RECONCILE_BOOKING_LINKS", "RECONCILE_ITEM_DOCUMENTS"].includes(
                    s.slot.command,
                  );
          if (!commandOkay) {
            blocked(r, "LIFECYCLE_CREATE_OR_COMMAND_MISMATCH");
            continue;
          }
          proposedAmendmentsAndLinks.push(s.slot);
        } else {
          if (["CREATE_ENTITLEMENT", "CREATE_DOCUMENT"].includes(s.slot.command)) {
            blocked(r, "OWNING_ENTITLEMENT_OR_DOCUMENT_SOURCE_QUALIFIER_REQUIRED");
            continue;
          }
          if (s.slot.command === "CREATE_BOOKING") {
            const fields = (s.slot.payload as { fields: { provider?: string } }).fields;
            if (!fields.provider?.trim()) {
              blocked(r, "COMMERCIAL_SUPPLIER_IDENTITY_UNRESOLVED");
              continue;
            }
            if (
              !existingReviewReads.some(
                (read) => read.request.binding.slotId === s.slot.slotId,
              )
            ) {
              blocked(r, "COMMERCIAL_PUBLICATION_REVIEW_READ_REQUIRED");
              continue;
            }
          }
          if (
            !creates.has(s.slot.command) ||
            targetRow(s) ||
            !s.slot.baseVector?.some(
              (v) =>
                v.kind === s.slot.target.kind &&
                v.id === s.slot.target.id &&
                v.revision === null,
            )
          ) {
            blocked(r, "NEW_TARGET_OR_COMMAND_UNRESOLVED");
            continue;
          }
          if (
            slots.filter(
              (other) =>
                creates.has(other.slot.command) &&
                other.slot.target.kind === s.slot.target.kind &&
                other.slot.target.id === s.slot.target.id,
            ).length !== 1
          ) {
            blocked(r, "DUPLICATE_NEW_TARGET_PURPOSE_UNRESOLVED");
            continue;
          }
          eligibleNewRecords.push(s.slot);
        }
        findings.push({
          slotId: s.slot.slotId,
          reason: "PROPOSED_SLOT_ONLY_OWNING_ADMISSION_REQUIRED",
        });
      }
    }
  }
  for (const s of slots)
    if (!relationships.some((r) => r.candidateIds.includes(s.slot.candidateId)))
      findings.push({
        slotId: s.slot.slotId,
        reason: "LIFECYCLE_UNCLASSIFIED_NO_CREATE_FALLBACK",
      });
  const verifiedConflicts = q.conflicts.flatMap((conflict) => {
    const refs = conflict.evidenceRefs.map((ref) => evidence.get(ref));
    if (
      refs.some((e) => !e || e.fieldKey !== conflict.fieldKey) ||
      new Set(refs.map((e) => e!.raw)).size < 2
    )
      return [];
    const involved = refs.flatMap((e) =>
      (candidates.get(e!.candidateId) ?? []).filter(
        (s) =>
          s.slot.selectedFields.includes(e!.fieldKey) &&
          s.slot.evidenceRefs[e!.fieldKey]?.includes(e!.ref),
      ),
    );
    if (
      !involved.length ||
      involved.some((s) => !syntaxQualified.has(s.slot.slotId)) ||
      involved.some((s) => !supportedTarget(s)) ||
      new Set(involved.map((s) => s.slot.target.kind + ":" + s.slot.target.id)).size !== 1
    )
      return [];
    if (
      refs.some(
        (e) =>
          !involved.some(
            (s) =>
              s.slot.candidateId === e!.candidateId &&
              selectedValue(s.slot, conflict.fieldKey) === e!.raw,
          ),
      )
    )
      return [];
    return [
      {
        ...conflict,
        classification: "EVIDENCE_SUPPORTED_DIFFERENCE" as const,
        formalReview: null,
        blocker: "GENERAL_LIFECYCLE_REVIEW_ISSUER_UNAVAILABLE" as const,
      },
    ];
  });
  const qualified = new Map(
    [...eligibleNewRecords, ...proposedAmendmentsAndLinks].map((s) => [s.slotId, s]),
  );
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const slot of qualified.values())
      if (slot.dependsOn.some((id) => !qualified.has(id))) {
        qualified.delete(slot.slotId);
        for (let i = findings.length - 1; i >= 0; i--)
          if (
            findings[i].slotId === slot.slotId &&
            findings[i].reason === "PROPOSED_SLOT_ONLY_OWNING_ADMISSION_REQUIRED"
          )
            findings.splice(i, 1);
        pruned = true;
        findings.push({ slotId: slot.slotId, reason: "OWNING_DEPENDENCY_UNRESOLVED" });
      }
  }
  const lawfulProposedReviews = existingReviewReads.filter((read) =>
    qualified.has(read.request.binding.slotId),
  );
  await assertAccountRequestContext(context, deps.getAccountId);
  return {
    version: q.version,
    authority: "READ_ONLY_PROPOSAL_QUALIFICATION" as const,
    grantsAdmission: false as const,
    eligibleNewRecords: eligibleNewRecords.filter((s) => qualified.has(s.slotId)),
    proposedAmendmentsAndLinks: proposedAmendmentsAndLinks.filter((s) =>
      qualified.has(s.slotId),
    ),
    verifiedConflicts,
    lawfulProposedReviews,
    unresolved,
    unqualifiedConflicts: q.conflicts
      .filter((c) => !verifiedConflicts.some((v) => v.id === c.id))
      .map((c) => ({ ...c, reason: "CONFLICT_EVIDENCE_OR_TARGET_UNQUALIFIED" as const })),
    findings,
    rawIssues: q.rawIssues,
    receipt: null,
    confirmedRelationships: [] as never[],
  };
}
